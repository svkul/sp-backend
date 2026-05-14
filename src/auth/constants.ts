/** App-level limit for OAuth callback, refresh, logout (Nest Throttler, defense-in-depth). */
export const THROTTLE_AUTH_SENSITIVE = {
  default: { limit: 10, ttl: 60_000 },
};

/**
 * Documented defaults aligned with `Docs/auth-solution.md` §3.6.
 * Runtime values come from env (`REFRESH_TOKEN_TTL_WEB`, etc.) via `authConfig`.
 */
export const REFRESH_TOKEN_TTL_WEB = '14d';
export const REFRESH_TOKEN_TTL_MOBILE = '90d';
export const REFRESH_TOKEN_ABSOLUTE_MAX = '180d';
