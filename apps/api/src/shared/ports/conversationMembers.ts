import type { ConversationId, UserId } from "@/shared/ids";

export interface ConversationMembersRepository {
  isMember(conversationId: ConversationId, userId: UserId): Promise<boolean>;
  listByUserId(userId: UserId): Promise<readonly ConversationId[]>;
}
