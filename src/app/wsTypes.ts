import * as z from "zod";
import {
  ClientMessageIdSchema,
  ConversationIdSchema,
  MessageIdSchema,
  UserIdSchema,
} from "@/shared/ids";
import { MessageTextSchema } from "../features/messages/domain";

// senderId/userId は WS では送らない（サーバが注入する）
export const WsSyncMessagesPayloadSchema = z.object({
  conversationId: ConversationIdSchema,
  afterMessageId: MessageIdSchema.optional(),
  limit: z.number().int().min(1).max(200),
});

export const WsSendMessagePayloadSchema = z.object({
  conversationId: ConversationIdSchema,
  clientMessageId: ClientMessageIdSchema,
  messageText: MessageTextSchema,
});

export const WsUpdateReadCursorPayloadSchema = z.object({
  conversationId: ConversationIdSchema,
  lastReadMessageId: MessageIdSchema,
});

// client -> server
export const WsClientEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("messages.sync"),
    payload: WsSyncMessagesPayloadSchema,
  }),
  z.object({
    type: z.literal("message.send"),
    payload: WsSendMessagePayloadSchema,
  }),
  z.object({
    type: z.literal("read.update"),
    payload: WsUpdateReadCursorPayloadSchema,
  }),
]);

export type WsClientEvent = z.infer<typeof WsClientEventSchema>;

// 仮認証：クエリで userId を受ける
export const WsAuthQuerySchema = z.object({
  userId: UserIdSchema,
});

export const wsEncode = (msg: unknown): string => JSON.stringify(msg);
