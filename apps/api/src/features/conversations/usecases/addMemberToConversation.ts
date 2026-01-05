import * as z from "zod";
import type { ConversationMembersRepository } from "@/shared/features/conversations/ports";
import { ConversationIdSchema, UserIdSchema } from "@/shared/ids";

export const AddMemberToConversationInputSchema = z.object({
  userId: UserIdSchema,
  conversationId: ConversationIdSchema,
  targetUserId: UserIdSchema,
});
export type AddMemberToConversationInput = z.infer<
  typeof AddMemberToConversationInputSchema
>;

export interface AddMemberToConversationDeps {
  membersRepo: ConversationMembersRepository;
}

export type AddMemberToConversationResult =
  | { kind: "added" }
  | { kind: "forbidden"; reason: "NOT_A_MEMBER" }
  | { kind: "conflict"; reason: "ALREADY_MEMBER" };

export const makeAddMemberToConversation =
  (deps: AddMemberToConversationDeps) =>
  async (
    input: AddMemberToConversationInput,
  ): Promise<AddMemberToConversationResult> => {
    // 自分がメンバーかチェック
    const isMember = await deps.membersRepo.isMember(
      input.conversationId,
      input.userId,
    );
    if (!isMember) {
      return { kind: "forbidden", reason: "NOT_A_MEMBER" };
    }

    // 既にメンバーかチェック
    const alreadyMember = await deps.membersRepo.isMember(
      input.conversationId,
      input.targetUserId,
    );
    if (alreadyMember) {
      return { kind: "conflict", reason: "ALREADY_MEMBER" };
    }

    // メンバーを追加
    await deps.membersRepo.addMember(input.conversationId, input.targetUserId);

    return { kind: "added" };
  };
