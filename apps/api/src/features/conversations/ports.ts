import type { ConversationId } from "@/shared/ids";
import type { Conversation } from "./domain";

export interface ConversationRepository {
  create(conversationId: ConversationId): Promise<void>;
}

