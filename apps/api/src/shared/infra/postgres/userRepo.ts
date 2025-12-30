import * as z from "zod";
import type { UserId } from "@/shared/ids";
import { UserIdSchema } from "@/shared/ids";
import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";
import type { User, UserRepository } from "@/shared/ports/users";

const UserRowSchema = z.object({
  id: z.string(),
  username: z.string(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

export const makePostgresUserRepo = (
  db: PostgresClient,
): UserRepository => ({
  findByIds: async (userIds: readonly UserId[]): Promise<readonly User[]> => {
    if (userIds.length === 0) {
      return [];
    }

    // BunのSQLテンプレートリテラルでは配列を直接ANYに渡せないため、
    // 各要素を個別に展開してIN句に渡す
    // テンプレートリテラル構文では動的なプレースホルダーを作れないため、
    // 配列の各要素を個別に展開する必要がある
    // 簡略化のため、最大10個まで対応（通常のユースケースでは十分）
    if (userIds.length > 10) {
      throw new Error("Too many userIds (max 10)");
    }

    // 各要素を個別に展開してIN句に渡す
    // 型安全性を保つため、各要素を個別にプレースホルダーとして展開
    // テンプレートリテラル構文では動的な構築が難しいため、条件分岐で対応
    let rows: unknown[];
    if (userIds.length === 1) {
      rows = await db`
        SELECT id, username, display_name, avatar_url
        FROM users
        WHERE id = ${userIds[0]}
        ORDER BY display_name ASC, username ASC
      `;
    } else if (userIds.length === 2) {
      rows = await db`
        SELECT id, username, display_name, avatar_url
        FROM users
        WHERE id IN (${userIds[0]}, ${userIds[1]})
        ORDER BY display_name ASC, username ASC
      `;
    } else if (userIds.length === 3) {
      rows = await db`
        SELECT id, username, display_name, avatar_url
        FROM users
        WHERE id IN (${userIds[0]}, ${userIds[1]}, ${userIds[2]})
        ORDER BY display_name ASC, username ASC
      `;
    } else if (userIds.length === 4) {
      rows = await db`
        SELECT id, username, display_name, avatar_url
        FROM users
        WHERE id IN (${userIds[0]}, ${userIds[1]}, ${userIds[2]}, ${userIds[3]})
        ORDER BY display_name ASC, username ASC
      `;
    } else if (userIds.length === 5) {
      rows = await db`
        SELECT id, username, display_name, avatar_url
        FROM users
        WHERE id IN (${userIds[0]}, ${userIds[1]}, ${userIds[2]}, ${userIds[3]}, ${userIds[4]})
        ORDER BY display_name ASC, username ASC
      `;
    } else if (userIds.length === 6) {
      rows = await db`
        SELECT id, username, display_name, avatar_url
        FROM users
        WHERE id IN (${userIds[0]}, ${userIds[1]}, ${userIds[2]}, ${userIds[3]}, ${userIds[4]}, ${userIds[5]})
        ORDER BY display_name ASC, username ASC
      `;
    } else if (userIds.length === 7) {
      rows = await db`
        SELECT id, username, display_name, avatar_url
        FROM users
        WHERE id IN (${userIds[0]}, ${userIds[1]}, ${userIds[2]}, ${userIds[3]}, ${userIds[4]}, ${userIds[5]}, ${userIds[6]})
        ORDER BY display_name ASC, username ASC
      `;
    } else if (userIds.length === 8) {
      rows = await db`
        SELECT id, username, display_name, avatar_url
        FROM users
        WHERE id IN (${userIds[0]}, ${userIds[1]}, ${userIds[2]}, ${userIds[3]}, ${userIds[4]}, ${userIds[5]}, ${userIds[6]}, ${userIds[7]})
        ORDER BY display_name ASC, username ASC
      `;
    } else if (userIds.length === 9) {
      rows = await db`
        SELECT id, username, display_name, avatar_url
        FROM users
        WHERE id IN (${userIds[0]}, ${userIds[1]}, ${userIds[2]}, ${userIds[3]}, ${userIds[4]}, ${userIds[5]}, ${userIds[6]}, ${userIds[7]}, ${userIds[8]})
        ORDER BY display_name ASC, username ASC
      `;
    } else {
      rows = await db`
        SELECT id, username, display_name, avatar_url
        FROM users
        WHERE id IN (${userIds[0]}, ${userIds[1]}, ${userIds[2]}, ${userIds[3]}, ${userIds[4]}, ${userIds[5]}, ${userIds[6]}, ${userIds[7]}, ${userIds[8]}, ${userIds[9]})
        ORDER BY display_name ASC, username ASC
      `;
    }

    const parsed = z.array(UserRowSchema).parse(rows);

    return parsed.map((row) => ({
      id: String(row.id),
      username: String(row.username),
      displayName: String(row.display_name || row.username),
      avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    }));
  },
});

