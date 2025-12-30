import * as z from "zod";
import { UserIdSchema } from "@/shared/ids";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";
import type { MessageQueryRepository } from "../../messages/ports";
import type { Message } from "../../messages/domain";

export const ListConversationsInputSchema = z.object({
  userId: UserIdSchema,
});
export type ListConversationsInput = z.infer<
  typeof ListConversationsInputSchema
>;

export interface ListConversationsDeps {
  membersRepo: ConversationMembersRepository;
  messageQueryRepo: MessageQueryRepository;
}

export type ConversationPreview = {
  conversationId: string;
  latestMessages: readonly Message[];
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
    
    // 各会話の最新2メッセージを取得
    const conversations = await Promise.all(
      conversationIds.map(async (conversationId) => {
        const latestMessages = await deps.messageQueryRepo.listLatestByConversation(
          conversationId,
          2,
        );
        return {
          conversationId: String(conversationId),
          latestMessages,
        };
      }),
    );

    return {
      kind: "ok",
      conversations,
    };
  };

