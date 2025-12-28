import type { ConversationId, UserId } from "@/shared/ids";
import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";
import type { ReadCursor } from "../../domain";
import type { ConversationReadsRepository } from "../../ports";
import { parseReadCursorFromRow } from "./readCursorRow";

export const makePostgresConversationReadsRepo = (
  db: PostgresClient,
): ConversationReadsRepository => ({
  get: async (
    conversationId: ConversationId,
    userId: UserId,
  ): Promise<ReadCursor | null> => {
    const rows = await db`
      SELECT
        conversation_id,
        user_id,
        last_read_message_id,
        updated_at
      FROM conversation_reads
      WHERE conversation_id = ${conversationId}
        AND user_id = ${userId}
      LIMIT 1
    `;

    if (rows.length === 0) return null;
    return parseReadCursorFromRow(rows[0]);
  },

  upsert: async (cursor: ReadCursor): Promise<void> => {
    // UUIDv7 の順序性を前提に、より新しい last_read のみ反映したい場合は WHERE を付ける
    // 付けない場合は常に上書き（単純）。ここでは “後戻り防止” を入れておく。
    await db`
      INSERT INTO conversation_reads (
        conversation_id,
        user_id,
        last_read_message_id,
        updated_at
      ) VALUES (
        ${cursor.conversationId},
        ${cursor.userId},
        ${cursor.lastReadMessageId},
        ${cursor.updatedAt}
      )
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET
        last_read_message_id = EXCLUDED.last_read_message_id,
        updated_at = EXCLUDED.updated_at
      WHERE conversation_reads.last_read_message_id < EXCLUDED.last_read_message_id
    `;
  },
});
