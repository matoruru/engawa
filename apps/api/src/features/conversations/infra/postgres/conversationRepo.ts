import type { ConversationId } from "@/shared/ids";
import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";
import type { ConversationRepository } from "../../ports";

export const makePostgresConversationRepo = (
  db: PostgresClient,
): ConversationRepository => ({
  create: async (conversationId: ConversationId): Promise<void> => {
    await db`
      INSERT INTO conversations (id)
      VALUES (${conversationId})
    `;
  },
});

