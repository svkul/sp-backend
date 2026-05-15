import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../types';

/**
 * Resolve the authenticated user populated by `JwtAuthGuard`.
 * Throws at runtime if used on a route that wasn't protected by the guard
 * (would otherwise silently inject undefined and lead to obscure bugs).
 */
export const CurrentUser = createParamDecorator<keyof AuthenticatedUser | undefined>(
  (field, ctx: ExecutionContext): unknown => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const user = req.user;
    if (!user) {
      throw new Error('CurrentUser used on a route without JwtAuthGuard');
    }
    return field ? user[field] : user;
  },
);
