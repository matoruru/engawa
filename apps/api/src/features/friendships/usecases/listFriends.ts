import * as z from "zod";
import { UserIdSchema } from "@/shared/ids";
import type { FriendshipsRepository } from "../ports";
import type { UserRepository } from "@/shared/ports/users";

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
    const friendIds = await deps.friendshipsRepo.listFriends(input.userId);
    
    if (friendIds.length === 0) {
      return { kind: "ok", friends: [] };
    }

    // 友達のユーザー情報を取得
    const users = await deps.userRepo.findByIds(friendIds);
    
    const friends: FriendInfo[] = users.map((user) => ({
      id: String(user.id),
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    }));

    return {
      kind: "ok",
      friends,
    };
  };

