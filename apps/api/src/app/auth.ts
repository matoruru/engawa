import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { env } from "@/shared/env";
import { isDevRuntime } from "@/shared/runtime";
import { uuidv7 } from "@/shared/uuid";

const pool = new Pool({
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  database: env.POSTGRES_DATABASE,
  ...(env.SUPABASE_POSTGRES_CERT ? {
    ssl: {
      rejectUnauthorized: true,
      requestCert: true,
      ca: env.SUPABASE_POSTGRES_CERT,
    },
  } : {}),
});

export const testDBConnection = () => {
  pool.query('SELECT 1 as ok').then(() => {
    console.log('DB connection successful!');
  }).catch((error) => {
    console.error('DB connection failed!', error);
  });
}

const makeInitialUsername = (authUserId: string, email: string): string => {
  // MVP: 衝突しづらい & 後で変更しやすい
  const local = email.split("@")[0] ?? "user";
  return `${local}_${authUserId.slice(0, 8)}`;
};

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  database: pool,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",

  socialProviders: {
    google: {
      clientId: env.BETTER_AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.BETTER_AUTH_GOOGLE_CLIENT_SECRET,
    },
  },

  trustedOrigins: env.ALLOWED_ORIGINS.split(","),

  // 開発環境でのみ有効
  emailAndPassword: {
    enabled: isDevRuntime(),
    allowSignIn: true
  },

  databaseHooks: {
    // 1) BetterAuth user が作られたら、アプリ側の users + user_identities を作る
    user: {
      create: {
        after: async (createdUser /*, ctx */) => {
          const appUserId = uuidv7();

          // users は UUID なのでキャストに注意（uuidv7() は UUIDv7 の文字列）
          // 失敗したら例外でロールバックさせたいので、ここは握りつぶさない
          await pool.query(
            `
            INSERT INTO users (id, username, display_name, avatar_url)
            VALUES ($1::uuid, $2, $3, $4)
            ON CONFLICT (id) DO NOTHING
            `,
            [
              appUserId,
              makeInitialUsername(createdUser.id, createdUser.email),
              createdUser.name,
              createdUser.image || null,
            ],
          );

          // BetterAuth user.id とアプリ users.id を紐づけ
          await pool.query(
            `
            INSERT INTO user_identities (provider, provider_subject, user_id)
            VALUES ('better-auth', $1, $2::uuid)
            ON CONFLICT (provider, provider_subject) DO NOTHING
            `,
            [createdUser.id, appUserId],
          );
        },
      },
    },

    // 2) account が作られたら、(google, sub相当) → users.id を張る（任意だが将来効く）
    account: {
      create: {
        after: async (account /*, ctx */) => {
          // まず better-auth の紐づけから users.id を引く
          const r = await pool.query<{ user_id: string }>(
            `
            SELECT user_id
            FROM user_identities
            WHERE provider = 'better-auth'
              AND provider_subject = $1
            LIMIT 1
            `,
            [account.userId],
          );
          const appUserId = r.rows[0]?.user_id;
          if (!appUserId) return;

          await pool.query(
            `
            INSERT INTO user_identities (provider, provider_subject, user_id)
            VALUES ($1, $2, $3::uuid)
            ON CONFLICT (provider, provider_subject)
            DO UPDATE SET user_id = EXCLUDED.user_id
            `,
            [account.providerId, account.accountId, appUserId],
          );
        },
      },
    },
  },
});
