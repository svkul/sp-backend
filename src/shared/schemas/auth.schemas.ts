import { z } from 'zod';

export const tokenPairResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export const meResponseSchema = z.object({
  user: authUserSchema,
});

export const logoutResponseSchema = z.object({
  ok: z.literal(true),
});

export const sessionResponseSchema = z.object({
  authenticated: z.boolean(),
});

export const oauthLoginProfileSchema = z.object({
  provider: z.string().min(1),
  providerAccountId: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  userAgent: z.string().optional(),
  ip: z.string().optional(),
  deviceName: z.string().optional(),
  platform: z.string().optional(),
});

export type TokenPairResponse = z.infer<typeof tokenPairResponseSchema>;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type OAuthLoginProfile = z.infer<typeof oauthLoginProfileSchema>;
