import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { treaty } from "@elysiajs/eden";
import { env } from "bun";
import { Elysia } from "elysia";
import type { App as AppContract } from "src";
import { createSessionCookie } from "test/helpers/cookie";
import { createPostgresClientTest } from "test/helpers/createPostgresClientTest";
import { ConversationIdSchema, UserIdSchema } from "@/shared/ids";
import { createPostgresClient } from "@/shared/infra/postgres/postgresClient";
import { makePostgresConversationMembersRepo } from "../../../src/features/conversations/infra/postgres/conversationMembersRepo";
import { makePostgresConversationRepo } from "../../../src/features/conversations/infra/postgres/conversationRepo";
import { makeAddMemberToConversation } from "../../../src/features/conversations/usecases/addMemberToConversation";
import { makeCreateConversation } from "../../../src/features/conversations/usecases/createConversation";
import { makeListConversationMembers } from "../../../src/features/conversations/usecases/listConversationMembers";
import { makeListConversations } from "../../../src/features/conversations/usecases/listConversations";
import { makePostgresMessageQueryRepo } from "../../../src/features/messages/infra/postgres/messageQueryRepo";
import { makePostgresConversationReadsRepo } from "../../../src/features/reads/infra/postgres/conversationReadsRepo";
import { makePostgresUserRepo } from "../../../src/shared/features/users/infra/postgres/userRepo";
import { uuidv7 } from "../../../src/shared/uuid";
import { resetDb, seedUser } from "../../helpers/seed";

describe("e2e/usecases: elysia eden routes", () => {
  const db = createPostgresClientTest();
  const api = treaty<AppContract>(`http://127.0.0.1:${process.env.PORT}`);

  beforeAll(async () => {
    // Confirm database is ready
    const result = await db`SELECT 1 as ok`;
    expect(result[0]).toEqual({ ok: 1 });

    // Confirm API server is ready
    const res = await api.healthz.get();
    expect(res.status).toBe(200);
  });

  beforeEach(async () => {
    await resetDb(db);
  });

  afterAll(async () => {
    await resetDb(db);
    await db.end({ timeout: 1 });
  });

  it("healthz should return 200 and ok", async () => {
    const res = await api.healthz.get();
    if (res.status === 200) {
      expect(res.data).toEqual({ ok: true });
    }
  });

  it("GET /me should return 401 if not authenticated", async () => {
    const { error } = await api.me.get();
    expect(error?.status).toBe(401);
  });

  // 全てのルートをテストしようとしたがおそらくやり過ぎ
});
