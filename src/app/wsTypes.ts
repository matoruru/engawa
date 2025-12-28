import * as z from "zod";
import { SendMessageInputSchema } from "../features/messages/usecases/sendMessage";
import { SyncMessagesInputSchema } from "../features/messages/usecases/syncMessages";
import { UpdateReadCursorInputSchema } from "../features/reads/usecases/updateReadCursor";

export const WsClientEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("messages.sync"),
    payload: SyncMessagesInputSchema,
  }),
  z.object({
    type: z.literal("message.send"),
    payload: SendMessageInputSchema,
  }),
  z.object({
    type: z.literal("read.update"),
    payload: UpdateReadCursorInputSchema,
  }),
]);

export const wsEncode = (msg: unknown): string => JSON.stringify(msg);
