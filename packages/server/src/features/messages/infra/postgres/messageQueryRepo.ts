import * as z from "zod";

import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";
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
});
