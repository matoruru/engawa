import { z } from "zod";

const EnvSchema = z.object({
  API_URL: z.url(),
  WS_URL: z.url(),
});

type Env = z.infer<typeof EnvSchema>;

// Environment variables
const env: Env = EnvSchema.parse({
  API_URL: import.meta.env.VITE_API_URL,
  WS_URL: import.meta.env.VITE_WS_URL,
});

export type Constants = Readonly<{
  API_URL: string;
  WS_URL: string;
}>;

export const constants: Constants = {
  API_URL: env.API_URL,
  WS_URL: env.WS_URL,
};
