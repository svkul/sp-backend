import { SetMetadata } from '@nestjs/common';

/**
 * Mark a route handler as publicly accessible — JwtAuthGuard (registered as
 * APP_GUARD) will short-circuit and skip auth for any request hitting it.
 */
export const IS_PUBLIC_KEY = 'auth:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
