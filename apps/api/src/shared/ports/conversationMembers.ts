import type { ConversationId, UserId } from "@/shared/ids";

export interface ConversationMembersRepository {
  isMember(conversationId: ConversationId, userId: UserId): Promise<boolean>;
  listByUserId(userId: UserId): Promise<readonly ConversationId[]>;
  listByConversationId(conversationId: ConversationId): Promise<readonly UserId[]>;
  addMember(conversationId: ConversationId, userId: UserId): Promise<void>;
}
