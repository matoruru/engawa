import type {
  ConversationId,
  UserId,
  MessageId,
  ClientMessageId,
} from "./ids";

export interface ConversationMembersRepository {
  isMember(conversationId: ConversationId, userId: UserId): Promise<boolean>;
}

export type ReadCursor = {
  conversationId: ConversationId;
  userId: UserId;
  lastReadMessageId: MessageId;
  updatedAt: Date;
};

export interface ConversationReadsRepository {
  get(conversationId: ConversationId, userId: UserId): Promise<ReadCursor | null>;
  upsert(cursor: ReadCursor): Promise<void>;
}
