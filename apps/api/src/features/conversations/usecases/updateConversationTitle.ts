import * as z from "zod";
import type { ConversationMembersRepository } from "@/shared/features/conversations/ports";
import { ConversationIdSchema, UserIdSchema } from "@/shared/ids";
import type { ConversationRepository } from "../ports";

export const UpdateConversationTitleInputSchema = z.object({
  userId: UserIdSchema,
  conversationId: ConversationIdSchema,
  title: z.string().max(100).nullable(),
});
export type UpdateConversationTitleInput = z.infer<
  typeof UpdateConversationTitleInputSchema
>;

export interface UpdateConversationTitleDeps {
  conversationRepo: ConversationRepository;
  membersRepo: ConversationMembersRepository;
}

export type UpdateConversationTitleResult =
  | { kind: "updated" }
  | { kind: "forbidden"; reason: "NOT_A_MEMBER" };

export const makeUpdateConversationTitle =
  (deps: UpdateConversationTitleDeps) =>
  async (
    input: UpdateConversationTitleInput,
  ): Promise<UpdateConversationTitleResult> => {
    // 自分がメンバーかチェック
    const isMember = await deps.membersRepo.isMember(
      input.conversationId,
      input.userId,
    );
    if (!isMember) {
      return { kind: "forbidden", reason: "NOT_A_MEMBER" };
    }

    // タイトルを更新
    await deps.conversationRepo.updateTitle(input.conversationId, input.title);

    return { kind: "updated" };
  };
