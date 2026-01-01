import * as z from "zod";
import { type UserId, UserIdSchema } from "@/shared/ids";
import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";
import type { FriendInfo } from "../../domain";
import type { FriendshipsRepository } from "../../ports";

const FriendInfoRowSchema = z.object({
  friend_id: UserIdSchema,
  username: z.string(),
  display_name: z.string(),
  avatar_url: z.string().nullable(),
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

  listFriends: async (userId: UserId): Promise<readonly FriendInfo[]> => {
    const rows = await db`
      SELECT f.friend_id, u.username, u.display_name, u.avatar_url
      FROM friendships f
      JOIN users u ON u.id = f.friend_id
      WHERE f.user_id = ${userId}
      ORDER BY f.created_at DESC;
    `;

    const parsed = z.array(FriendInfoRowSchema).parse(rows);
    return parsed.map((row) => ({
      id: row.friend_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    }));
  },
});
