import { Injectable } from '@nestjs/common';
import { Prisma, type Session } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TokenService } from './token.service';

export type SessionClient = 'web' | 'ios' | 'android';

export const AUTH_EVENT = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  REFRESH_ROTATED: 'refresh_rotated',
  REFRESH_INVALID: 'refresh_invalid',
  REFRESH_EXPIRED: 'refresh_expired',
  REFRESH_REUSE_DETECTED: 'refresh_reuse_detected',
  LOGOUT: 'logout',
  LOGOUT_ALL: 'logout_all',
} as const;

export type AuthEventType = (typeof AUTH_EVENT)[keyof typeof AUTH_EVENT];

interface CreateSessionArgs {
  userId: string;
  client: SessionClient;
  deviceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

interface RotateSessionArgs {
  refreshRaw: string;
  ip?: string | null;
  userAgent?: string | null;
}

interface RotateResult {
  session: Session;
  refreshRaw: string;
}

export class InvalidRefreshTokenError extends Error {
  constructor(public readonly reason: 'invalid' | 'expired' | 'reuse_detected') {
    super(`refresh_${reason}`);
    this.name = 'InvalidRefreshTokenError';
  }
}

const SESSION_STATUS_KEY = (sid: string) => `session:status:${sid}`;
const STATUS_VALID = '1';
const STATUS_REVOKED = '0';
const STATUS_VALID_CACHE_TTL_MS = 30_000;
const STATUS_REVOKED_CACHE_TTL_MS = 15 * 60_000;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tokens: TokenService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SessionService.name);
  }

  /**
   * Create a brand-new session (called on successful login).
   * Returns the persisted Session row plus the raw refresh token to deliver to the client
   * (it is intentionally NEVER returned again — only its sha256 hash lives in the DB).
   */
  async create({
    userId,
    client,
    deviceId,
    ip,
    userAgent,
  }: CreateSessionArgs): Promise<{ session: Session; refreshRaw: string }> {
    const refreshRaw = this.tokens.generateRefreshRaw();
    const tokenHash = this.tokens.hashRefresh(refreshRaw);

    const now = Date.now();
    const expiresAt = new Date(now + this.tokens.getRefreshTtlMs(client));
    const absoluteExpiresAt = new Date(now + this.tokens.getRefreshAbsoluteMaxMs());

    const session = await this.prisma.session.create({
      data: {
        userId,
        deviceId: deviceId ?? null,
        tokenHash,
        client,
        expiresAt,
        absoluteExpiresAt,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
      },
    });

    await this.writeEvent({ userId, type: AUTH_EVENT.LOGIN_SUCCESS, client, ip, userAgent });

    return { session, refreshRaw };
  }

  /**
   * Refresh-token rotation with reuse detection.
   *
   * Atomic strategy (no SELECT FOR UPDATE needed):
   *   1. Try `updateMany WHERE tokenHash=h AND revoked=false` setting revoked=true.
   *   2. If count = 1 → we won the race; proceed to issue new session.
   *   3. If count = 0 → either token doesn't exist or it was already revoked.
   *      Look it up by hash to distinguish: missing = invalid; present+revoked = REUSE.
   *      On REUSE we revoke the whole user's chain (defense-in-depth).
   */
  async rotate({ refreshRaw, ip, userAgent }: RotateSessionArgs): Promise<RotateResult> {
    const tokenHash = this.tokens.hashRefresh(refreshRaw);
    const now = new Date();

    const claimed = await this.prisma.session.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true, revokedAt: now, lastUsedAt: now },
    });

    if (claimed.count === 0) {
      const existing = await this.prisma.session.findUnique({ where: { tokenHash } });

      if (!existing) {
        await this.writeEvent({ type: AUTH_EVENT.REFRESH_INVALID, ip, userAgent });
        throw new InvalidRefreshTokenError('invalid');
      }

      await this.handleReuse(existing.userId, existing.id, { ip, userAgent });
      throw new InvalidRefreshTokenError('reuse_detected');
    }

    const old = await this.prisma.session.findUniqueOrThrow({ where: { tokenHash } });

    if (old.expiresAt <= now || old.absoluteExpiresAt <= now) {
      await this.writeEvent({
        userId: old.userId,
        type: AUTH_EVENT.REFRESH_EXPIRED,
        client: old.client,
        ip,
        userAgent,
      });
      await this.invalidateStatusCache(old.id);
      throw new InvalidRefreshTokenError('expired');
    }

    const newRefreshRaw = this.tokens.generateRefreshRaw();
    const newTokenHash = this.tokens.hashRefresh(newRefreshRaw);
    const client = (old.client as SessionClient) ?? 'web';
    const newExpiresAt = new Date(Date.now() + this.tokens.getRefreshTtlMs(client));

    const newSession = await this.prisma.session.create({
      data: {
        userId: old.userId,
        deviceId: old.deviceId,
        tokenHash: newTokenHash,
        client: old.client,
        expiresAt: newExpiresAt,
        absoluteExpiresAt: old.absoluteExpiresAt,
        ip: ip ?? old.ip,
        userAgent: userAgent ?? old.userAgent,
      },
    });

    await this.invalidateStatusCache(old.id);

    await this.writeEvent({
      userId: old.userId,
      type: AUTH_EVENT.REFRESH_ROTATED,
      client: old.client,
      ip,
      userAgent,
      meta: { oldSid: old.id, newSid: newSession.id },
    });

    return { session: newSession, refreshRaw: newRefreshRaw };
  }

  /** Revoke a single session (e.g. logout from current device). */
  async revoke(
    sessionId: string,
    opts: { ip?: string | null; userAgent?: string | null } = {},
  ): Promise<void> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.revoked) {
      return;
    }
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revoked: true, revokedAt: new Date() },
    });
    await this.invalidateStatusCache(sessionId);
    await this.writeEvent({
      userId: session.userId,
      type: AUTH_EVENT.LOGOUT,
      client: session.client,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
    });
  }

  /** Revoke ALL active sessions for a user (logout from every device). */
  async revokeAllForUser(
    userId: string,
    opts: { ip?: string | null; userAgent?: string | null; reason?: string } = {},
  ): Promise<number> {
    const active = await this.prisma.session.findMany({
      where: { userId, revoked: false },
      select: { id: true },
    });
    if (active.length === 0) {
      return 0;
    }
    const sids = active.map((s) => s.id);
    await this.prisma.session.updateMany({
      where: { id: { in: sids } },
      data: { revoked: true, revokedAt: new Date() },
    });
    await Promise.all(sids.map((sid) => this.invalidateStatusCache(sid)));
    await this.writeEvent({
      userId,
      type: AUTH_EVENT.LOGOUT_ALL,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
      meta: { count: sids.length, reason: opts.reason ?? null },
    });
    return sids.length;
  }

  /**
   * Cached active-status check for JWT guards.
   * Cache values: '1' (valid, 30s TTL) or '0' (revoked, 15min TTL).
   * Returns true only when the session exists, is not revoked, and has not expired.
   */
  async isSessionActive(sid: string): Promise<boolean> {
    const cached = await this.redis.get(SESSION_STATUS_KEY(sid));
    if (cached === STATUS_VALID) return true;
    if (cached === STATUS_REVOKED) return false;

    const session = await this.prisma.session.findUnique({
      where: { id: sid },
      select: { revoked: true, expiresAt: true, absoluteExpiresAt: true },
    });

    const now = new Date();
    const active =
      !!session && !session.revoked && session.expiresAt > now && session.absoluteExpiresAt > now;

    await this.redis.setWithTtl(
      SESSION_STATUS_KEY(sid),
      active ? STATUS_VALID : STATUS_REVOKED,
      active ? STATUS_VALID_CACHE_TTL_MS : STATUS_REVOKED_CACHE_TTL_MS,
    );

    return active;
  }

  private async invalidateStatusCache(sid: string): Promise<void> {
    await this.redis.setWithTtl(
      SESSION_STATUS_KEY(sid),
      STATUS_REVOKED,
      STATUS_REVOKED_CACHE_TTL_MS,
    );
  }

  private async handleReuse(
    userId: string,
    suspectSessionId: string,
    opts: { ip?: string | null; userAgent?: string | null },
  ): Promise<void> {
    this.logger.warn(
      `Refresh token reuse detected for userId=${userId} sid=${suspectSessionId}; revoking all sessions`,
    );
    await this.writeEvent({
      userId,
      type: AUTH_EVENT.REFRESH_REUSE_DETECTED,
      ip: opts.ip,
      userAgent: opts.userAgent,
      meta: { suspectSessionId },
    });
    await this.revokeAllForUser(userId, {
      ip: opts.ip,
      userAgent: opts.userAgent,
      reason: 'refresh_reuse_detected',
    });
  }

  private async writeEvent(args: {
    userId?: string | null;
    type: AuthEventType;
    client?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    meta?: Prisma.InputJsonValue | null;
  }): Promise<void> {
    // Mirror the event to structured logs (`audit=true`) so it ends up in the
    // log pipeline even if the DB insert below fails. PII is intentionally
    // limited; refresh tokens and cookies are never logged here.
    this.logger.info(
      {
        audit: true,
        type: args.type,
        userId: args.userId ?? null,
        client: args.client ?? null,
        ip: args.ip ?? null,
        meta: args.meta ?? null,
      },
      'auth_event',
    );

    try {
      await this.prisma.authEvent.create({
        data: {
          userId: args.userId ?? null,
          type: args.type,
          client: args.client ?? null,
          ip: args.ip ?? null,
          userAgent: args.userAgent ?? null,
          meta: args.meta ?? Prisma.JsonNull,
        },
      });
    } catch (error) {
      this.logger.error({ err: error, type: args.type }, 'Failed to write AuthEvent');
    }
  }
}
