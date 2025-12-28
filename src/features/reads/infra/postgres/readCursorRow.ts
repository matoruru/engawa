import * as z from "zod";
import {
  ConversationIdSchema,
  MessageIdSchema,
  UserIdSchema,
} from "@/shared/ids";
import { type ReadCursor, ReadCursorSchema } from "../../domain";

// updated_at が Date の時も string の時も吸収
const UpdatedAtSchema = z.preprocess((v) => {
  if (v instanceof Date) return v;
  return new Date(String(v));
}, z.date());

// snake_case row の “形” だけ薄く検証
export const ReadCursorRowSchema = z.object({
  conversation_id: ConversationIdSchema,
  user_id: UserIdSchema,
  last_read_message_id: MessageIdSchema,
  updated_at: UpdatedAtSchema,
});
export type ReadCursorRow = z.infer<typeof ReadCursorRowSchema>;

export const readCursorRowToDomainInput = (r: ReadCursorRow) => ({
  conversationId: r.conversation_id,
  userId: r.user_id,
  lastReadMessageId: r.last_read_message_id,
  updatedAt: r.updated_at,
});

// ドメインに変換
export const parseReadCursorFromRow = (row: unknown): ReadCursor => {
  const r = ReadCursorRowSchema.parse(row);
  return ReadCursorSchema.parse(readCursorRowToDomainInput(r));
};
