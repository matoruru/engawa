import * as z from "zod";
import { UserIdSchema } from "@/shared/ids";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";

export const ListConversationsInputSchema = z.object({
  userId: UserIdSchema,
});
export type ListConversationsInput = z.infer<
  typeof ListConversationsInputSchema
>;

export interface ListConversationsDeps {
  membersRepo: ConversationMembersRepository;
}

export type ListConversationsResult = {
  kind: "ok";
  conversations: readonly string[];
};

export const makeListConversations =
  (deps: ListConversationsDeps) =>
  async (
    input: ListConversationsInput,
  ): Promise<ListConversationsResult> => {
    const conversationIds = await deps.membersRepo.listByUserId(input.userId);
    return {
      kind: "ok",
      conversations: conversationIds.map((id) => String(id)),
    };
  };

