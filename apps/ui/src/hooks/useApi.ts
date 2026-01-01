// src/hooks/useApi.ts

import { treaty } from "@elysiajs/eden";
import type { App as AppContract } from "@idobata/contracts";
import { useMemo } from "react";

export function useApi(apiUrl: string) {
  const app = useMemo(
    () =>
      treaty<AppContract>(apiUrl, {
        fetch: {
          credentials: "include",
        },
      }),
    [apiUrl],
  );
  return app;
}
