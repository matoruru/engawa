import * as z from "zod";
import type { ConversationMembersRepository } from "@/shared/features/conversations/ports";
import {
  ConversationIdSchema,
  MessageIdSchema,
  UserIdSchema,
} from "@/shared/ids";
import type { Message } from "../domain";
import type {
  ListByConversationParams,
  MessageQueryRepository,
} from "../ports";

export const SyncMessagesInputSchema = z.object({
  conversationId: ConversationIdSchema,
  userId: UserIdSchema,
  afterMessageId: MessageIdSchema.optional(),
  limit: z.number().int().min(1).max(200),
});
export type SyncMessagesInput = z.infer<typeof SyncMessagesInputSchema>;

export interface SyncMessagesDeps {
  membersRepo: ConversationMembersRepository;
  queryRepo: MessageQueryRepository;
}

export type SyncMessagesResult =
  | { kind: "ok"; messages: readonly Message[] }
  | { kind: "forbidden"; reason: "NOT_A_MEMBER" };

export const makeSyncMessages =
  (deps: SyncMessagesDeps) =>
  async (input: SyncMessagesInput): Promise<SyncMessagesResult> => {
    const member = await deps.membersRepo.isMember(
      input.conversationId,
      input.userId,
    );
    if (!member) return { kind: "forbidden", reason: "NOT_A_MEMBER" };

    const params: ListByConversationParams = {
      conversationId: input.conversationId,
      afterMessageId: input.afterMessageId,
      limit: input.limit,
    };
    const messages = await deps.queryRepo.listByConversation(params);

    return { kind: "ok", messages };
  };
