import * as z from "zod";
import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";
import type { UserId } from "@/shared/ids";
import type { FriendshipsRepository } from "../../ports";

const FriendshipRowSchema = z.object({
  user_id: z.string(),
  friend_id: z.string(),
  created_at: z.date(),
});

export const makePostgresFriendshipsRepo = (
  db: PostgresClient,
): FriendshipsRepository => ({
  addFriendship: async (userId: UserId, friendId: UserId): Promise<void> => {
    await db`
      INSERT INTO friendships (user_id, friend_id)
      VALUES (${userId}, ${friendId})
      ON CONFLICT (user_id, friend_id) DO NOTHING
    `;
    
    // 双方向の友達関係を作成（相互フォロー）
    await db`
      INSERT INTO friendships (user_id, friend_id)
      VALUES (${friendId}, ${userId})
      ON CONFLICT (user_id, friend_id) DO NOTHING
    `;
  },

  removeFriendship: async (userId: UserId, friendId: UserId): Promise<void> => {
    await db`
      DELETE FROM friendships
      WHERE user_id = ${userId} AND friend_id = ${friendId}
    `;
    
    // 双方向の友達関係を削除
    await db`
      DELETE FROM friendships
      WHERE user_id = ${friendId} AND friend_id = ${userId}
    `;
  },

  isFriend: async (userId: UserId, friendId: UserId): Promise<boolean> => {
    const rows = await db`
      SELECT 1
      FROM friendships
      WHERE user_id = ${userId} AND friend_id = ${friendId}
      LIMIT 1
    `;
    return rows.length > 0;
  },

  listFriends: async (userId: UserId): Promise<readonly UserId[]> => {
    const rows = await db`
      SELECT friend_id
      FROM friendships
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
    
    const parsed = z.array(z.object({ friend_id: z.string() })).parse(rows);
    return parsed.map((row) => String(row.friend_id) as UserId);
  },
});

