export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_DAYS = 7;

/** Express `res.cookie` maxAge (ms) for access cookie */
export const ACCESS_TOKEN_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;

/** Express `res.cookie` maxAge (ms) for refresh cookie */
export const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = REFRESH_DAYS * 24 * 60 * 60 * 1000;
