import * as z from "zod";
import type { ConversationId, UserId } from "@/shared/ids";
import {
  ConversationIdSchema,
  MessageIdSchema,
  UserIdSchema,
} from "@/shared/ids";
import { AddMemberToConversationInputSchema } from "../features/conversations/usecases/addMemberToConversation";
import { CreateConversationInputSchema } from "../features/conversations/usecases/createConversation";
import { GetConversationInputSchema } from "../features/conversations/usecases/getConversation";
import { LeaveConversationInputSchema } from "../features/conversations/usecases/leaveConversation";
import { ListConversationMembersInputSchema } from "../features/conversations/usecases/listConversationMembers";
import { ListConversationsInputSchema } from "../features/conversations/usecases/listConversations";
import { UpdateConversationTitleInputSchema } from "../features/conversations/usecases/updateConversationTitle";
import { ListFriendsInputSchema } from "../features/friendships/usecases/listFriends";
import { RemoveFriendInputSchema } from "../features/friendships/usecases/removeFriend";
import { InviteTokenSchema } from "../features/invites/domain";
import { AcceptInviteInputSchema } from "../features/invites/usecases/acceptInvite";
import { CreateInviteInputSchema } from "../features/invites/usecases/createInvite";
import { GetInviteInputSchema } from "../features/invites/usecases/getInvite";
import { MessageTextSchema } from "../features/messages/domain";
import { SendMessageInputSchema } from "../features/messages/usecases/sendMessage";
import { SyncMessagesInputSchema } from "../features/messages/usecases/syncMessages";
import { UpdateReadCursorInputSchema } from "../features/reads/usecases/updateReadCursor";
import type { AppServices } from "./compose";
import { User } from "@/shared/features/users/domain";

// HTTPは senderId/userId を受け取らない。認証から userId を取得して使う。
const SendMessageHttpBodySchema = z.object({
  conversationId: ConversationIdSchema,
  clientMessageId: z.uuidv7(),
  messageText: MessageTextSchema,
});

const SyncMessagesHttpBodySchema = z.object({
  conversationId: ConversationIdSchema,
  afterMessageId: MessageIdSchema.optional(),
  limit: z.number().int().min(1).max(200),
});

const UpdateReadCursorHttpBodySchema = z.object({
  conversationId: ConversationIdSchema,
  lastReadMessageId: MessageIdSchema,
});

export const makeHttpHandlers = (svc: AppServices) => ({
  sendMessage: async (userId: UserId, body: unknown) => {
    const b = SendMessageHttpBodySchema.parse(body);
    const input = SendMessageInputSchema.parse({ ...b, senderId: userId });
    return svc.sendMessage(input);
  },

  syncMessages: async (userId: UserId, body: unknown) => {
    const b = SyncMessagesHttpBodySchema.parse(body);
    const input = SyncMessagesInputSchema.parse({ ...b, userId });
    return svc.syncMessages(input);
  },

  updateReadCursor: async (userId: UserId, body: unknown) => {
    const b = UpdateReadCursorHttpBodySchema.parse(body);
    const input = UpdateReadCursorInputSchema.parse({ ...b, userId });
    return svc.updateReadCursor(input);
  },

  listConversations: async (userId: UserId) => {
    const input = ListConversationsInputSchema.parse({ userId });
    const result = await svc.listConversations(input);
    if (result.kind === "ok") {
      return { conversations: result.conversations };
    }
    throw new Error("Unexpected result from listConversations");
  },

  getConversation: async (userId: UserId, conversationId: ConversationId) => {
    const input = GetConversationInputSchema.parse({ userId, conversationId });
    const result = await svc.getConversation(input);
    if (result.kind === "ok") {
      return { conversationId: result.conversationId, title: result.title };
    }
    if (result.kind === "notFound") {
      return { error: "NOT_FOUND" };
    }
    if (result.kind === "forbidden") {
      return { error: "FORBIDDEN", reason: result.reason };
    }
    throw new Error("Unexpected result from getConversation");
  },

  createConversation: async (userId: UserId) => {
    const input = CreateConversationInputSchema.parse({ userId });
    const result = await svc.createConversation(input);
    if (result.kind === "created") {
      return { conversationId: result.conversationId };
    }
    throw new Error("Unexpected result from createConversation");
  },

  getCurrentUser: async (userId: UserId): Promise<{user: User} | {error: "USER_NOT_FOUND"}> => {
    // キャッシュから取得を試みる
    const cacheKey = `user:${userId}`;
    const cached = await svc.cache.get<User>(cacheKey);
    if (cached) {
      return { user: cached };
    }

    const user = await svc.userRepo.findById(userId);
    if (!user) {
      return { error: "USER_NOT_FOUND" };
    }

    // キャッシュに保存（5分間）
    await svc.cache.set(cacheKey, user, 300);
    return { user };
  },

  updateUserProfile: async (userId: UserId, body: unknown) => {
    const UpdateUserProfileHttpBodySchema = z.object({
      displayName: z.string().min(1).max(100).optional(),
      username: z.string().min(1).max(50).optional(),
      avatarUrl: z.string().nullable().optional(),
    });
    const b = UpdateUserProfileHttpBodySchema.parse(body);
    const result = await svc.updateUserProfile({
      userId,
      displayName: b.displayName,
      username: b.username,
      avatarUrl: b.avatarUrl,
    });

    if (result.kind === "updated") {
      return { success: true };
    } else if (result.kind === "conflict") {
      return { success: false, error: result.reason };
    } else if (result.kind === "notFound") {
      return { success: false, error: "USER_NOT_FOUND" };
    }
    throw new Error("Unexpected result from updateUserProfile");
  },

  searchUsers: async (userId: UserId, query: string) => {
    if (!query || query.trim().length === 0) {
      return { users: [] };
    }

    const searchTerm = `%${query.trim()}%`;
    const rows = await svc.db`
      SELECT id, username, display_name
      FROM users
      WHERE (username ILIKE ${searchTerm} OR display_name ILIKE ${searchTerm})
        AND id != ${userId}
      ORDER BY display_name ASC, username ASC
      LIMIT 20
    `;

    const UserRowSchema = z.object({
      id: z.string(),
      username: z.string(),
      display_name: z.string().nullable(),
    });

    const parsed = z.array(UserRowSchema).parse(rows);

    return {
      users: parsed.map((row) => ({
        id: String(row.id),
        username: String(row.username),
        displayName: String(row.display_name || row.username),
      })),
    };
  },

  addMemberToConversation: async (
    userId: UserId,
    conversationId: ConversationId,
    targetUserId: UserId,
  ) => {
    const input = AddMemberToConversationInputSchema.parse({
      userId,
      conversationId,
      targetUserId,
    });
    const result = await svc.addMemberToConversation(input);

    if (result.kind === "added") {
      return { success: true };
    } else if (result.kind === "forbidden") {
      return { success: false, error: result.reason };
    } else if (result.kind === "conflict") {
      return { success: false, error: result.reason };
    }
    throw new Error("Unexpected result from addMemberToConversation");
  },

  listConversationMembers: async (
    userId: UserId,
    conversationId: ConversationId,
  ) => {
    const input = ListConversationMembersInputSchema.parse({
      userId,
      conversationId,
    });
    const result = await svc.listConversationMembers(input);

    if (result.kind === "ok") {
      return { success: true, members: result.members };
    } else if (result.kind === "forbidden") {
      return { success: false, error: result.reason };
    }
    throw new Error("Unexpected result from listConversationMembers");
  },

  leaveConversation: async (userId: UserId, conversationId: ConversationId) => {
    const input = LeaveConversationInputSchema.parse({
      userId,
      conversationId,
    });
    const result = await svc.leaveConversation(input);

    if (result.kind === "left") {
      return { success: true };
    } else if (result.kind === "forbidden") {
      return { success: false, error: result.reason };
    }
    throw new Error("Unexpected result from leaveConversation");
  },

  updateConversationTitle: async (
    userId: UserId,
    conversationId: ConversationId,
    title: string | null,
  ) => {
    const input = UpdateConversationTitleInputSchema.parse({
      userId,
      conversationId,
      title,
    });
    const result = await svc.updateConversationTitle(input);

    if (result.kind === "updated") {
      // キャッシュを無効化
      await svc.cache.delete(`conversation:title:${conversationId}`);
      return { success: true };
    } else if (result.kind === "forbidden") {
      return { success: false, error: result.reason };
    }
    throw new Error("Unexpected result from updateConversationTitle");
  },

  listFriends: async (userId: UserId) => {
    const input = ListFriendsInputSchema.parse({ userId });
    const result = await svc.listFriends(input);
    if (result.kind === "ok") {
      return { friends: result.friends };
    }
    throw new Error("Unexpected result from listFriends");
  },

  createInvite: async (userId: UserId) => {
    const input = CreateInviteInputSchema.parse({ userId });
    const result = await svc.createInvite(input);
    if (result.kind === "created") {
      return { token: result.token, inviteUrl: result.inviteUrl };
    }
    throw new Error("Unexpected result from createInvite");
  },

  getInvite: async (token: string) => {
    const input = GetInviteInputSchema.parse({
      token: InviteTokenSchema.parse(token),
    });
    const result = await svc.getInvite(input);
    if (result.kind === "ok") {
      return { invite: result.invite };
    } else if (result.kind === "notFound") {
      return { error: "NOT_FOUND" };
    } else if (result.kind === "expired") {
      return { error: "EXPIRED" };
    } else if (result.kind === "alreadyAccepted") {
      return { error: "ALREADY_ACCEPTED" };
    }
    throw new Error("Unexpected result from getInvite");
  },

  acceptInvite: async (userId: UserId, token: string) => {
    const input = AcceptInviteInputSchema.parse({
      token: InviteTokenSchema.parse(token),
      userId,
    });
    const result = await svc.acceptInvite(input);
    if (result.kind === "accepted") {
      return { success: true };
    } else if (result.kind === "notFound") {
      return { success: false, error: "NOT_FOUND" };
    } else if (result.kind === "expired") {
      return { success: false, error: "EXPIRED" };
    } else if (result.kind === "alreadyAccepted") {
      return { success: false, error: "ALREADY_ACCEPTED" };
    } else if (result.kind === "conflict") {
      return { success: false, error: result.reason };
    }
    throw new Error("Unexpected result from acceptInvite");
  },

  removeFriend: async (userId: UserId, body: unknown) => {
    const b = z.object({ friendId: UserIdSchema }).parse(body);
    const input = RemoveFriendInputSchema.parse({
      userId,
      friendId: b.friendId,
    });
    const result = await svc.removeFriend(input);
    if (result.kind === "removed") {
      return { success: true };
    }
    throw new Error("Unexpected result from removeFriend");
  },
});
