import * as z from "zod";
import {
  type ConversationId,
  ConversationIdSchema,
  UserIdSchema,
} from "@/shared/ids";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";
import type { ConversationRepository } from "../ports";

export const CreateConversationInputSchema = z.object({
  userId: UserIdSchema,
});
export type CreateConversationInput = z.infer<
  typeof CreateConversationInputSchema
>;

export interface CreateConversationDeps {
  conversationRepo: ConversationRepository;
  membersRepo: ConversationMembersRepository;
  generateConversationId: () => ConversationId;
  now: () => Date;
}

export type CreateConversationResult = {
  kind: "created";
  conversationId: ConversationId;
};

export const makeCreateConversation =
  (deps: CreateConversationDeps) =>
  async (input: CreateConversationInput): Promise<CreateConversationResult> => {
    const conversationId = deps.generateConversationId();

    // 会話を作成
    await deps.conversationRepo.create(conversationId);

    // 作成者をメンバーとして追加
    await deps.membersRepo.addMember(conversationId, input.userId);

    return { kind: "created", conversationId };
  };

