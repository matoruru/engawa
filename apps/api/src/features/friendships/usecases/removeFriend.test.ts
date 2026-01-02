import { describe, expect, it } from "bun:test";

import {
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import type { FriendshipsRepository } from "../ports";
import { makeRemoveFriend } from "./removeFriend";

// --- Test doubles ---
class InMemoryFriendshipsRepo implements FriendshipsRepository {
  private readonly friendships = new Set<string>();

  async addFriendship(userId: UserId, friendId: UserId): Promise<void> {
    this.friendships.add(`${userId}|${friendId}`);
    this.friendships.add(`${friendId}|${userId}`);
  }

  async removeFriendship(userId: UserId, friendId: UserId): Promise<void> {
    this.friendships.delete(`${userId}|${friendId}`);
    this.friendships.delete(`${friendId}|${userId}`);
  }

  async isFriend(userId: UserId, friendId: UserId): Promise<boolean> {
    return this.friendships.has(`${userId}|${friendId}`);
  }

  async listFriends(userId: UserId): Promise<readonly Array<{ id: string; username: string; displayName: string; avatarUrl: string | null }>> {
    return [];
  }
}

// 固定値
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
const uid2 = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e12");

describe("removeFriend", () => {
  it("should remove friendship", async () => {
    const friendshipsRepo = new InMemoryFriendshipsRepo();
    await friendshipsRepo.addFriendship(uid, uid2);

    const removeFriend = makeRemoveFriend({
      friendshipsRepo,
    });

    const result = await removeFriend({
      userId: uid,
      friendId: uid2,
    });

    expect(result.kind).toBe("removed");
    expect(await friendshipsRepo.isFriend(uid, uid2)).toBe(false);
    expect(await friendshipsRepo.isFriend(uid2, uid)).toBe(false);
  });
});

