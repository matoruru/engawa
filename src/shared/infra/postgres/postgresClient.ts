import { SQL } from "bun";

export type PostgresClient = SQL;

export const createPostgresClient = (url: string): PostgresClient =>
  new SQL(url);
