import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { COOKIE_ACCESS } from '../cookies';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SessionService } from '../session.service';
import { TokenService } from '../token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) {
      throw new UnauthorizedException('access_token_missing');
    }

    const payload = await this.tokens.verifyAccess(token);
    if (!payload.iat) {
      throw new UnauthorizedException('access_token_no_iat');
    }

    // Per-request session-revocation check (cached in Redis with short TTL).
    // Pushes "instant revoke" propagation to ≤30s instead of access-TTL window.
    const active = await this.sessions.isSessionActive(payload.sid);
    if (!active) {
      throw new UnauthorizedException('session_revoked');
    }

    req.user = {
      id: payload.sub,
      role: payload.role,
      sid: payload.sid,
      iat: payload.iat,
    };

    return true;
  }

  private extractToken(req: Request): string | null {
    const cookies = (req as Request & { cookies?: Record<string, string | undefined> }).cookies;
    const fromCookie = cookies?.[COOKIE_ACCESS];
    if (fromCookie) return fromCookie;

    const header = req.headers.authorization;
    if (!header) return null;
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match?.[1] ?? null;
  }
}
