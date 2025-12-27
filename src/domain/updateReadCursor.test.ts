import { describe, expect, it } from "bun:test";
import { ConversationIdSchema, MessageIdSchema, UserIdSchema } from "./ids";
import {
	type ConversationMembersRepository,
	type ConversationReadsRepository,
	makeUpdateReadCursor,
	type ReadCursor,
} from "./updateReadCursor";

// --- Test doubles ---
class InMemoryMembersRepo implements ConversationMembersRepository {
	private readonly members = new Set<string>();

	addMember(conversationId: string, userId: string): void {
		this.members.add(`${conversationId}|${userId}`);
	}

	async isMember(conversationId: any, userId: any): Promise<boolean> {
		return this.members.has(`${conversationId}|${userId}`);
	}
}

class InMemoryReadsRepo implements ConversationReadsRepository {
	private readonly byKey = new Map<string, ReadCursor>();

	private key(conversationId: string, userId: string): string {
		return `${conversationId}|${userId}`;
	}

	async get(conversationId: any, userId: any): Promise<ReadCursor | null> {
		return this.byKey.get(this.key(conversationId, userId)) ?? null;
	}

	async upsert(cursor: ReadCursor): Promise<void> {
		this.byKey.set(this.key(cursor.conversationId, cursor.userId), cursor);
	}
}

class SpyReadsRepo implements ConversationReadsRepository {
	public getCalled = 0;
	public upsertCalled = 0;

	constructor(private readonly inner: ConversationReadsRepository) {}

	async get(conversationId: any, userId: any) {
		this.getCalled += 1;
		return this.inner.get(conversationId, userId);
	}

	async upsert(cursor: ReadCursor) {
		this.upsertCalled += 1;
		return this.inner.upsert(cursor);
	}
}

// 固定値
const cid = ConversationIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e10");
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");

// UUIDv7文字列の大小で前後判定できるよう、末尾を変える
const mid1 = MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e20");
const mid2 = MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e21");
const mid3 = MessageIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e22");

describe("updateReadCursor (domain)", () => {
	it("returns forbidden when user is NOT a conversation member, and does not touch readsRepo", async () => {
		const membersRepo = new InMemoryMembersRepo();
		// membersRepo.addMember(cid, uid); // 入れない

		const spyReadsRepo = new SpyReadsRepo(new InMemoryReadsRepo());

		const updateReadCursor = makeUpdateReadCursor({
			membersRepo,
			readsRepo: spyReadsRepo,
			now: () => new Date("2025-12-27T00:00:00.000Z"),
		});

		const res = await updateReadCursor({
			conversationId: cid,
			userId: uid,
			lastReadMessageId: mid1,
		});

		expect(res).toEqual({ kind: "forbidden", reason: "NOT_A_MEMBER" });
		expect(spyReadsRepo.getCalled).toBe(0);
		expect(spyReadsRepo.upsertCalled).toBe(0);
	});

	it("updates cursor on first update (no existing cursor)", async () => {
		const membersRepo = new InMemoryMembersRepo();
		membersRepo.addMember(cid, uid);

		const readsRepo = new InMemoryReadsRepo();

		const updateReadCursor = makeUpdateReadCursor({
			membersRepo,
			readsRepo,
			now: () => new Date("2025-12-27T00:00:00.000Z"),
		});

		const res = await updateReadCursor({
			conversationId: cid,
			userId: uid,
			lastReadMessageId: mid1,
		});

		expect(res.kind).toBe("updated");
		if (res.kind === "updated") {
			expect(res.cursor.conversationId).toBe(cid);
			expect(res.cursor.userId).toBe(uid);
			expect(res.cursor.lastReadMessageId).toBe(mid1);
			expect(res.cursor.updatedAt.toISOString()).toBe(
				"2025-12-27T00:00:00.000Z",
			);
		}
	});

	it("ignores update when lastReadMessageId is older (cursor must not go backwards)", async () => {
		const membersRepo = new InMemoryMembersRepo();
		membersRepo.addMember(cid, uid);

		const readsRepo = new InMemoryReadsRepo();

		const updateReadCursor = makeUpdateReadCursor({
			membersRepo,
			readsRepo,
			now: () => new Date("2025-12-27T00:00:00.000Z"),
		});

		// 先に進める
		await updateReadCursor({
			conversationId: cid,
			userId: uid,
			lastReadMessageId: mid3,
		});

		// 古いIDで更新を試みる（無視されるべき）
		const res = await updateReadCursor({
			conversationId: cid,
			userId: uid,
			lastReadMessageId: mid2,
		});

		expect(res.kind).toBe("ignored");
		if (res.kind === "ignored") {
			expect(res.cursor?.lastReadMessageId).toBe(mid3);
		}
	});

	it("updates cursor when lastReadMessageId is newer", async () => {
		const membersRepo = new InMemoryMembersRepo();
		membersRepo.addMember(cid, uid);

		const readsRepo = new InMemoryReadsRepo();

		// 1回目と2回目で now を変えて更新を確認
		let now = new Date("2025-12-27T00:00:00.000Z");
		const updateReadCursor = makeUpdateReadCursor({
			membersRepo,
			readsRepo,
			now: () => now,
		});

		await updateReadCursor({
			conversationId: cid,
			userId: uid,
			lastReadMessageId: mid1,
		});

		now = new Date("2025-12-27T00:00:10.000Z");

		const res = await updateReadCursor({
			conversationId: cid,
			userId: uid,
			lastReadMessageId: mid2,
		});

		expect(res.kind).toBe("updated");
		if (res.kind === "updated") {
			expect(res.cursor.lastReadMessageId).toBe(mid2);
			expect(res.cursor.updatedAt.toISOString()).toBe(
				"2025-12-27T00:00:10.000Z",
			);
		}
	});
});
