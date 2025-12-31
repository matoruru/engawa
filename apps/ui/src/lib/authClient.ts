import { createAuthClient } from "better-auth/client";

export const createBetterAuthClient = (baseURL: string) => {
  return createAuthClient({
    baseURL,
  });
};

