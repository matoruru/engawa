import type { ConversationId, MessageId, UserId } from "@/shared/ids";

export type ReadCursor = {
	conversationId: ConversationId;
	userId: UserId;
	lastReadMessageId: MessageId;
	updatedAt: Date;
};
