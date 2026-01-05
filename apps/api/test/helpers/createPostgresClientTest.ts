import { createPostgresClient } from "@/shared/infra/postgres/postgresClient";

export const createPostgresClientTest = () => {
  return createPostgresClient({
    POSTGRES_HOST: "localhost",
    POSTGRES_PORT: 5432,
    POSTGRES_USER: "chat",
    POSTGRES_PASSWORD: "chat",
    POSTGRES_DATABASE: "chat_test",
  });
}
