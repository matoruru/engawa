import { randomBytes } from "crypto";
import z from "zod";
import { env } from "@/shared/env";
import { makePostgresUserRepo } from "@/shared/features/users/infra/postgres/userRepo";
import {
  ConversationIdSchema,
  MessageIdSchema,
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import type { CacheStore } from "@/shared/infra/cache/cachePort";
import { makeInMemoryCache } from "@/shared/infra/cache/inMemoryCache";
import {
  createPostgresClient,
  type PostgresClient,
} from "@/shared/infra/postgres/postgresClient";
import { uuidv7 } from "@/shared/uuid";
import { makePostgresConversationMembersRepo } from "../features/conversations/infra/postgres/conversationMembersRepo";
import { makePostgresConversationRepo } from "../features/conversations/infra/postgres/conversationRepo";
import {
  type AddMemberToConversationInput,
  type AddMemberToConversationResult,
  makeAddMemberToConversation,
} from "../features/conversations/usecases/addMemberToConversation";
import {
  type CreateConversationInput,
  type CreateConversationResult,
  makeCreateConversation,
} from "../features/conversations/usecases/createConversation";
import {
  type GetConversationInput,
  type GetConversationResult,
  makeGetConversation,
} from "../features/conversations/usecases/getConversation";
import {
  type LeaveConversationInput,
  type LeaveConversationResult,
  makeLeaveConversation,
} from "../features/conversations/usecases/leaveConversation";
import {
  type ListConversationMembersInput,
  type ListConversationMembersResult,
  makeListConversationMembers,
} from "../features/conversations/usecases/listConversationMembers";
import {
  type ListConversationsInput,
  type ListConversationsResult,
  makeListConversations,
} from "../features/conversations/usecases/listConversations";
import {
  makeUpdateConversationTitle,
  type UpdateConversationTitleInput,
  type UpdateConversationTitleResult,
} from "../features/conversations/usecases/updateConversationTitle";
import { makePostgresFriendshipsRepo } from "../features/friendships/infra/postgres/friendshipsRepo";
import {
  type ListFriendsInput,
  type ListFriendsResult,
  makeListFriends,
} from "../features/friendships/usecases/listFriends";
import {
  makeRemoveFriend,
  type RemoveFriendInput,
  type RemoveFriendResult,
} from "../features/friendships/usecases/removeFriend";
import { InviteTokenSchema } from "../features/invites/domain";
import { makePostgresInvitesRepo } from "../features/invites/infra/postgres/invitesRepo";
import {
  type AcceptInviteInput,
  type AcceptInviteResult,
  makeAcceptInvite,
} from "../features/invites/usecases/acceptInvite";
import {
  type CreateInviteInput,
  type CreateInviteResult,
  makeCreateInvite,
} from "../features/invites/usecases/createInvite";
import {
  type GetInviteInput,
  type GetInviteResult,
  makeGetInvite,
} from "../features/invites/usecases/getInvite";
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
import {
  makeUpdateUserProfile,
  type UpdateUserProfileInput,
  type UpdateUserProfileResult,
} from "../features/users/usecases/updateUserProfile";

const UserIdRowSchema = z.object({ user_id: z.string() });

export type AppServices = {
  db: PostgresClient;
  cache: CacheStore;
  membersRepo: ReturnType<typeof makePostgresConversationMembersRepo>;
  resolveAppUserIdFromBetterAuthUserId: (
    authUserId: string,
  ) => Promise<UserId | null>;
  sendMessage: (input: SendMessageInput) => Promise<SendMessageResult>;
  syncMessages: (input: SyncMessagesInput) => Promise<SyncMessagesResult>;
  updateReadCursor: (
    input: UpdateReadCursorInput,
  ) => Promise<UpdateReadCursorResult>;
  createConversation: (
    input: CreateConversationInput,
  ) => Promise<CreateConversationResult>;
  listConversations: (
    input: ListConversationsInput,
  ) => Promise<ListConversationsResult>;
  getConversation: (
    input: GetConversationInput,
  ) => Promise<GetConversationResult>;
  addMemberToConversation: (
    input: AddMemberToConversationInput,
  ) => Promise<AddMemberToConversationResult>;
  listConversationMembers: (
    input: ListConversationMembersInput,
  ) => Promise<ListConversationMembersResult>;
  leaveConversation: (
    input: LeaveConversationInput,
  ) => Promise<LeaveConversationResult>;
  updateConversationTitle: (
    input: UpdateConversationTitleInput,
  ) => Promise<UpdateConversationTitleResult>;
  listFriends: (input: ListFriendsInput) => Promise<ListFriendsResult>;
  removeFriend: (input: RemoveFriendInput) => Promise<RemoveFriendResult>;
  createInvite: (input: CreateInviteInput) => Promise<CreateInviteResult>;
  getInvite: (input: GetInviteInput) => Promise<GetInviteResult>;
  acceptInvite: (input: AcceptInviteInput) => Promise<AcceptInviteResult>;
  updateUserProfile: (
    input: UpdateUserProfileInput,
  ) => Promise<UpdateUserProfileResult>;
  userRepo: ReturnType<typeof makePostgresUserRepo>;
};

export const composeApp = (): AppServices => {
  const db = createPostgresClient({
    POSTGRES_HOST: env.POSTGRES_HOST,
    POSTGRES_PORT: env.POSTGRES_PORT,
    POSTGRES_USER: env.POSTGRES_USER,
    POSTGRES_PASSWORD: env.POSTGRES_PASSWORD,
    POSTGRES_DATABASE: env.POSTGRES_DATABASE,
  });

  const cache = makeInMemoryCache();

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
  const userRepo = makePostgresUserRepo(db);
  const friendshipsRepo = makePostgresFriendshipsRepo(db);
  const invitesRepo = makePostgresInvitesRepo(db);

  // conversations
  const conversationRepo = makePostgresConversationRepo(db);

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

  // conversations usecases
  const createConversation = makeCreateConversation({
    conversationRepo,
    membersRepo,
    generateConversationId: () => {
      return ConversationIdSchema.parse(uuidv7());
    },
    now: () => new Date(),
  });

  const listConversations = makeListConversations({
    membersRepo,
    conversationRepo,
    messageQueryRepo,
    readsRepo,
    userRepo,
  });

  const getConversation = makeGetConversation({
    conversationRepo,
    membersRepo,
  });

  const addMemberToConversation = makeAddMemberToConversation({
    membersRepo,
  });

  const listConversationMembers = makeListConversationMembers({
    userRepo,
    membersRepo,
  });

  const leaveConversation = makeLeaveConversation({
    membersRepo,
  });

  const updateConversationTitle = makeUpdateConversationTitle({
    conversationRepo,
    membersRepo,
  });

  // friendships usecases
  const listFriends = makeListFriends({
    friendshipsRepo,
    userRepo,
  });

  const removeFriend = makeRemoveFriend({
    friendshipsRepo,
  });

  // invites usecases
  const createInvite = makeCreateInvite({
    invitesRepo,
    generateToken: () => {
      // crypto.randomBytesを使ってランダムなトークンを生成（32バイト = 64文字のhex）
      const token = randomBytes(32).toString("hex");
      return InviteTokenSchema.parse(token);
    },
    now: () => new Date(),
  });

  const getInvite = makeGetInvite({
    invitesRepo,
    userRepo,
    now: () => new Date(),
  });

  const acceptInvite = makeAcceptInvite({
    invitesRepo,
    friendshipsRepo,
    now: () => new Date(),
  });

  return {
    db,
    cache,
    membersRepo,
    resolveAppUserIdFromBetterAuthUserId: resolveAppUserIdFromAuthUserId,
    sendMessage,
    syncMessages,
    updateReadCursor,
    createConversation,
    listConversations,
    getConversation,
    addMemberToConversation,
    listConversationMembers,
    leaveConversation,
    updateConversationTitle,
    listFriends,
    removeFriend,
    createInvite,
    getInvite,
    acceptInvite,
    updateUserProfile: makeUpdateUserProfile({ userRepo }),
    userRepo,
  };
};
