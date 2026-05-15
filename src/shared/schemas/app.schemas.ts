import { z } from 'zod';

export const healthzResponseSchema = z.object({
  ok: z.literal(true),
});

export type HealthzResponse = z.infer<typeof healthzResponseSchema>;
