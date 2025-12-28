import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";
import type { Message } from "../../domain";
import type { InsertResult, MessageRepository } from "../../ports";
import { parseMessageFromRow } from "./messageRow";

export const makePostgresMessageRepo = (
  db: PostgresClient,
): MessageRepository => ({
  insertOrGetByClientMessageId: async (
    message: Message,
  ): Promise<InsertResult> => {
    const inserted = await db`
      INSERT INTO messages (
        message_id, conversation_id, sender_id, client_message_id, message_text, created_at
      ) VALUES (
        ${message.messageId},
        ${message.conversationId},
        ${message.senderId},
        ${message.clientMessageId},
        ${message.messageText},
        ${message.createdAt}
      )
      ON CONFLICT (conversation_id, sender_id, client_message_id)
      DO NOTHING
      RETURNING
        message_id, conversation_id, sender_id, client_message_id, message_text, created_at
    `;

    if (inserted.length === 1) {
      return { kind: "stored", message: parseMessageFromRow(inserted[0]) };
    }

    const existing = await db`
      SELECT
        message_id, conversation_id, sender_id, client_message_id, message_text, created_at
      FROM messages
      WHERE conversation_id = ${message.conversationId}
        AND sender_id = ${message.senderId}
        AND client_message_id = ${message.clientMessageId}
      LIMIT 1
    `;

    // UNIQUEが効いていれば必ず1件。0件ならDB整合性が壊れているので parse で落ちるのが良い
    return { kind: "duplicate", existing: parseMessageFromRow(existing[0]) };
  },
});
