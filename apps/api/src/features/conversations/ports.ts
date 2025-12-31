import type { ConversationId } from "@/shared/ids";
import type { Conversation } from "./domain";

export interface ConversationRepository {
  create(conversationId: ConversationId): Promise<void>;
  updateTitle(conversationId: ConversationId, title: string | null): Promise<void>;
  getTitle(conversationId: ConversationId): Promise<string | null>;
}

