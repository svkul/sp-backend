import { z } from 'zod';

export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});

export const signInResponseSchema = z.object({
  accessToken: z.string(),
});

export const listSessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listSessionsResponseSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  items: z.array(z.string()),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignInResponse = z.infer<typeof signInResponseSchema>;
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
export type ListSessionsResponse = z.infer<typeof listSessionsResponseSchema>;
