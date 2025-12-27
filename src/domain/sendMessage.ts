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

// --- Usecase input ---
export const SendMessageInputSchema = z.object({
  conversationId: ConversationIdSchema,
  senderId: UserIdSchema,
  clientMessageId: ClientMessageIdSchema,
  messageText: MessageTextSchema,
});
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

// --- Repository contract ---
// DB側で UNIQUE(conversation_id, sender_id, client_message_id) を貼る想定に合わせたIF
export type InsertResult =
  | { kind: "stored"; message: Message }
  | { kind: "duplicate"; existing: Message };

export interface MessageRepository {
  insertOrGetByClientMessageId(message: Message): Promise<InsertResult>;
}

// --- Deps ---
export interface SendMessageDeps {
  repo: MessageRepository;
  now: () => Date;
  generateMessageId: () => MessageId;
}

// --- Usecase ---
export type SendMessageResult =
  | { kind: "stored"; message: Message }
  | { kind: "duplicate"; existing: Message };

export const makeSendMessage =
  (deps: SendMessageDeps) =>
  async (rawInput: SendMessageInput): Promise<SendMessageResult> => {
    // 入力は「すでに型が正しい」想定でも、ドメイン境界で再検証しておくと安心
    const input = SendMessageInputSchema.parse(rawInput);

    const message: Message = {
      messageId: deps.generateMessageId(),
      conversationId: input.conversationId,
      senderId: input.senderId,
      clientMessageId: input.clientMessageId,
      messageText: input.messageText,
      createdAt: deps.now(),
    };

    const res = await deps.repo.insertOrGetByClientMessageId(message);

    if (res.kind === "stored") return { kind: "stored", message: res.message };
    return { kind: "duplicate", existing: res.existing };
  };
