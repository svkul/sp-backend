import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { webConfig } from '../../config/configuration';
import { COOKIE_CSRF } from '../cookies';
import { SKIP_CSRF_KEY } from '../decorators/skip-csrf.decorator';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_HEADER = 'x-csrf-token';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(webConfig.KEY)
    private readonly web: ConfigType<typeof webConfig>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();
    if (!STATE_CHANGING.has(method)) {
      return true;
    }

    const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }

    this.assertOrigin(req);
    this.assertDoubleSubmit(req);

    return true;
  }

  /**
   * Origin/Referer must come from a trusted frontend.
   * We accept either header — some browsers strip Referer on cross-origin POSTs.
   */
  private assertOrigin(req: Request): void {
    const origin = pickHeader(req.headers['origin']);
    const referer = pickHeader(req.headers['referer']);
    const candidate = origin ?? extractOriginFromUrl(referer);

    if (!candidate) {
      throw new ForbiddenException('origin_missing');
    }
    if (!this.web.corsOrigins.includes(candidate)) {
      throw new ForbiddenException('origin_mismatch');
    }
  }

  private assertDoubleSubmit(req: Request): void {
    const cookies = (req as Request & { cookies?: Record<string, string | undefined> }).cookies;
    const cookieToken = cookies?.[COOKIE_CSRF];
    const headerToken = pickHeader(req.headers[CSRF_HEADER]);

    if (!cookieToken || !headerToken) {
      throw new ForbiddenException('csrf_missing');
    }
    if (!constantTimeEqualStr(cookieToken, headerToken)) {
      throw new ForbiddenException('csrf_mismatch');
    }
  }
}

function pickHeader(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    return typeof first === 'string' ? first.trim() || undefined : undefined;
  }
  return undefined;
}

function extractOriginFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function constantTimeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
