import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { makePostgresFriendshipsRepo } from "src/features/friendships/infra/postgres/friendshipsRepo";
import { makeListFriends } from "src/features/friendships/usecases/listFriends";
import {
  UserIdSchema,
} from "@/shared/ids";
import { createPostgresClient } from "@/shared/infra/postgres/postgresClient";
import { makePostgresUserRepo } from "@/shared/infra/postgres/userRepo";
import {
  resetDb,
  seedFriendship,
  seedUser,
} from "../../helpers/seed";

describe("e2e/usecases: friends flow", () => {
  const db = createPostgresClient({
    POSTGRES_HOST: process.env.POSTGRES_HOST ?? "",
    POSTGRES_PORT: Number(process.env.POSTGRES_PORT ?? 5432),
    POSTGRES_USER: process.env.POSTGRES_USER ?? "",
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? "",
    POSTGRES_DATABASE: process.env.POSTGRES_DATABASE ?? "",
  });

  const uid1 = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
  const uid2 = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e12");

  beforeAll(async () => {
    await db`SELECT 1 as ok`;
  });

  beforeEach(async () => {
    await resetDb(db);
    await seedUser(db, { id: uid1, username: "alice", displayName: "Alice" });
    await seedUser(db, { id: uid2, username: "bob", displayName: "Bob" });
    await seedFriendship(db, { userId: uid1, friendId: uid2 });
  });

  afterAll(async () => {
    await db.end({ timeout: 1 });
  });

  it("listFriends", async () => {
    const friendshipsRepo = makePostgresFriendshipsRepo(db);
    const userRepo = makePostgresUserRepo(db);

    const listFriends = makeListFriends({ friendshipsRepo, userRepo });

    // uid1の友達一覧を取得
    const r1 = await listFriends({
      userId: uid1,
    });
    expect(r1.kind).toBe("ok");
    if (r1.kind !== "ok") throw new Error("Unexpected result");
    expect(r1.friends.length).toBe(1);
    expect(r1.friends[0].id).toBe(uid2);

    // uid2の友達一覧を取得
    const r2 = await listFriends({
      userId: uid2,
    });
    expect(r2.kind).toBe("ok");
    if (r2.kind !== "ok") throw new Error("Unexpected result");
    expect(r2.friends.length).toBe(1);
    expect(r2.friends[0].id).toBe(uid1);
  });
});
