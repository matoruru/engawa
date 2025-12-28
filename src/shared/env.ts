import * as z from "zod";

const EnvSchema = z.object({
  POSTGRES_URL: z.string().min(1),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  PORT: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? 3000 : Number(v)))
    .pipe(z.number().int().min(1).max(65535)),
});

export type Env = z.infer<typeof EnvSchema>;
export const env: Env = EnvSchema.parse(process.env);
