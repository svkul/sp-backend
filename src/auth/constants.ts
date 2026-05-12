import { parseDurationMs } from '../utils/parse-duration';

/** Access token TTL. Format: "<number><s|m|h|d>", e.g. "15m", "7d". */
export const ACCESS_TOKEN_TTL = '1m';

/** Refresh token TTL. Format: "<number><s|m|h|d>", e.g. "2m", "7d". */
export const REFRESH_TOKEN_TTL = '5m';

/** Express `res.cookie` maxAge (ms) for access cookie */
export const ACCESS_TOKEN_COOKIE_MAX_AGE_MS = parseDurationMs(ACCESS_TOKEN_TTL);

/** Express `res.cookie` maxAge (ms) for refresh cookie */
export const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = parseDurationMs(REFRESH_TOKEN_TTL);
