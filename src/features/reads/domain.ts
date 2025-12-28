import * as z from "zod";
import {
  ConversationIdSchema,
  MessageIdSchema,
  UserIdSchema,
} from "@/shared/ids";

export const ReadCursorSchema = z.object({
  conversationId: ConversationIdSchema,
  userId: UserIdSchema,
  lastReadMessageId: MessageIdSchema,
  updatedAt: z.date(),
});
export type ReadCursor = z.infer<typeof ReadCursorSchema>;
