import type { ConversationId, MessageId } from "@/shared/ids";
import type { Message } from "./domain";

export type InsertResult =
  | { kind: "stored"; message: Message }
  | { kind: "duplicate"; existing: Message };

export interface MessageRepository {
  // UNIQUE(conversation_id, sender_id, client_message_id) をDB側で貼る想定
  insertOrGetByClientMessageId(message: Message): Promise<InsertResult>;
}

export type ListByConversationParams = {
  conversationId: ConversationId;
  afterMessageId?: MessageId;
  limit: number;
};

// 読み取り専用
export interface MessageQueryRepository {
  listByConversation(
    params: ListByConversationParams,
  ): Promise<readonly Message[]>;
  
  // 会話の最新N件のメッセージを取得（降順）
  listLatestByConversation(
    conversationId: ConversationId,
    limit: number,
  ): Promise<readonly Message[]>;
  
  // 未読メッセージ数を取得
  countUnread(
    conversationId: ConversationId,
    afterMessageId: MessageId | null,
  ): Promise<number>;
}
