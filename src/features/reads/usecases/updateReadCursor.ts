import * as z from "zod";
import {
	ConversationIdSchema,
	type MessageId,
	MessageIdSchema,
	UserIdSchema,
} from "../../../shared/ids";
import type { ConversationMembersRepository } from "../../conversations/ports";
import type { ReadCursor } from "../domain";
import type { ConversationReadsRepository } from "../ports";

export const UpdateReadCursorInputSchema = z.object({
	conversationId: ConversationIdSchema,
	userId: UserIdSchema,
	lastReadMessageId: MessageIdSchema,
});
export type UpdateReadCursorInput = z.infer<typeof UpdateReadCursorInputSchema>;

export interface UpdateReadCursorDeps {
	membersRepo: ConversationMembersRepository;
	readsRepo: ConversationReadsRepository;
	now: () => Date;
}

export type UpdateReadCursorResult =
	| { kind: "updated"; cursor: ReadCursor }
	| { kind: "ignored"; cursor: ReadCursor | null }
	| { kind: "forbidden"; reason: "NOT_A_MEMBER" };

// UUIDv7 の文字列比較で単調増加を判定（MVP）
const isNewerThan = (a: MessageId, b: MessageId): boolean => a > b;

export const makeUpdateReadCursor =
	(deps: UpdateReadCursorDeps) =>
	async (input: UpdateReadCursorInput): Promise<UpdateReadCursorResult> => {
		const member = await deps.membersRepo.isMember(
			input.conversationId,
			input.userId,
		);
		if (!member) return { kind: "forbidden", reason: "NOT_A_MEMBER" };

		const current = await deps.readsRepo.get(
			input.conversationId,
			input.userId,
		);

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

		if (!isNewerThan(input.lastReadMessageId, current.lastReadMessageId)) {
			return { kind: "ignored", cursor: current };
		}

		const next: ReadCursor = {
			...current,
			lastReadMessageId: input.lastReadMessageId,
			updatedAt: deps.now(),
		};
		await deps.readsRepo.upsert(next);
		return { kind: "updated", cursor: next };
	};
