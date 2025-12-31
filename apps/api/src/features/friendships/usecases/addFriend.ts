import * as z from "zod";
import { UserIdSchema } from "@/shared/ids";
import type { FriendshipsRepository } from "../ports";

export const AddFriendInputSchema = z.object({
  userId: UserIdSchema,
  friendId: UserIdSchema,
});
export type AddFriendInput = z.infer<typeof AddFriendInputSchema>;

export interface AddFriendDeps {
  friendshipsRepo: FriendshipsRepository;
}

export type AddFriendResult =
  | { kind: "added" }
  | { kind: "conflict"; reason: "ALREADY_FRIEND" | "SELF_FRIEND" };

export const makeAddFriend =
  (deps: AddFriendDeps) =>
  async (input: AddFriendInput): Promise<AddFriendResult> => {
    // 自分自身を友達に追加できない
    if (input.userId === input.friendId) {
      return { kind: "conflict", reason: "SELF_FRIEND" };
    }

    // 既に友達かチェック
    const isAlreadyFriend = await deps.friendshipsRepo.isFriend(
      input.userId,
      input.friendId,
    );
    if (isAlreadyFriend) {
      return { kind: "conflict", reason: "ALREADY_FRIEND" };
    }

    // 友達関係を追加
    await deps.friendshipsRepo.addFriendship(input.userId, input.friendId);

    return { kind: "added" };
  };

