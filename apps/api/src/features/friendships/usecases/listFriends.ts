import * as z from "zod";
import { UserIdSchema } from "@/shared/ids";
import type { UserRepository } from "@/shared/ports/users";
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
  id: string;
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
