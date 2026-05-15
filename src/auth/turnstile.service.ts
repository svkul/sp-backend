import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

import { cloudflareConfig } from '../config/configuration';
import { RedisService } from '../redis/redis.service';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const REQUEST_TIMEOUT_MS = 5000;
const TOKEN_LOCK_TTL_MS = 10 * 60 * 1000;

interface TurnstileResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
  action?: string;
  cdata?: string;
}

@Injectable()
export class TurnstileService {
  constructor(
    @Inject(cloudflareConfig.KEY)
    private readonly config: ConfigType<typeof cloudflareConfig>,
    private readonly redis: RedisService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TurnstileService.name);
  }

  /**
   * Verify a Turnstile token against Cloudflare siteverify.
   * Fails closed (returns false) on any network/timeout/parse error or non-success response.
   * Adds a short-lived Redis lock keyed by token hash to prevent races on parallel verifications.
   */
  async verify(token: string, remoteIp?: string, expectedAction?: string): Promise<boolean> {
    if (!token) {
      return false;
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const lockKey = `turnstile:token:${tokenHash}`;
    const lockAcquired = await this.redis.setIfNotExists(lockKey, '1', TOKEN_LOCK_TTL_MS);
    if (!lockAcquired) {
      this.logger.warn(
        `Turnstile token replay attempt detected (hashPrefix=${tokenHash.slice(0, 12)})`,
      );
      return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const body = new URLSearchParams({
        secret: this.config.turnstileSecret,
        response: token,
        idempotency_key: randomUUID(),
      });
      if (remoteIp) {
        body.set('remoteip', remoteIp);
      }

      const response = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        body,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (!response.ok) {
        this.logger.warn(`Turnstile siteverify HTTP ${response.status}`);
        return false;
      }

      const data = (await response.json()) as TurnstileResponse;

      if (!data.success) {
        this.logger.warn(
          `Turnstile verification failed: codes=${(data['error-codes'] ?? []).join(',')}`,
        );
        return false;
      }

      if (expectedAction && data.action && data.action !== expectedAction) {
        this.logger.warn(
          `Turnstile action mismatch: expected=${expectedAction} got=${data.action}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.warn('Turnstile siteverify timeout');
      } else {
        this.logger.error({ err: error }, 'Turnstile siteverify error');
      }
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
