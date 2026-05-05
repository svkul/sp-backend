import { z } from 'zod';

export const validationSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']),
});

export type AppConfig = z.infer<typeof validationSchema>;

export default () => {
  const validatedConfig: AppConfig = validationSchema.parse(process.env);

  return validatedConfig;
};
