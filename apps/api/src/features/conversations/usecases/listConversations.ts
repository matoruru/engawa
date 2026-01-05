import * as z from "zod";
import type { ConversationMembersRepository } from "@/shared/features/conversations/ports";
import type { UserRepository } from "@/shared/features/users/ports";
import { UserIdSchema } from "@/shared/ids";
import type { Message } from "../../messages/domain";
import type { MessageQueryRepository } from "../../messages/ports";
import type { ConversationReadsRepository } from "../../reads/ports";
import type { ConversationRepository } from "../ports";

export const ListConversationsInputSchema = z.object({
  userId: UserIdSchema,
});
export type ListConversationsInput = z.infer<
  typeof ListConversationsInputSchema
>;

export interface ListConversationsDeps {
  membersRepo: ConversationMembersRepository;
  conversationRepo: ConversationRepository;
  messageQueryRepo: MessageQueryRepository;
  readsRepo: ConversationReadsRepository;
  userRepo: UserRepository;
}

export type MessageWithSenderDisplayName = Message & {
  senderDisplayName: string;
};

export type ConversationPreview = {
  conversationId: string;
  title: string | null;
  latestMessages: readonly MessageWithSenderDisplayName[];
  unreadCount: number;
  latestMessageCreatedAt: Date | null;
};

export type ListConversationsResult = {
  kind: "ok";
  conversations: readonly ConversationPreview[];
};

export const makeListConversations =
  (deps: ListConversationsDeps) =>
  async (input: ListConversationsInput): Promise<ListConversationsResult> => {
    // ユーザーが参加している会話のリストを取得
    const conversationIds = await deps.membersRepo.listByUserId(input.userId);

    // 各会話の情報を並列で取得
    const conversationData = await Promise.all(
      conversationIds.map(async (conversationId) => {
        const [title, latestMessages, readCursor] = await Promise.all([
          deps.conversationRepo.getTitle(conversationId),
          deps.messageQueryRepo.listLatestByConversation(conversationId, 2),
          deps.readsRepo.get(conversationId, input.userId),
        ]);

        // 未読数を計算
        const lastReadMessageId = readCursor?.lastReadMessageId ?? null;
        const unreadCount = await deps.messageQueryRepo.countUnread(
          conversationId,
          lastReadMessageId,
        );

        // 最新メッセージの作成日時を取得
        const latestMessageCreatedAt =
          latestMessages.length > 0
            ? (latestMessages[latestMessages.length - 1]?.createdAt ?? null)
            : null;

        // 送信者のIDを収集
        const senderIds = latestMessages.map((m) => m.senderId);
        const users = await deps.userRepo.findByIds(senderIds);
        const userMap = new Map(users.map((u) => [u.id, u]));

        // メッセージに送信者情報を付与
        const messagesWithSender: MessageWithSenderDisplayName[] =
          latestMessages.map((message) => {
            const user = userMap.get(message.senderId);
            return {
              ...message,
              senderDisplayName: user?.displayName ?? "不明なユーザー",
            };
          });

        return {
          conversationId: String(conversationId),
          title,
          latestMessages: messagesWithSender,
          unreadCount,
          latestMessageCreatedAt,
        };
      }),
    );

    // 最新メッセージ順に並べ替え（最新メッセージがない会話は最後）
    const conversations = conversationData
      .sort((a, b) => {
        if (!a.latestMessageCreatedAt && !b.latestMessageCreatedAt) return 0;
        if (!a.latestMessageCreatedAt) return 1;
        if (!b.latestMessageCreatedAt) return -1;
        return (
          b.latestMessageCreatedAt.getTime() -
          a.latestMessageCreatedAt.getTime()
        );
      })
      .map((conv) => ({
        conversationId: conv.conversationId,
        title: conv.title,
        latestMessages: conv.latestMessages.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        ),
        unreadCount: conv.unreadCount,
        latestMessageCreatedAt: conv.latestMessageCreatedAt,
      }));

    return {
      kind: "ok",
      conversations,
    };
  };
