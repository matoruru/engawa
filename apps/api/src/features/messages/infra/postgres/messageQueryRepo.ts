import * as z from "zod";

import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";
import type { ConversationId, MessageId } from "@/shared/ids";
import type { Message } from "../../domain";
import { MessageSchema } from "../../domain";
import type {
  ListByConversationParams,
  MessageQueryRepository,
} from "../../ports";
import { MessageRowSchema, messageRowToDomainInput } from "./messageRow";

export const makePostgresMessageQueryRepo = (
  db: PostgresClient,
): MessageQueryRepository => ({
  listByConversation: async (
    params: ListByConversationParams,
  ): Promise<readonly Message[]> => {
    const { conversationId, afterMessageId, limit } = params;

    const rows =
      afterMessageId === undefined
        ? await db`
            SELECT
              message_id,
              conversation_id,
              sender_id,
              client_message_id,
              message_text,
              created_at
            FROM messages
            WHERE conversation_id = ${conversationId}
            ORDER BY message_id ASC
            LIMIT ${limit}
          `
        : await db`
            SELECT
              message_id,
              conversation_id,
              sender_id,
              client_message_id,
              message_text,
              created_at
            FROM messages
            WHERE conversation_id = ${conversationId}
              AND message_id > ${afterMessageId}
            ORDER BY message_id ASC
            LIMIT ${limit}
          `;

    // row配列として検証
    const parsedRows = z.array(MessageRowSchema).parse(rows);

    // ドメインに変換
    return parsedRows.map((r) =>
      MessageSchema.parse(messageRowToDomainInput(r)),
    );
  },

  listLatestByConversation: async (
    conversationId: ConversationId,
    limit: number,
  ): Promise<readonly Message[]> => {
    const rows = await db`
      SELECT
        message_id,
        conversation_id,
        sender_id,
        client_message_id,
        message_text,
        created_at
      FROM messages
      WHERE conversation_id = ${conversationId}
      ORDER BY message_id DESC
      LIMIT ${limit}
    `;

    // row配列として検証
    const parsedRows = z.array(MessageRowSchema).parse(rows);

    // ドメインに変換（降順で取得したので、時系列順に並び替える）
    const messages = parsedRows
      .map((r) => MessageSchema.parse(messageRowToDomainInput(r)))
      .reverse();

    return messages;
  },

  countUnread: async (
    conversationId: ConversationId,
    afterMessageId: MessageId | null,
  ): Promise<number> => {
    if (afterMessageId === null) {
      // lastReadMessageIdがnullの場合は、全てのメッセージが未読
      const rows = await db`
        SELECT COUNT(*) as count
        FROM messages
        WHERE conversation_id = ${conversationId}
      `;
      const count = rows[0] as { count: bigint };
      return Number(count.count);
    }

    const rows = await db`
      SELECT COUNT(*) as count
      FROM messages
      WHERE conversation_id = ${conversationId}
        AND message_id > ${afterMessageId}
    `;
    const count = rows[0] as { count: bigint };
    return Number(count.count);
  },
});
