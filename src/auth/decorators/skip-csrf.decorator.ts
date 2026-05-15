import { SetMetadata } from '@nestjs/common';

/**
 * Opt a state-changing route OUT of CSRF double-submit + Origin checks.
 * Reserved for explicitly anonymous endpoints that already have an alternative
 * defense (e.g. /auth/google/start is protected by Turnstile).
 */
export const SKIP_CSRF_KEY = 'auth:skipCsrf';
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);
