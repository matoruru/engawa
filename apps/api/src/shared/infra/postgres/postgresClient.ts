import { SQL } from "bun";
import type { Env } from "@/shared/env";

export type PostgresClient = SQL;

export const createPostgresClient = (
  env: Pick<
    Env,
    | "POSTGRES_HOST"
    | "POSTGRES_PORT"
    | "POSTGRES_USER"
    | "POSTGRES_PASSWORD"
    | "POSTGRES_DATABASE"
  >,
): PostgresClient =>
  new SQL({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DATABASE,
  });
