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
  z.object({
    type: z.literal("typing.start"),
    payload: z.object({
      conversationId: ConversationIdSchema,
    }),
  }),
  z.object({
    type: z.literal("typing.stop"),
    payload: z.object({
      conversationId: ConversationIdSchema,
    }),
  }),
]);

export type WsClientEvent = z.infer<typeof WsClientEventSchema>;

// wsEncode が JSON.stringify なので Date は string になりがち。
// 実装/テストで差が出ないよう string|Date を許容。
export const WsWireDateSchema = z.union([z.string(), z.date()]);

export const WsMessagePayloadSchema = z.object({
  messageId: MessageIdSchema,
  conversationId: ConversationIdSchema,
  senderId: UserIdSchema,
  clientMessageId: ClientMessageIdSchema,
  messageText: MessageTextSchema,
  createdAt: WsWireDateSchema,
});
export type WsMessagePayload = z.infer<typeof WsMessagePayloadSchema>;

export const WsSyncMessagesResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    messages: z.array(WsMessagePayloadSchema),
  }),
  z.object({
    kind: z.literal("forbidden"),
    reason: z.literal("NOT_A_MEMBER"),
  }),
]);
export type WsSyncMessagesResult = z.infer<typeof WsSyncMessagesResultSchema>;

export const WsMessageRejectedPayloadSchema = z.object({
  kind: z.literal("forbidden"),
  reason: z.literal("NOT_A_MEMBER"),
});
export type WsMessageRejectedPayload = z.infer<
  typeof WsMessageRejectedPayloadSchema
>;

export const WsReadCursorSchema = z.object({
  conversationId: ConversationIdSchema,
  userId: UserIdSchema,
  lastReadMessageId: MessageIdSchema,
  updatedAt: WsWireDateSchema,
});
export type WsReadCursor = z.infer<typeof WsReadCursorSchema>;

export const WsUpdateReadCursorResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("updated"),
    cursor: WsReadCursorSchema,
  }),
  z.object({
    kind: z.literal("ignored"),
    cursor: WsReadCursorSchema.nullable(),
  }),
  z.object({
    kind: z.literal("forbidden"),
    reason: z.literal("NOT_A_MEMBER"),
  }),
]);
export type WsUpdateReadCursorResult = z.infer<
  typeof WsUpdateReadCursorResultSchema
>;

export const WsServerHelloPayloadSchema = z.object({
  socketId: z.string(),
});

export const WsServerErrorPayloadSchema = z.object({
  // ws.ts にある reason を列挙（増えたらここも増やす）
  reason: z.enum(["UNAUTHORIZED", "BAD_PAYLOAD"]),
});

export const WsServerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("server.hello"),
    payload: WsServerHelloPayloadSchema,
  }),
  z.object({
    type: z.literal("server.error"),
    payload: WsServerErrorPayloadSchema,
  }),
  z.object({
    type: z.literal("messages.synced"),
    payload: WsSyncMessagesResultSchema,
  }),
  z.object({
    type: z.literal("message.created"),
    payload: WsMessagePayloadSchema,
  }),
  z.object({
    type: z.literal("message.rejected"),
    payload: WsMessageRejectedPayloadSchema,
  }),
  z.object({
    type: z.literal("read.updated"),
    payload: WsUpdateReadCursorResultSchema,
  }),
  z.object({
    type: z.literal("typing.started"),
    payload: z.object({
      conversationId: ConversationIdSchema,
      userId: UserIdSchema,
    }),
  }),
  z.object({
    type: z.literal("typing.stopped"),
    payload: z.object({
      conversationId: ConversationIdSchema,
      userId: UserIdSchema,
    }),
  }),
]);
export type WsServerEvent = z.infer<typeof WsServerEventSchema>;

// 仮認証：クエリで userId を受ける
export const WsAuthQuerySchema = z.object({
  userId: UserIdSchema,
});

export const wsEncode = (msg: unknown): string => JSON.stringify(msg);
