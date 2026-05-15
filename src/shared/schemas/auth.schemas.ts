import { z } from 'zod';

export const accessTokenPayloadSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(['USER', 'ADMIN']),
  sid: z.string().min(1),
  iss: z.string().optional(),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;

export const tokenPairResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const refreshResponseSchema = z.object({
  ok: z.boolean(),
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

export const protectedResponseSchema = z.object({
  message: z.string(),
});

export const sessionResponseSchema = z.object({
  authenticated: z.boolean(),
});

export const googleStartRequestSchema = z.object({
  turnstileToken: z.string().min(1),
  returnTo: z.string().max(2048).optional().nullable(),
});

export const googleStartResponseSchema = z.object({
  redirectUrl: z.string().url(),
});

export type GoogleStartRequest = z.infer<typeof googleStartRequestSchema>;
export type GoogleStartResponse = z.infer<typeof googleStartResponseSchema>;

export const oauthLoginProfileSchema = z.object({
  provider: z.string().min(1),
  providerAccountId: z.string().min(1),
  email: z.string().email(),
  emailVerified: z.boolean(),
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
export type ProtectedResponse = z.infer<typeof protectedResponseSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type OAuthLoginProfile = z.infer<typeof oauthLoginProfileSchema>;
