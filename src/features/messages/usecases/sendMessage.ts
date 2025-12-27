import {
	ClientMessageIdSchema,
	ConversationIdSchema,
	type MessageId,
	UserIdSchema,
} from "@/shared/ids";
import * as z from "zod";
import type { ConversationMembersRepository } from "../../conversations/ports";
import { type Message, type MessageText, MessageTextSchema } from "../domain";
import type { InsertResult, MessageRepository } from "../ports";

// I/O層で parse 済み前提。ただしI/O層が使えるように Schema は公開しておく
export const SendMessageInputSchema = z.object({
	conversationId: ConversationIdSchema,
	senderId: UserIdSchema,
	clientMessageId: ClientMessageIdSchema,
	messageText: MessageTextSchema,
});
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

export interface SendMessageDeps {
	membersRepo: ConversationMembersRepository;
	messageRepo: MessageRepository;
	now: () => Date;
	generateMessageId: () => MessageId;
}

export type SendMessageResult =
	| { kind: "stored"; message: Message }
	| { kind: "duplicate"; existing: Message }
	| { kind: "forbidden"; reason: "NOT_A_MEMBER" };

export const makeSendMessage =
	(deps: SendMessageDeps) =>
	async (input: SendMessageInput): Promise<SendMessageResult> => {
		// 意味バリデーション：会話メンバーか？
		const member = await deps.membersRepo.isMember(
			input.conversationId,
			input.senderId,
		);
		if (!member) return { kind: "forbidden", reason: "NOT_A_MEMBER" };

		const message: Message = {
			messageId: deps.generateMessageId(),
			conversationId: input.conversationId,
			senderId: input.senderId,
			clientMessageId: input.clientMessageId,
			messageText: input.messageText as MessageText,
			createdAt: deps.now(),
		};

		const res: InsertResult =
			await deps.messageRepo.insertOrGetByClientMessageId(message);
		if (res.kind === "stored") return { kind: "stored", message: res.message };
		return { kind: "duplicate", existing: res.existing };
	};
