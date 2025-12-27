import * as z from "zod";

import {
  type ConversationId,
  type MessageId,
  type UserId,
  ConversationIdSchema,
  MessageIdSchema,
  UserIdSchema,
} from "./ids";

// I/O層で parse 済みを想定
export const UpdateReadCursorInputSchema = z.object({
	conversationId: ConversationIdSchema,
	userId: UserIdSchema,
	lastReadMessageId: MessageIdSchema,
});
export type UpdateReadCursorInput = z.infer<typeof UpdateReadCursorInputSchema>;

export interface ConversationMembersRepository {
	isMember(conversationId: ConversationId, userId: UserId): Promise<boolean>;
}

export type ReadCursor = {
	conversationId: ConversationId;
	userId: UserId;
	lastReadMessageId: MessageId;
	updatedAt: Date;
};

export interface ConversationReadsRepository {
	/**
	 * 存在しなければ null
	 */
	get(
		conversationId: ConversationId,
		userId: UserId,
	): Promise<ReadCursor | null>;

	/**
	 * lastReadMessageId を保存（upsert）
	 */
	upsert(cursor: ReadCursor): Promise<void>;
}

export interface UpdateReadCursorDeps {
	membersRepo: ConversationMembersRepository;
	readsRepo: ConversationReadsRepository;
	now: () => Date;
}

export type UpdateReadCursorResult =
	| { kind: "updated"; cursor: ReadCursor }
	| { kind: "ignored"; cursor: ReadCursor | null }
	| { kind: "forbidden"; reason: "NOT_A_MEMBER" };

/**
 * UUIDv7 は時系列でソート可能なので、文字列比較で “進んだ/戻った” を判定する。
 * 注意: 実装/保存形式が変わると壊れる可能性があるので、将来は createdAt 比較に置き換え可。
 */
const isNewerThan = (a: MessageId, b: MessageId): boolean => a > b;

export const makeUpdateReadCursor =
	(deps: UpdateReadCursorDeps) =>
	async (input: UpdateReadCursorInput): Promise<UpdateReadCursorResult> => {
		// 意味バリデーション：会話メンバーか？
		const member = await deps.membersRepo.isMember(
			input.conversationId,
			input.userId,
		);
		if (!member) return { kind: "forbidden", reason: "NOT_A_MEMBER" };

		const current = await deps.readsRepo.get(
			input.conversationId,
			input.userId,
		);

		// 初回はそのまま保存
		if (current === null) {
			const next: ReadCursor = {
				conversationId: input.conversationId,
				userId: input.userId,
				lastReadMessageId: input.lastReadMessageId,
				updatedAt: deps.now(),
			};
			await deps.readsRepo.upsert(next);
			return { kind: "updated", cursor: next };
		}

		// 巻き戻り or 同じ なら無視
		const shouldUpdate = isNewerThan(
			input.lastReadMessageId,
			current.lastReadMessageId,
		);
		if (!shouldUpdate) return { kind: "ignored", cursor: current };

		const next: ReadCursor = {
			...current,
			lastReadMessageId: input.lastReadMessageId,
			updatedAt: deps.now(),
		};
		await deps.readsRepo.upsert(next);
		return { kind: "updated", cursor: next };
	};
