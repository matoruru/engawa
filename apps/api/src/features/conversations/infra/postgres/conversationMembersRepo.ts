import * as z from "zod";
import type { ConversationId, UserId } from "@/shared/ids";
import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";

const ExistsRowSchema = z.object({ ok: z.number().int() });

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
});
