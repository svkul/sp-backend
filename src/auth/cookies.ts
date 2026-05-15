import { randomBytes } from 'node:crypto';
import type { Response } from 'express';

import type { AppConfig, authConfig } from '../config/configuration';
import type { ConfigType } from '@nestjs/config';

export const COOKIE_ACCESS = '__Secure-access';
export const COOKIE_REFRESH = '__Secure-refresh';
export const COOKIE_CSRF = '__Secure-csrf';

// Refresh cookie is scoped to the BFF auth path on the web frontend so that
// the browser only attaches it to /api/auth/* (refresh, logout) and never to
// product routes or any other origin. The backend still reads it via the
// forwarded Cookie header — path is enforced by the browser, not the server.
const REFRESH_PATH = '/api/auth';
const ROOT_PATH = '/';

type AuthConfig = ConfigType<typeof authConfig>;

interface SetAuthCookiesArgs {
  res: Response;
  accessToken: string;
  refreshRaw: string;
  refreshTtlMs: number;
  authCfg: AuthConfig;
  appEnv: AppConfig['NODE_ENV'];
}

interface CookieDefaults {
  isProd: boolean;
  domain: string | undefined;
}

function getDefaults(appEnv: AppConfig['NODE_ENV'], authCfg: AuthConfig): CookieDefaults {
  return {
    isProd: appEnv !== 'development',
    domain: authCfg.cookieDomain,
  };
}

/**
 * Issue a fresh random CSRF token. The value is delivered to the browser via a
 * non-HttpOnly cookie and must be echoed by the SPA in `X-CSRF-Token` header on
 * every state-changing request (double-submit pattern; see csrf.middleware).
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Set the three auth cookies after a successful login or rotation.
 * Returns the issued CSRF token so the same value can also be stored elsewhere
 * if needed (currently we rely purely on the cookie ↔ header double-submit check).
 */
export function setAuthCookies({
  res,
  accessToken,
  refreshRaw,
  refreshTtlMs,
  authCfg,
  appEnv,
}: SetAuthCookiesArgs): string {
  const { isProd, domain } = getDefaults(appEnv, authCfg);
  const sameSite = 'lax' as const;

  res.cookie(COOKIE_ACCESS, accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite,
    path: ROOT_PATH,
    domain,
    maxAge: authCfg.accessTokenCookieMaxAgeMs,
  });

  res.cookie(COOKIE_REFRESH, refreshRaw, {
    httpOnly: true,
    secure: isProd,
    sameSite,
    // Scoping refresh to /auth limits its surface (browser will only attach it
    // to auth endpoints — never to /api/* product routes).
    path: REFRESH_PATH,
    domain,
    maxAge: refreshTtlMs,
  });

  const csrf = generateCsrfToken();
  res.cookie(COOKIE_CSRF, csrf, {
    httpOnly: false,
    secure: isProd,
    sameSite: 'strict',
    path: ROOT_PATH,
    domain,
    maxAge: refreshTtlMs,
  });

  return csrf;
}

/**
 * Clear all auth cookies. Used by logout / refresh-rotation failures /
 * unauthorized guard rejections.
 */
export function clearAuthCookies(
  res: Response,
  authCfg: AuthConfig,
  appEnv: AppConfig['NODE_ENV'],
): void {
  const { isProd, domain } = getDefaults(appEnv, authCfg);
  const baseClear = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    domain,
  };

  res.clearCookie(COOKIE_ACCESS, { ...baseClear, path: ROOT_PATH });
  res.clearCookie(COOKIE_REFRESH, { ...baseClear, path: REFRESH_PATH });
  res.clearCookie(COOKIE_CSRF, {
    httpOnly: false,
    secure: isProd,
    sameSite: 'strict',
    domain,
    path: ROOT_PATH,
  });
}
