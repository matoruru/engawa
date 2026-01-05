import * as z from "zod";
import type { ConversationMembersRepository } from "@/shared/features/conversations/ports";
import { ConversationIdSchema, UserIdSchema } from "@/shared/ids";

export const LeaveConversationInputSchema = z.object({
  userId: UserIdSchema,
  conversationId: ConversationIdSchema,
});
export type LeaveConversationInput = z.infer<
  typeof LeaveConversationInputSchema
>;

export interface LeaveConversationDeps {
  membersRepo: ConversationMembersRepository;
}

export type LeaveConversationResult =
  | { kind: "left" }
  | { kind: "forbidden"; reason: "NOT_A_MEMBER" };

export const makeLeaveConversation =
  (deps: LeaveConversationDeps) =>
  async (input: LeaveConversationInput): Promise<LeaveConversationResult> => {
    // 自分がメンバーかチェック
    const isMember = await deps.membersRepo.isMember(
      input.conversationId,
      input.userId,
    );
    if (!isMember) {
      return { kind: "forbidden", reason: "NOT_A_MEMBER" };
    }

    // メンバーから削除（ユーザが一人の場合も脱会可能）
    await deps.membersRepo.removeMember(input.conversationId, input.userId);

    return { kind: "left" };
  };
