import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import {
  ClientMessageIdSchema,
  ConversationIdSchema,
  MessageIdSchema,
  UserIdSchema,
} from "@/shared/ids";
import { createPostgresClient } from "@/shared/infra/postgres/postgresClient";
import {
  resetDb,
  seedConversation,
  seedMember,
  seedUser,
} from "../../helpers/seed";

describe("e2e/infra: postgres schema contracts", () => {
  const db = createPostgresClient({
    POSTGRES_HOST: process.env.POSTGRES_HOST ?? "",
    POSTGRES_PORT: Number(process.env.POSTGRES_PORT ?? 5432),
    POSTGRES_USER: process.env.POSTGRES_USER ?? "",
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? "",
    POSTGRES_DATABASE: process.env.POSTGRES_DATABASE ?? "",
  });

  const cid = ConversationIdSchema.parse(
    "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e10",
  );
  const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");

  beforeAll(async () => {
    await db`SELECT 1 as ok`;
  });

  beforeEach(async () => {
    await resetDb(db);
    await seedUser(db, { id: uid, username: "alice", displayName: "Alice" });
    await seedConversation(db, { id: cid });
    await seedMember(db, { conversationId: cid, userId: uid });
  });

  afterAll(async () => {
    await db.end({ timeout: 1 });
  });

  it("enforces message dedupe UNIQUE(conversation_id, sender_id, client_message_id)", async () => {
    const mid1 = MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20");
    const mid2 = MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e21");
    const cmid = ClientMessageIdSchema.parse(
      "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e12",
    );

    await db`
      INSERT INTO messages (message_id, conversation_id, sender_id, client_message_id, message_text)
      VALUES (${mid1}, ${cid}, ${uid}, ${cmid}, ${"hello"})
    `;

    // 同一 (cid, uid, cmid) で2回目は UNIQUE 違反になるはず
    let threw = false;
    try {
      await db`
        INSERT INTO messages (message_id, conversation_id, sender_id, client_message_id, message_text)
        VALUES (${mid2}, ${cid}, ${uid}, ${cmid}, ${"hello"})
      `;
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("cascades deletes from conversations", async () => {
    const mid = MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20");
    const cmid = ClientMessageIdSchema.parse(
      "01890b42-8d57-7b8f-9f2b-ef2d6c1f6e12",
    );

    await db`
      INSERT INTO messages (message_id, conversation_id, sender_id, client_message_id, message_text)
      VALUES (${mid}, ${cid}, ${uid}, ${cmid}, ${"hello"})
    `;

    await db`
      INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id)
      VALUES (${cid}, ${uid}, ${mid})
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id, updated_at = now()
    `;

    await db`DELETE FROM conversations WHERE id = ${cid}`;

    const m =
      await db`SELECT count(*)::int AS c FROM messages WHERE conversation_id = ${cid}`;
    const mem =
      await db`SELECT count(*)::int AS c FROM conversation_members WHERE conversation_id = ${cid}`;
    const r =
      await db`SELECT count(*)::int AS c FROM conversation_reads WHERE conversation_id = ${cid}`;

    expect(m[0]?.c).toBe(0);
    expect(mem[0]?.c).toBe(0);
    expect(r[0]?.c).toBe(0);
  });
});
