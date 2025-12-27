import type { Message } from "./domain";

export type InsertResult =
	| { kind: "stored"; message: Message }
	| { kind: "duplicate"; existing: Message };

export interface MessageRepository {
	// UNIQUE(conversation_id, sender_id, client_message_id) をDB側で貼る想定
	insertOrGetByClientMessageId(message: Message): Promise<InsertResult>;
}
