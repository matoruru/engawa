import { env } from "@/shared/env";
import {
  createPostgresClient,
  type PostgresClient,
} from "@/shared/infra/postgres/postgresClient";
import { makePostgresConversationMembersRepo } from "../features/conversations/infra/postgres/conversationMembersRepo";
import { makePostgresMessageQueryRepo } from "../features/messages/infra/postgres/messageQueryRepo";
import { makePostgresMessageRepo } from "../features/messages/infra/postgres/messageRepo";
import {
  makeSendMessage,
  type SendMessageInput,
  type SendMessageResult,
} from "../features/messages/usecases/sendMessage";
import {
  makeSyncMessages,
  type SyncMessagesInput,
  type SyncMessagesResult,
} from "../features/messages/usecases/syncMessages";
import { makePostgresConversationReadsRepo } from "../features/reads/infra/postgres/conversationReadsRepo";
import {
  makeUpdateReadCursor,
  type UpdateReadCursorInput,
  type UpdateReadCursorResult,
} from "../features/reads/usecases/updateReadCursor";

export type AppServices = {
  db: PostgresClient;
  sendMessage: (input: SendMessageInput) => Promise<SendMessageResult>;
  syncMessages: (input: SyncMessagesInput) => Promise<SyncMessagesResult>;
  updateReadCursor: (
    input: UpdateReadCursorInput,
  ) => Promise<UpdateReadCursorResult>;
};

export const composeApp = (): AppServices => {
  const db = createPostgresClient(env.POSTGRES_URL);

  // shared port
  const membersRepo = makePostgresConversationMembersRepo(db);

  // messages
  const messageRepo = makePostgresMessageRepo(db);
  const messageQueryRepo = makePostgresMessageQueryRepo(db);

  // reads
  const readsRepo = makePostgresConversationReadsRepo(db);

  // usecases
  const sendMessage = makeSendMessage({
    messageRepo,
    membersRepo,
    now: () => new Date(),
    generateMessageId: () => {
      // TODO: uuidv7 generator を入れる。いまは一旦例外にしておく
      throw new Error("TODO: generateMessageId (uuidv7)");
      // 例: return MessageIdSchema.parse(uuidv7());
    },
  });

  const syncMessages = makeSyncMessages({
    membersRepo,
    queryRepo: messageQueryRepo,
  });

  const updateReadCursor = makeUpdateReadCursor({
    membersRepo,
    readsRepo,
    now: () => new Date(),
  });

  return {
    db,
    sendMessage,
    syncMessages,
    updateReadCursor,
  };
};
