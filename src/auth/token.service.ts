import { randomBytes, createHash } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { authConfig } from '../config/configuration';
import { accessTokenPayloadSchema, type AccessTokenPayload } from '../shared/schemas/auth.schemas';

type SessionClient = 'web' | 'ios' | 'android';

interface SignAccessArgs {
  userId: string;
  role: 'USER' | 'ADMIN';
  sid: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  /**
   * Sign a short-lived access JWT. Issuer / audience / expiresIn / algorithm
   * are set globally in JwtModule registration; we only pass claims here.
   */
  async signAccess({ userId, role, sid }: SignAccessArgs): Promise<string> {
    return this.jwt.signAsync({ sub: userId, role, sid });
  }

  /**
   * Verify an access JWT and return its strongly-typed payload.
   * Throws UnauthorizedException on any signature / claim / shape mismatch.
   */
  async verifyAccess(token: string): Promise<AccessTokenPayload> {
    try {
      const raw = await this.jwt.verifyAsync<Record<string, unknown>>(token);
      const parsed = accessTokenPayloadSchema.safeParse(raw);
      if (!parsed.success) {
        throw new UnauthorizedException('invalid_token_payload');
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('invalid_token');
    }
  }

  /**
   * Generate a high-entropy opaque refresh token (32 bytes, base64url).
   * The raw value is delivered to the client; only its sha256 hash is stored in DB.
   */
  generateRefreshRaw(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Deterministic sha256 hash of a refresh token, used as the DB lookup key.
   * sha256 is sufficient here because refresh tokens are random 256-bit secrets
   * (no need for slow KDF / Argon2 — those are for low-entropy user passwords).
   */
  hashRefresh(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Refresh-token TTL (ms) per client kind. Drives both DB `expiresAt`
   * and the refresh cookie / mobile bearer expiry.
   */
  getRefreshTtlMs(client: SessionClient): number {
    return client === 'web'
      ? this.config.refreshTokenTtlWebMs
      : this.config.refreshTokenTtlMobileMs;
  }

  /** Absolute end of a refresh chain since first login (capped per session.create). */
  getRefreshAbsoluteMaxMs(): number {
    return this.config.refreshTokenAbsoluteMaxMs;
  }
}
