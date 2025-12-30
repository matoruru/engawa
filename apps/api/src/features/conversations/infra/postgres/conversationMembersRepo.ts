import * as z from "zod";
import type { ConversationId, UserId } from "@/shared/ids";
import { ConversationIdSchema } from "@/shared/ids";
import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";

const ExistsRowSchema = z.object({ ok: z.number().int() });
const ConversationIdRowSchema = z.object({ conversation_id: z.string() });

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
});
