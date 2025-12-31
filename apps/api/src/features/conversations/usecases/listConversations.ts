import * as z from "zod";
import { UserIdSchema } from "@/shared/ids";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";
import type { MessageQueryRepository } from "../../messages/ports";
import type { Message } from "../../messages/domain";
import type { ConversationRepository } from "../ports";
import type { ConversationReadsRepository } from "../../reads/ports";
import type { UserRepository } from "@/shared/ports/users";

export const ListConversationsInputSchema = z.object({
  userId: UserIdSchema,
});
export type ListConversationsInput = z.infer<
  typeof ListConversationsInputSchema
>;

export interface ListConversationsDeps {
  membersRepo: ConversationMembersRepository;
  messageQueryRepo: MessageQueryRepository;
  conversationRepo: ConversationRepository;
  readsRepo: ConversationReadsRepository;
  userRepo: UserRepository;
}

export type MessageWithSenderDisplayName = Message & {
  senderDisplayName: string;
};

export type ConversationPreview = {
  conversationId: string;
  title: string | null;
  latestMessages: readonly MessageWithSenderDisplayName[];
  unreadCount: number;
};

export type ListConversationsResult = {
  kind: "ok";
  conversations: readonly ConversationPreview[];
};

export const makeListConversations =
  (deps: ListConversationsDeps) =>
  async (
    input: ListConversationsInput,
  ): Promise<ListConversationsResult> => {
    const conversationIds = await deps.membersRepo.listByUserId(input.userId);
    
    // 各会話の最新2メッセージと未読数を取得
    const conversations = await Promise.all(
      conversationIds.map(async (conversationId) => {
        const latestMessages = await deps.messageQueryRepo.listLatestByConversation(
          conversationId,
          2,
        );
        const title = await deps.conversationRepo.getTitle(conversationId);
        
        // 未読数を計算
        const readCursor = await deps.readsRepo.get(conversationId, input.userId);
        const lastReadMessageId = readCursor?.lastReadMessageId ?? null;
        const unreadCount = await deps.messageQueryRepo.countUnread(
          conversationId,
          lastReadMessageId,
        );
        
        // 送信者の表示名を取得
        const senderIds = latestMessages.map((msg) => msg.senderId);
        const uniqueSenderIds = Array.from(new Set(senderIds));
        const users = await deps.userRepo.findByIds(uniqueSenderIds);
        const userMap = new Map(users.map((u) => [u.id, u.displayName]));
        
        const latestMessagesWithDisplayName: MessageWithSenderDisplayName[] =
          latestMessages.map((msg) => ({
            ...msg,
            senderDisplayName: userMap.get(msg.senderId) || "不明なユーザー",
          }));
        
        return {
          conversationId: String(conversationId),
          title,
          latestMessages: latestMessagesWithDisplayName,
          unreadCount,
        };
      }),
    );

    return {
      kind: "ok",
      conversations,
    };
  };

