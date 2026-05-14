import { registerAs, type ConfigType } from '@nestjs/config';
import { z } from 'zod';

export const validationSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  COOKIE_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.url(),
  FRONTEND_URL: z.url(),
});

type EnvConfig = z.infer<typeof validationSchema>;
const parseEnv = (): EnvConfig => validationSchema.parse(process.env);

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
  return {
    jwtAccessSecret: env.JWT_ACCESS_SECRET,
    cookieSecret: env.COOKIE_SECRET,
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
  return { frontendUrl: env.FRONTEND_URL };
});

export type WebConfig = ConfigType<typeof webConfig>;
