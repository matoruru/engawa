import type { ConversationId, UserId } from "@/shared/ids";
import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";

export const resetDb = async (db: PostgresClient): Promise<void> => {
  await db`
    TRUNCATE TABLE
      conversation_reads,
      messages,
      conversation_members,
      conversations,
      user_identities,
      users
    RESTART IDENTITY
    CASCADE
  `;
};

export const seedUser = async (
  db: PostgresClient,
  params: { id: UserId; username: string; displayName: string },
): Promise<void> => {
  await db`
    INSERT INTO users (id, username, display_name)
    VALUES (${params.id}, ${params.username}, ${params.displayName})
  `;
};

export const seedConversation = async (
  db: PostgresClient,
  params: { id: ConversationId },
): Promise<void> => {
  await db`
    INSERT INTO conversations (id)
    VALUES (${params.id})
  `;
};

export const seedMember = async (
  db: PostgresClient,
  params: { conversationId: ConversationId; userId: UserId },
): Promise<void> => {
  await db`
    INSERT INTO conversation_members (conversation_id, user_id)
    VALUES (${params.conversationId}, ${params.userId})
  `;
};
