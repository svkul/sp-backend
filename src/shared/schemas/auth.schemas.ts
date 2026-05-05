import { z } from 'zod';

export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});

export const signInResponseSchema = z.object({
  accessToken: z.string(),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignInResponse = z.infer<typeof signInResponseSchema>;
