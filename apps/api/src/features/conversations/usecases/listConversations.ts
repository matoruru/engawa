import * as z from "zod";
import { UserIdSchema } from "@/shared/ids";
import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";
import type { Message } from "../../messages/domain";
import { MessageSchema } from "../../messages/domain";
import {
  MessageRowSchema,
  messageRowToDomainInput,
} from "../../messages/infra/postgres/messageRow";

export const ListConversationsInputSchema = z.object({
  userId: UserIdSchema,
});
export type ListConversationsInput = z.infer<
  typeof ListConversationsInputSchema
>;

export interface ListConversationsDeps {
  db: PostgresClient;
  membersRepo: ConversationMembersRepository;
}

export type MessageWithSenderDisplayName = Message & {
  senderDisplayName: string;
};

export type ConversationPreview = {
  conversationId: string;
  title: string | null;
  latestMessages: readonly MessageWithSenderDisplayName[];
  unreadCount: number;
  latestMessageCreatedAt: Date | null;
};

export type ListConversationsResult = {
  kind: "ok";
  conversations: readonly ConversationPreview[];
};

// 最適化されたクエリで全てのデータを一度に取得
const ConversationPreviewRowSchema = z.object({
  conversation_id: z.string(),
  title: z.string().nullable(),
  message_id: z.string().nullable(),
  sender_id: z.string().nullable(),
  client_message_id: z.string().nullable(),
  message_text: z.string().nullable(),
  message_created_at: z.date().nullable(),
  sender_display_name: z.string().nullable(),
  unread_count: z.number().int(),
  latest_message_created_at: z.date().nullable(),
  row_num: z.preprocess((val) => {
    if (val === null || val === undefined) return null;
    if (typeof val === "string") return parseInt(val, 10);
    if (typeof val === "number") return val;
    return null;
  }, z.number().int().nullable()),
});

export const makeListConversations =
  (deps: ListConversationsDeps) =>
  async (input: ListConversationsInput): Promise<ListConversationsResult> => {
    // 単一のクエリで全てのデータを取得
    // ウィンドウ関数を使って各会話の最新2メッセージを取得
    const rows = await deps.db`
      WITH user_conversations AS (
        SELECT conversation_id
        FROM conversation_members
        WHERE user_id = ${input.userId}
      ),
      conversation_data AS (
        SELECT
          c.id AS conversation_id,
          c.title,
          COALESCE(
            (SELECT COUNT(*)
             FROM messages m
             LEFT JOIN conversation_reads cr ON cr.conversation_id = m.conversation_id AND cr.user_id = ${input.userId}
             WHERE m.conversation_id = c.id
               AND (cr.last_read_message_id IS NULL OR m.message_id > cr.last_read_message_id)
            ), 0
          )::int AS unread_count,
          (SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id) AS latest_message_created_at
        FROM conversations c
        INNER JOIN user_conversations uc ON c.id = uc.conversation_id
      ),
      latest_messages AS (
        SELECT
          m.message_id,
          m.conversation_id,
          m.sender_id,
          m.client_message_id,
          m.message_text,
          m.created_at AS message_created_at,
          u.display_name AS sender_display_name,
          ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.message_id DESC)::int AS row_num
        FROM messages m
        INNER JOIN user_conversations uc ON m.conversation_id = uc.conversation_id
        LEFT JOIN users u ON m.sender_id = u.id
      )
      SELECT
        cd.conversation_id,
        cd.title,
        lm.message_id,
        lm.sender_id,
        lm.client_message_id,
        lm.message_text,
        lm.message_created_at,
        lm.sender_display_name,
        cd.unread_count,
        cd.latest_message_created_at,
        lm.row_num
      FROM conversation_data cd
      LEFT JOIN latest_messages lm ON cd.conversation_id = lm.conversation_id AND lm.row_num <= 2
      ORDER BY cd.latest_message_created_at DESC NULLS LAST, cd.conversation_id, lm.row_num
    `;

    const parsed = z.array(ConversationPreviewRowSchema).parse(rows);

    // 会話ごとにグループ化
    const conversationMap = new Map<
      string,
      {
        conversationId: string;
        title: string | null;
        latestMessages: MessageWithSenderDisplayName[];
        unreadCount: number;
        latestMessageCreatedAt: Date | null;
      }
    >();

    for (const row of parsed) {
      const convId = row.conversation_id;
      if (!conversationMap.has(convId)) {
        conversationMap.set(convId, {
          conversationId: convId,
          title: row.title,
          latestMessages: [],
          unreadCount: row.unread_count,
          latestMessageCreatedAt: row.latest_message_created_at,
        });
      }

      const conv = conversationMap.get(convId);
      if (!conv) continue;

      if (
        row.message_id &&
        row.sender_id &&
        row.client_message_id &&
        row.message_text &&
        row.message_created_at &&
        row.row_num !== null &&
        row.row_num <= 2
      ) {
        const messageRow = MessageRowSchema.parse({
          message_id: row.message_id,
          conversation_id: row.conversation_id,
          sender_id: row.sender_id,
          client_message_id: row.client_message_id,
          message_text: row.message_text,
          created_at: row.message_created_at,
        });
        const message = MessageSchema.parse(
          messageRowToDomainInput(messageRow),
        );
        conv.latestMessages.push({
          ...message,
          senderDisplayName: row.sender_display_name || "不明なユーザー",
        });
      }
    }

    // 最新メッセージ順に並べ替え（最新メッセージがない会話は最後）
    const conversations = Array.from(conversationMap.values())
      .sort((a, b) => {
        if (!a.latestMessageCreatedAt && !b.latestMessageCreatedAt) return 0;
        if (!a.latestMessageCreatedAt) return 1;
        if (!b.latestMessageCreatedAt) return -1;
        return (
          b.latestMessageCreatedAt.getTime() -
          a.latestMessageCreatedAt.getTime()
        );
      })
      .map((conv) => ({
        conversationId: conv.conversationId,
        title: conv.title,
        latestMessages: conv.latestMessages.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        ),
        unreadCount: conv.unreadCount,
        latestMessageCreatedAt: conv.latestMessageCreatedAt,
      }));

    return {
      kind: "ok",
      conversations,
    };
  };
