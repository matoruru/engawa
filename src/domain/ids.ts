import * as z from "zod";

// --- IDs (Zod v4) ---
export const ConversationIdSchema = z.uuidv7().brand("ConversationId");
export type ConversationId = z.infer<typeof ConversationIdSchema>;

export const UserIdSchema = z.uuidv7().brand("UserId");
export type UserId = z.infer<typeof UserIdSchema>;

export const ClientMessageIdSchema = z.uuidv7().brand("ClientMessageId");
export type ClientMessageId = z.infer<typeof ClientMessageIdSchema>;

export const MessageIdSchema = z.uuidv7().brand("MessageId");
export type MessageId = z.infer<typeof MessageIdSchema>;
