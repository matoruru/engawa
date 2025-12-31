import { Elysia, t } from "elysia";
import * as z from "zod";

import { issueSessionJwt } from "@/shared/auth/issueSessionJwt";
import { type UserId, UserIdSchema } from "@/shared/ids";
import { isDevRuntime } from "@/shared/runtime";

const CreateSessionBodySchema = z.object({
  // 開発用：任意の userId を入れてログインする
  userId: UserIdSchema,
});

export const sessionRoutes = new Elysia()
  .post(
    "/session",
    async ({ body, cookie, status }) => {
      if (!isDevRuntime()) {
        return status(404, { error: "Not found" });
      }

      const result = CreateSessionBodySchema.safeParse(body);
      if (!result.success) {
        return status(400, { error: "Invalid request body" });
      }

      const { userId } = result.data as {
        userId: UserId;
      };

      const token = await issueSessionJwt(userId);

      // Elysiaのcookie API：cookie.session.value に入れる
      cookie.session.set({
        value: token,
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
        // 30日（秒）
        maxAge: 60 * 60 * 24 * 30,
      });

      return { ok: true };
    },
    {
      body: t.Any(), // parse は Zod に寄せる方針
      // session cookie を使うので宣言しておく（Elysia側がcookieを扱えるように）
      cookie: t.Cookie({ session: t.Optional(t.String()) }),
    },
  )
  .delete(
    "/session",
    ({ cookie, status }) => {
      if (!isDevRuntime()) {
        return status(404, { error: "Not found" });
      }

      cookie.session.remove();
      return { ok: true };
    },
    {
      cookie: t.Cookie({ session: t.Optional(t.String()) }),
    },
  );
