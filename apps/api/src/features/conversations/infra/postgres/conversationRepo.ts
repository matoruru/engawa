import type { ConversationId } from "@/shared/ids";
import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";
import type { ConversationRepository } from "../../ports";

export const makePostgresConversationRepo = (
  db: PostgresClient,
): ConversationRepository => ({
  create: async (conversationId: ConversationId): Promise<void> => {
    await db`
      INSERT INTO conversations (id, title)
      VALUES (${conversationId}, NULL)
    `;
  },
  updateTitle: async (conversationId: ConversationId, title: string | null): Promise<void> => {
    await db`
      UPDATE conversations
      SET title = ${title}
      WHERE id = ${conversationId}
    `;
  },
  getTitle: async (conversationId: ConversationId): Promise<string | null> => {
    const rows = await db`
      SELECT title
      FROM conversations
      WHERE id = ${conversationId}
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    const row = rows[0] as { title: string | null };
    return row.title;
  },
});

