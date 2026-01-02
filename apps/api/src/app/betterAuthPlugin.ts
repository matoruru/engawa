import { Elysia } from "elysia";
import { type UserId, UserIdSchema } from "@/shared/ids";
import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";
import { auth } from "./auth";

const getAppUserIdByBetterAuthUserId = async (
  db: PostgresClient,
  betterAuthUserId: string,
): Promise<UserId> => {
  const rows = await db`
    SELECT user_id
    FROM user_identities
    WHERE provider = ${"better-auth"} AND provider_subject = ${betterAuthUserId}
    LIMIT 1
  `;

  // databaseHooks が正しく動いていれば必ずある想定
  const userId = rows[0]?.user_id;
  if (!userId) {
    throw new Error(
      `User identity not found for better-auth user: ${betterAuthUserId}`,
    );
  }
  return UserIdSchema.parse(userId);
};

export const makeBetterAuthPlugin = (db: PostgresClient) => {
  return new Elysia({ name: "better-auth" })
    .mount(auth.handler)
    .macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        const session = await auth.api.getSession({ headers });
        if (!session) return status(401);

        const userId = await getAppUserIdByBetterAuthUserId(
          db,
          session.user.id,
        );

        return {
          user: session.user,
          session: session.session,
          userId, // アプリのユーザID
        };
      },
    },
  });
};
