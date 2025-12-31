import z from "zod";
import { randomBytes } from "crypto";
import { env } from "@/shared/env";
import { ConversationIdSchema, MessageIdSchema, type UserId, UserIdSchema } from "@/shared/ids";
import {
  createPostgresClient,
  type PostgresClient,
} from "@/shared/infra/postgres/postgresClient";
import { uuidv7 } from "@/shared/uuid";
import { makePostgresConversationMembersRepo } from "../features/conversations/infra/postgres/conversationMembersRepo";
import { makePostgresConversationRepo } from "../features/conversations/infra/postgres/conversationRepo";
import {
  makeCreateConversation,
  type CreateConversationInput,
  type CreateConversationResult,
} from "../features/conversations/usecases/createConversation";
import {
  makeListConversations,
  type ListConversationsInput,
  type ListConversationsResult,
} from "../features/conversations/usecases/listConversations";
import {
  makeGetConversation,
  type GetConversationInput,
  type GetConversationResult,
} from "../features/conversations/usecases/getConversation";
import {
  makeAddMemberToConversation,
  type AddMemberToConversationInput,
  type AddMemberToConversationResult,
} from "../features/conversations/usecases/addMemberToConversation";
import {
  makeListConversationMembers,
  type ListConversationMembersInput,
  type ListConversationMembersResult,
} from "../features/conversations/usecases/listConversationMembers";
import {
  makeLeaveConversation,
  type LeaveConversationInput,
  type LeaveConversationResult,
} from "../features/conversations/usecases/leaveConversation";
import {
  makeUpdateConversationTitle,
  type UpdateConversationTitleInput,
  type UpdateConversationTitleResult,
} from "../features/conversations/usecases/updateConversationTitle";
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
import { makePostgresUserRepo } from "@/shared/infra/postgres/userRepo";
import {
  makeUpdateUserProfile,
  type UpdateUserProfileInput,
  type UpdateUserProfileResult,
} from "../features/users/usecases/updateUserProfile";
import { makePostgresFriendshipsRepo } from "../features/friendships/infra/postgres/friendshipsRepo";
import {
  makeListFriends,
  type ListFriendsInput,
  type ListFriendsResult,
} from "../features/friendships/usecases/listFriends";
import {
  makeRemoveFriend,
  type RemoveFriendInput,
  type RemoveFriendResult,
} from "../features/friendships/usecases/removeFriend";
import { makePostgresInvitesRepo } from "../features/invites/infra/postgres/invitesRepo";
import {
  makeCreateInvite,
  type CreateInviteInput,
  type CreateInviteResult,
} from "../features/invites/usecases/createInvite";
import {
  makeGetInvite,
  type GetInviteInput,
  type GetInviteResult,
} from "../features/invites/usecases/getInvite";
import {
  makeAcceptInvite,
  type AcceptInviteInput,
  type AcceptInviteResult,
} from "../features/invites/usecases/acceptInvite";
import { InviteTokenSchema } from "../features/invites/domain";

const UserIdRowSchema = z.object({ user_id: z.string() });

export type AppServices = {
  db: PostgresClient;
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
  updateUserProfile: (input: UpdateUserProfileInput) => Promise<UpdateUserProfileResult>;
  userRepo: ReturnType<typeof makePostgresUserRepo>;
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
      messageQueryRepo,
      conversationRepo,
      readsRepo,
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
