import * as z from "zod";

// --- IDs ---
export const ConversationIdSchema = z.uuidv7().brand("ConversationId");
export type ConversationId = z.infer<typeof ConversationIdSchema>;

export const UserIdSchema = z.uuidv7().brand("UserId");
export type UserId = z.infer<typeof UserIdSchema>;

export const ClientMessageIdSchema = z.uuidv7().brand("ClientMessageId");
export type ClientMessageId = z.infer<typeof ClientMessageIdSchema>;

export const MessageIdSchema = z.uuidv7().brand("MessageId");
export type MessageId = z.infer<typeof MessageIdSchema>;

// --- Message fields ---
export const MessageTextSchema = z
	.string()
	.min(1, "message_text must be non-empty")
	.max(10000, "message_text is too long")
	.brand("MessageText");
export type MessageText = z.infer<typeof MessageTextSchema>;

// --- Domain model ---
export const MessageSchema = z.object({
	messageId: MessageIdSchema,
	conversationId: ConversationIdSchema,
	senderId: UserIdSchema,
	clientMessageId: ClientMessageIdSchema,
	messageText: MessageTextSchema,
	createdAt: z.date(),
});
export type Message = z.infer<typeof MessageSchema>;

// --- Usecase input (parseはI/O層の責務にする方針) ---
export const SendMessageInputSchema = z.object({
	conversationId: ConversationIdSchema,
	senderId: UserIdSchema,
	clientMessageId: ClientMessageIdSchema,
	messageText: MessageTextSchema,
});
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

// --- Repository contracts ---
export type InsertResult =
	| { kind: "stored"; message: Message }
	| { kind: "duplicate"; existing: Message };

export interface MessageRepository {
	insertOrGetByClientMessageId(message: Message): Promise<InsertResult>;
}

export interface ConversationMembersRepository {
	isMember(conversationId: ConversationId, userId: UserId): Promise<boolean>;
}

// --- Deps ---
export interface SendMessageDeps {
	membersRepo: ConversationMembersRepository;
	messageRepo: MessageRepository;
	now: () => Date;
	generateMessageId: () => MessageId;
}

// --- Usecase result ---
export type SendMessageResult =
	| { kind: "stored"; message: Message }
	| { kind: "duplicate"; existing: Message }
	| { kind: "forbidden"; reason: "NOT_A_MEMBER" };

export const makeSendMessage =
	(deps: SendMessageDeps) =>
	async (input: SendMessageInput): Promise<SendMessageResult> => {
		// 意味バリデーション: 会話メンバーか？
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
			messageText: input.messageText,
			createdAt: deps.now(),
		};

		const res = await deps.messageRepo.insertOrGetByClientMessageId(message);

		if (res.kind === "stored") return { kind: "stored", message: res.message };
		return { kind: "duplicate", existing: res.existing };
	};
