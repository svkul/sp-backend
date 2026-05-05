import { z } from 'zod';

export const helloResponseSchema = z.object({
  message: z.string(),
});

export type HelloResponse = z.infer<typeof helloResponseSchema>;
