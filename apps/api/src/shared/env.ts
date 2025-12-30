import * as z from "zod";

const EnvSchema = z.object({
  POSTGRES_URL: z.string().min(1),

  // セッショントークン（JWT）検証用
  SESSION_JWT_SECRET: z.string().min(1),

  // Cookie名（ブラウザ用。デフォルト）
  SESSION_COOKIE_NAME: z.string().min(1).default("session"),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_GOOGLE_CLIENT_ID: z.string().nonempty(),
  BETTER_AUTH_GOOGLE_CLIENT_SECRET: z.string().nonempty(),

  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  PORT: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? 3000 : Number(v)))
    .pipe(z.number().int().min(1).max(65535)),
});

export type Env = z.infer<typeof EnvSchema>;
export const env: Env = EnvSchema.parse(process.env);
