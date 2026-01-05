import * as z from "zod";
import type { ConversationMembersRepository } from "@/shared/features/conversations/ports";
import { ConversationIdSchema, UserIdSchema } from "@/shared/ids";
import type { ConversationRepository } from "../ports";

export const GetConversationInputSchema = z.object({
  conversationId: ConversationIdSchema,
  userId: UserIdSchema,
});
export type GetConversationInput = z.infer<typeof GetConversationInputSchema>;

export interface GetConversationDeps {
  conversationRepo: ConversationRepository;
  membersRepo: ConversationMembersRepository;
}

export type GetConversationResult =
  | { kind: "ok"; conversationId: string; title: string | null }
  | { kind: "notFound" }
  | { kind: "forbidden"; reason: "NOT_A_MEMBER" };

export const makeGetConversation =
  (deps: GetConversationDeps) =>
  async (input: GetConversationInput): Promise<GetConversationResult> => {
    // 会話が存在するか確認
    const title = await deps.conversationRepo.getTitle(input.conversationId);
    if (title === null) {
      // 会話が存在しない可能性がある（getTitleがnullを返す場合、会話が存在しないか、titleがnull）
      // メンバーシップを確認して、会話が存在するか判定
      const members = await deps.membersRepo.listByConversationId(
        input.conversationId,
      );
      if (members.length === 0) {
        return { kind: "notFound" };
      }
    }

    // ユーザーがメンバーか確認
    const isMember = await deps.membersRepo.isMember(
      input.conversationId,
      input.userId,
    );
    if (!isMember) {
      return { kind: "forbidden", reason: "NOT_A_MEMBER" };
    }

    return {
      kind: "ok",
      conversationId: String(input.conversationId),
      title: title,
    };
  };
