import type { ConversationId, UserId } from "../../shared/ids";
import type { ReadCursor } from "./domain";

export interface ConversationReadsRepository {
	get(
		conversationId: ConversationId,
		userId: UserId,
	): Promise<ReadCursor | null>;
	upsert(cursor: ReadCursor): Promise<void>;
}
