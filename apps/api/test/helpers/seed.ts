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

export const seedFriendship = async (
  db: PostgresClient,
  params: { userId: UserId; friendId: UserId },
): Promise<void> => {
  // 双方向の友達関係を作成（相互フォロー）
  await db`
    INSERT INTO friendships (user_id, friend_id)
    VALUES (${params.userId}, ${params.friendId})
  `;
  await db`
    INSERT INTO friendships (user_id, friend_id)
    VALUES (${params.friendId}, ${params.userId})
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
