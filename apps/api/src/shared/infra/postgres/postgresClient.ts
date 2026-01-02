import { SQL } from "bun";
import type { Env } from "@/shared/env";
import { isDevRuntime } from "@/shared/runtime";

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
    ...(isDevRuntime() ? {} : {
      tls: {
        rejectUnauthorized: false,
      }
    })
  });

export const testDBConnection = async (db: PostgresClient) => {
  console.log('Testing DB connection... (for application)');
  try {
    await db`SELECT 1 as ok`;
    console.log('DB connection successful! (for application)');
  } catch (error) {
    console.error('DB connection failed... (for application)');
    throw error;
  }
};
