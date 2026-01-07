import { useCallback, useEffect, useRef, useState } from "react";
import { v7 as uuidv7 } from "uuid";
import type { Message } from "../../../api/src/features/messages/domain";
import { useApi } from "./useApi";
import type { WebSocketClient, WsMessage } from "./useWebSocket";

function convertApiMessageToWsMessage(message: Message): WsMessage {
  return {
    messageId: String(message.messageId),
    conversationId: String(message.conversationId),
    senderId: String(message.senderId),
    clientMessageId: String(message.clientMessageId),
    messageText: String(message.messageText),
    createdAt:
      typeof message.createdAt === "string"
        ? message.createdAt
        : message.createdAt instanceof Date
          ? message.createdAt.toISOString()
          : new Date(message.createdAt).toISOString(),
  };
}

export interface UseConversationMessagesOptions {
  conversationId: string;
  currentUserId: string;
  apiUrl: string;
  ws: WebSocketClient;
  updateUnreadCount?: (conversationId: string, unreadCount: number) => void;
}

export interface UseConversationMessagesReturn {
  messages: WsMessage[];
  isLoading: boolean;
  isSending: boolean;
  sendMessage: (messageText: string) => Promise<void>;
}

export function useConversationMessages({
  conversationId,
  currentUserId,
  apiUrl,
  ws,
  updateUnreadCount,
}: UseConversationMessagesOptions): UseConversationMessagesReturn {
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const app = useApi(apiUrl);
  const cancelledRef = useRef(false);

  // conversationごとにmessages.syncを送ったか（接続復帰時の重複送信も抑制）
  const lastSyncedConversationRef = useRef<string | null>(null);

  // 初期表示はHTTPで即取得（体感を速くする）
  useEffect(() => {
    cancelledRef.current = false;

    const loadViaHttp = async () => {
      try {
        setIsLoading(true);
        const response = await app.messages.sync.post({
          conversationId,
          limit: 50,
        });

        if (cancelledRef.current) return;

        if (
          response.data &&
          "messages" in response.data &&
          response.data.kind === "ok"
        ) {
          const wsMessages = response.data.messages.map(
            convertApiMessageToWsMessage,
          );
          setMessages(wsMessages);
          setIsLoading(false);

          if (wsMessages.length > 0) {
            const latest = wsMessages[wsMessages.length - 1];

            // 既読更新（WSが繋がっていればWSで、そうでなければ後でsyncedで更新される）
            if (ws.isConnected) {
              ws.send({
                type: "read.update",
                payload: {
                  conversationId,
                  lastReadMessageId: latest.messageId,
                },
              });
            }
            updateUnreadCount?.(conversationId, 0);
          }
        } else {
          setIsLoading(false);
        }
      } catch (e) {
        console.error("Failed to load messages:", e);
        if (!cancelledRef.current) setIsLoading(false);
      }
    };

    // 会話切替時は一旦同期フラグをリセット
    lastSyncedConversationRef.current = null;

    loadViaHttp();

    return () => {
      cancelledRef.current = true;
    };
  }, [conversationId, app, ws.isConnected, ws.send, updateUnreadCount]);

  // WS接続できたら最新化のためにmessages.sync（HTTPより遅れてもOK）
  useEffect(() => {
    if (!ws.isConnected) return;
    if (lastSyncedConversationRef.current === conversationId) return;

    lastSyncedConversationRef.current = conversationId;
    ws.send({
      type: "messages.sync",
      payload: { conversationId, limit: 50 },
    });
  }, [ws.isConnected, ws.send, conversationId]);

  // WSイベントの処理
  useEffect(() => {
    const unsubscribeMessageCreated = ws.on("message.created", (event) => {
      setMessages((prev) => {
        if (prev.some((m) => m.messageId === event.payload.messageId))
          return prev;

        const existingIndex = prev.findIndex(
          (m) => m.clientMessageId === event.payload.clientMessageId,
        );
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = event.payload;
          return next;
        }
        return [...prev, event.payload];
      });

      if (event.payload.conversationId === conversationId) {
        ws.send({
          type: "read.update",
          payload: {
            conversationId,
            lastReadMessageId: event.payload.messageId,
          },
        });
        updateUnreadCount?.(conversationId, 0);
      }
    });

    const unsubscribeMessagesSynced = ws.on("messages.synced", (event) => {
      if (event.payload.kind !== "ok") return;

      const wsMessages: WsMessage[] = event.payload.messages.map(
        convertApiMessageToWsMessage,
      );
      setMessages(wsMessages);
      setIsLoading(false);

      if (wsMessages.length > 0) {
        const latest = wsMessages[wsMessages.length - 1];
        ws.send({
          type: "read.update",
          payload: { conversationId, lastReadMessageId: latest.messageId },
        });
        updateUnreadCount?.(conversationId, 0);
      }
    });

    return () => {
      unsubscribeMessageCreated();
      unsubscribeMessagesSynced();
    };
  }, [conversationId, updateUnreadCount, ws]);

  const sendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || isSending) return;

      const clientMessageId = uuidv7();
      setIsSending(true);

      try {
        const optimistic: WsMessage = {
          messageId: `temp-${clientMessageId}`,
          conversationId,
          senderId: currentUserId,
          clientMessageId,
          messageText: messageText.trim(),
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, optimistic]);

        ws.send({
          type: "message.send",
          payload: {
            conversationId,
            clientMessageId,
            messageText: messageText.trim(),
          },
        });

        setTimeout(() => {
          setMessages((prev) => {
            const idx = prev.findIndex(
              (m) =>
                m.clientMessageId === clientMessageId &&
                m.messageId.startsWith("temp-"),
            );
            if (idx < 0) return prev;

            const hasReal = prev.some(
              (m) =>
                m.clientMessageId === clientMessageId &&
                !m.messageId.startsWith("temp-"),
            );
            if (hasReal) return prev;

            return prev.filter((_, i) => i !== idx);
          });
        }, 5000);
      } catch (error) {
        console.error("Failed to send message:", error);
        setMessages((prev) =>
          prev.filter((m) => m.messageId !== `temp-${clientMessageId}`),
        );
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, currentUserId, isSending, ws],
  );

  return { messages, isLoading, isSending, sendMessage };
}
