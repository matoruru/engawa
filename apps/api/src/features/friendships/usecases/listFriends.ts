import * as z from "zod";
import type { UserRepository } from "@/shared/features/users/ports";
import { type UserId, UserIdSchema } from "@/shared/ids";
import type { FriendshipsRepository } from "../ports";

export const ListFriendsInputSchema = z.object({
  userId: UserIdSchema,
});
export type ListFriendsInput = z.infer<typeof ListFriendsInputSchema>;

export interface ListFriendsDeps {
  friendshipsRepo: FriendshipsRepository;
  userRepo: UserRepository;
}

export type FriendInfo = {
  userId: UserId;
  username: string;
  displayName: string;
};

export type ListFriendsResult = {
  kind: "ok";
  friends: readonly FriendInfo[];
};

export const makeListFriends =
  (deps: ListFriendsDeps) =>
  async (input: ListFriendsInput): Promise<ListFriendsResult> => {
    const friends = await deps.friendshipsRepo.listFriends(input.userId);
    return {
      kind: "ok",
      friends,
    };
  };
