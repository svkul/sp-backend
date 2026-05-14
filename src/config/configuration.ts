import { registerAs, type ConfigType } from '@nestjs/config';
import { z } from 'zod';

import { parseDurationMs } from '../utils/parse-duration';

export const validationSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  /** Issuer claim (`iss`) for access JWTs; must match verification in JwtStrategy. */
  JWT_ISSUER: z.string().min(1),
  /** Audience claim (`aud`) for access JWTs; must match verification in JwtStrategy. */
  JWT_AUDIENCE: z.string().min(1),
  /** Access token lifetime, e.g. "15m", "1h". */
  JWT_ACCESS_TTL: z.string().min(1).default('1m'),
  /** Sliding refresh TTL for web sessions (cookie + Session.client = web). */
  REFRESH_TOKEN_TTL_WEB: z.string().min(1).default('14d'),
  /** Sliding refresh TTL for mobile clients (ios / android). */
  REFRESH_TOKEN_TTL_MOBILE: z.string().min(1).default('90d'),
  /** Maximum lifetime of a refresh chain from first login (cap on absoluteExpiresAt). */
  REFRESH_TOKEN_ABSOLUTE_MAX: z.string().min(1).default('180d'),
  COOKIE_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.url(),
  /** Canonical web app URL (OAuth redirect base: /auth/callback). */
  FRONTEND_URL: z.url(),
  /** Optional comma-separated extra browser origins for CORS (e.g. marketing on www). FRONTEND_URL is always included. */
  CORS_URL: z.string().optional().default(''),
});

type EnvConfig = z.infer<typeof validationSchema>;
const parseEnv = (): EnvConfig => validationSchema.parse(process.env);

function parseCommaSeparatedUrls(raw: string): string[] {
  if (!raw.trim()) {
    return [];
  }
  const urls = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const u of urls) {
    const parsed = z.string().url().safeParse(u);
    if (!parsed.success) {
      throw new Error(
        `Invalid URL in CORS_URL: "${u}". Use full absolute URLs separated by commas.`,
      );
    }
  }
  return urls;
}

export const appConfig = registerAs('app', () => {
  const env = parseEnv();
  return {
    PORT: env.PORT,
    NODE_ENV: env.NODE_ENV,
  };
});

export type AppConfig = ConfigType<typeof appConfig>;

export const authConfig = registerAs('auth', () => {
  const env = parseEnv();
  const accessTtl = env.JWT_ACCESS_TTL;

  return {
    jwtAccessSecret: env.JWT_ACCESS_SECRET,
    cookieSecret: env.COOKIE_SECRET,
    jwtIssuer: env.JWT_ISSUER,
    jwtAudience: env.JWT_AUDIENCE,
    accessTtl,
    accessTokenCookieMaxAgeMs: parseDurationMs(accessTtl),
    refreshTokenTtlWeb: env.REFRESH_TOKEN_TTL_WEB,
    refreshTokenTtlMobile: env.REFRESH_TOKEN_TTL_MOBILE,
    refreshTokenAbsoluteMax: env.REFRESH_TOKEN_ABSOLUTE_MAX,
    refreshTokenTtlWebMs: parseDurationMs(env.REFRESH_TOKEN_TTL_WEB),
    refreshTokenTtlMobileMs: parseDurationMs(env.REFRESH_TOKEN_TTL_MOBILE),
    refreshTokenAbsoluteMaxMs: parseDurationMs(env.REFRESH_TOKEN_ABSOLUTE_MAX),
  };
});

export const oauthConfig = registerAs('oauth', () => {
  const env = parseEnv();
  return {
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    googleCallbackUrl: env.GOOGLE_CALLBACK_URL,
  };
});

export const webConfig = registerAs('web', () => {
  const env = parseEnv();
  const extraOrigins = parseCommaSeparatedUrls(env.CORS_URL);
  const corsOrigins = [...new Set([env.FRONTEND_URL, ...extraOrigins])];
  return {
    frontendUrl: env.FRONTEND_URL,
    corsOrigins,
  };
});

export type WebConfig = ConfigType<typeof webConfig>;
