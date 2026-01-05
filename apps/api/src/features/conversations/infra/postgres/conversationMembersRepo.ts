import * as z from "zod";
import type { ConversationMembersRepository } from "@/shared/features/conversations/ports";
import type { ConversationId, UserId } from "@/shared/ids";
import { ConversationIdSchema, UserIdSchema } from "@/shared/ids";
import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";

const ExistsRowSchema = z.object({ ok: z.number().int() });
const ConversationIdRowSchema = z.object({ conversation_id: z.string() });
const UserIdRowSchema = z.object({ user_id: z.string() });

export const makePostgresConversationMembersRepo = (
  db: PostgresClient,
): ConversationMembersRepository => ({
  isMember: async (
    conversationId: ConversationId,
    userId: UserId,
  ): Promise<boolean> => {
    const rows = await db`
      SELECT 1 as ok
      FROM conversation_members
      WHERE conversation_id = ${conversationId}
        AND user_id = ${userId}
      LIMIT 1
    `;

    // rows が変な形で返ってきても、ここで落ちる（＝静かに誤判定しない）
    const parsed = z.array(ExistsRowSchema).parse(rows);
    return parsed.length === 1;
  },

  listByUserId: async (userId: UserId): Promise<readonly ConversationId[]> => {
    const rows = await db`
      SELECT conversation_id
      FROM conversation_members
      WHERE user_id = ${userId}
      ORDER BY joined_at DESC
    `;

    const parsed = z.array(ConversationIdRowSchema).parse(rows);
    return parsed.map((row) => ConversationIdSchema.parse(row.conversation_id));
  },

  listByConversationId: async (
    conversationId: ConversationId,
  ): Promise<readonly UserId[]> => {
    const rows = await db`
      SELECT user_id
      FROM conversation_members
      WHERE conversation_id = ${conversationId}
      ORDER BY joined_at ASC
    `;

    const parsed = z.array(UserIdRowSchema).parse(rows);
    return parsed.map((row) => UserIdSchema.parse(row.user_id));
  },

  addMember: async (
    conversationId: ConversationId,
    userId: UserId,
  ): Promise<void> => {
    await db`
      INSERT INTO conversation_members (conversation_id, user_id)
      VALUES (${conversationId}, ${userId})
      ON CONFLICT (conversation_id, user_id) DO NOTHING
    `;
  },

  removeMember: async (
    conversationId: ConversationId,
    userId: UserId,
  ): Promise<void> => {
    await db`
      DELETE FROM conversation_members
      WHERE conversation_id = ${conversationId}
        AND user_id = ${userId}
    `;
  },
});
