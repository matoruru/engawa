import * as z from "zod";
import { type UserId, UserIdSchema } from "@/shared/ids";
import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";
import type { CacheStore } from "../../../../infra/cache/cachePort";
import { type User, UserSchema } from "../../domain";
import type { UserRepository } from "../../ports";

const UserRowSchema = z.object({
  id: z.string(),
  username: z.string(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

// キャッシュキー生成
const cacheKey = (userId: UserId): string => `user:${String(userId)}`;
const CACHE_TTL_SECONDS = 300; // 5分

export const makePostgresUserRepo = (
  db: PostgresClient,
  cache: CacheStore,
): UserRepository => {
  // 単一ユーザーをDBから取得（キャッシュなし）
  const fetchUserFromDb = async (userId: UserId): Promise<User | null> => {
    const rows = await db`
      SELECT id, username, display_name, avatar_url
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (rows.length === 0) return null;

    const parsedRow = UserRowSchema.parse(rows[0]);
    const user = UserSchema.parse({
      id: UserIdSchema.parse(parsedRow.id),
      username: parsedRow.username,
      displayName: parsedRow.display_name,
      avatarUrl: parsedRow.avatar_url,
    });

    // キャッシュに保存
    await cache.set(cacheKey(userId), user, CACHE_TTL_SECONDS);

    return user;
  };

  // 複数ユーザーをDBから取得（キャッシュなし）
  const fetchUsersFromDb = async (
    userIds: readonly UserId[],
  ): Promise<readonly User[]> => {
    if (userIds.length === 0) {
      return [];
    }

    const rows = await db`
      SELECT DISTINCT u.id, u.username, u.display_name, u.avatar_url
      FROM users u
      WHERE u.id IN ${db(userIds)}
      ORDER BY u.display_name ASC, u.username ASC
    `;

    const parsed = z.array(UserRowSchema).parse(rows);

    const users = parsed.map((row) => {
      const user = UserSchema.parse({
        id: UserIdSchema.parse(row.id),
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      });
      return user;
    });

    // キャッシュに保存
    await Promise.all(
      users.map((user) =>
        cache.set(cacheKey(user.id), user, CACHE_TTL_SECONDS),
      ),
    );

    return users;
  };

  return {
    findByIds: async (userIds: readonly UserId[]): Promise<readonly User[]> => {
      if (userIds.length === 0) {
        return [];
      }

      // 重複を除去し、入力順序を保持
      const uniqueUserIds = Array.from(
        new Map(userIds.map((id) => [String(id), id])).values(),
      );

      // キャッシュから取得を試みる
      const cacheResults = await Promise.all(
        uniqueUserIds.map((userId) => cache.get<User>(cacheKey(userId))),
      );

      // キャッシュヒットしたユーザーとミスしたIDを分離
      const cachedUsers: User[] = [];
      const missedIds: UserId[] = [];

      for (let i = 0; i < uniqueUserIds.length; i++) {
        const cached = cacheResults[i];
        if (cached) {
          cachedUsers.push(cached);
        } else {
          missedIds.push(uniqueUserIds[i]);
        }
      }

      // キャッシュミスしたIDのみDBから取得
      let dbUsers: readonly User[] = [];
      if (missedIds.length > 0) {
        // 大量のIDの場合はバッチ処理（1000件ずつ）
        const BATCH_SIZE = 1000;
        const batches: User[][] = [];

        for (let i = 0; i < missedIds.length; i += BATCH_SIZE) {
          const batch = missedIds.slice(i, i + BATCH_SIZE);
          const batchUsers = await fetchUsersFromDb(batch);
          batches.push([...batchUsers]);
        }

        dbUsers = batches.flat();
      }

      // 入力順序を保持するため、IDの順序でマップを作成
      const userMap = new Map<UserId, User>();
      for (const user of [...cachedUsers, ...dbUsers]) {
        userMap.set(user.id, user);
      }

      // 入力順序に従って結果を構築
      const result: User[] = [];
      for (const userId of uniqueUserIds) {
        const user = userMap.get(userId);
        if (user) {
          result.push(user);
        }
      }

      return result;
    },

    findById: async (userId: UserId): Promise<User | null> => {
      // キャッシュから取得を試みる
      const cached = await cache.get<User>(cacheKey(userId));
      if (cached) {
        return cached;
      }

      // キャッシュミスの場合、DBから取得
      const user = await fetchUserFromDb(userId);
      return user;
    },

    findByUsername: async (username: string): Promise<User | null> => {
      const rows = await db`
        SELECT id, username, display_name, avatar_url
        FROM users
        WHERE username = ${username}
        LIMIT 1
      `;

      if (rows.length === 0) return null;

      const parsedRow = UserRowSchema.parse(rows[0]);
      const user = UserSchema.parse({
        id: UserIdSchema.parse(parsedRow.id),
        username: parsedRow.username,
        displayName: parsedRow.display_name,
        avatarUrl: parsedRow.avatar_url,
      });

      // キャッシュに保存
      await cache.set(cacheKey(user.id), user, CACHE_TTL_SECONDS);

      return user;
    },

    updateDisplayName: async (
      userId: UserId,
      displayName: string,
    ): Promise<void> => {
      await db`
        UPDATE users
        SET display_name = ${displayName}
        WHERE id = ${userId}
      `;

      // キャッシュを無効化
      await cache.delete(cacheKey(userId));
    },

    updateUsername: async (userId: UserId, username: string): Promise<void> => {
      await db`
        UPDATE users
        SET username = ${username}
        WHERE id = ${userId}
      `;

      // キャッシュを無効化
      await cache.delete(cacheKey(userId));
    },

    updateAvatarUrl: async (
      userId: UserId,
      avatarUrl: string | null,
    ): Promise<void> => {
      await db`
        UPDATE users
        SET avatar_url = ${avatarUrl}
        WHERE id = ${userId}
      `;

      // キャッシュを無効化
      await cache.delete(cacheKey(userId));
    },
  };
};
