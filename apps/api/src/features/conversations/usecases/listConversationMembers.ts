import * as z from "zod";
import {
  ConversationIdSchema,
  UserIdSchema,
} from "@/shared/ids";
import type { ConversationMembersRepository } from "@/shared/ports/conversationMembers";
import type { User, UserRepository } from "@/shared/ports/users";

export const ListConversationMembersInputSchema = z.object({
  userId: UserIdSchema,
  conversationId: ConversationIdSchema,
});
export type ListConversationMembersInput = z.infer<
  typeof ListConversationMembersInputSchema
>;

export interface ListConversationMembersDeps {
  userRepo: UserRepository;
  membersRepo: ConversationMembersRepository;
}

export type ListConversationMembersResult =
  | { kind: "ok"; members: readonly User[] }
  | { kind: "forbidden"; reason: "NOT_A_MEMBER" };

export const makeListConversationMembers =
  (deps: ListConversationMembersDeps) =>
  async (
    input: ListConversationMembersInput,
  ): Promise<ListConversationMembersResult> => {
    // 自分がメンバーかチェック
    const isMember = await deps.membersRepo.isMember(
      input.conversationId,
      input.userId,
    );
    if (!isMember) {
      return { kind: "forbidden", reason: "NOT_A_MEMBER" };
    }

    const memberIds = await deps.membersRepo.listByConversationId(
      input.conversationId,
    );

    // ユーザー情報を取得
    const users = await deps.userRepo.findByIds(memberIds);

    return {
      kind: "ok",
      members: users,
    };
  };

