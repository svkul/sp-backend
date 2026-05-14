import { parseDurationMs } from '../utils/parse-duration';

/** App-level limit for OAuth callback, refresh, logout (Nest Throttler, defense-in-depth). */
export const THROTTLE_AUTH_SENSITIVE = {
  default: { limit: 10, ttl: 60_000 },
};

/** Refresh token TTL. Format: "<number><s|m|h|d>", e.g. "2m", "7d". */
export const REFRESH_TOKEN_TTL = '5m';

/** Express `res.cookie` maxAge (ms) for refresh cookie */
export const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = parseDurationMs(REFRESH_TOKEN_TTL);
