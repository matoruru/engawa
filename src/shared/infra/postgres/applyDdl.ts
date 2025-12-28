import type { PostgresClient } from "./postgresClient";

export const applyPostgresDdl = async (
  db: PostgresClient,
  ddlPath = "db/ddl/0001_init.sql",
): Promise<void> => {
  await db.file(ddlPath);
};
