import z from "zod";
import { env } from "@/shared/env";
import { MessageIdSchema, type UserId, UserIdSchema } from "@/shared/ids";
import {
  createPostgresClient,
  type PostgresClient,
} from "@/shared/infra/postgres/postgresClient";
import { uuidv7 } from "@/shared/uuid";
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

const UserIdRowSchema = z.object({ user_id: z.string() });

export type AppServices = {
  db: PostgresClient;
  resolveAppUserIdFromBetterAuthUserId: (
    authUserId: string,
  ) => Promise<UserId | null>;
  sendMessage: (input: SendMessageInput) => Promise<SendMessageResult>;
  syncMessages: (input: SyncMessagesInput) => Promise<SyncMessagesResult>;
  updateReadCursor: (
    input: UpdateReadCursorInput,
  ) => Promise<UpdateReadCursorResult>;
};

export const composeApp = (): AppServices => {
  const db = createPostgresClient(env.POSTGRES_URL);

  const resolveAppUserIdFromAuthUserId = async (
    authUserId: string,
  ): Promise<UserId | null> => {
    const rows = await db`
      SELECT user_id
      FROM user_identities
      WHERE provider = 'better-auth'
        AND provider_subject = ${authUserId}
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    const parsed = UserIdRowSchema.parse(rows[0]);
    return UserIdSchema.parse(parsed.user_id) as UserId;
  };

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
      return MessageIdSchema.parse(uuidv7());
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
    resolveAppUserIdFromBetterAuthUserId: resolveAppUserIdFromAuthUserId,
    sendMessage,
    syncMessages,
    updateReadCursor,
  };
};
