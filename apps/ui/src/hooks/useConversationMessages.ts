import { useCallback, useEffect, useRef, useState } from "react";
import { v7 as uuidv7 } from "uuid";
import { useApi } from "./useApi";
import { useWebSocket, type WsMessage } from "./useWebSocket";

// APIのMessage型からWsMessage型への変換
function convertApiMessageToWsMessage(message: {
  readonly [x: string]: unknown;
  readonly messageText: string & { __brand?: "MessageText" };
  readonly createdAt: Date;
}): WsMessage {
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
  wsUrl: string;
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
  wsUrl,
  updateUnreadCount,
}: UseConversationMessagesOptions): UseConversationMessagesReturn {
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const app = useApi(apiUrl);
  const ws = useWebSocket(wsUrl);
  const cancelledRef = useRef(false);

  // メッセージの読み込みとWebSocketでのjoin
  useEffect(() => {
    cancelledRef.current = false;

    const loadMessages = async () => {
      try {
        setIsLoading(true);

        // WebSocketが接続されるまで待つ（最大5秒）
        let waitCount = 0;
        while (!ws.isConnected && waitCount < 50) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          waitCount++;
        }

        if (cancelledRef.current) return;

        // WebSocketで会話にjoinするためにmessages.syncを送信
        if (ws.isConnected) {
          ws.send({
            type: "messages.sync",
            payload: {
              conversationId,
              limit: 50,
            },
          });
        } else {
          // WebSocketが接続されていない場合はHTTPで取得
          const response = await app.messages.sync.post({
            conversationId,
            limit: 50,
          });

          if (
            response.data &&
            "messages" in response.data &&
            response.data.kind === "ok"
          ) {
            const apiMessages = response.data.messages;
            const wsMessages: WsMessage[] = Array.from(apiMessages).map(
              convertApiMessageToWsMessage,
            );
            if (!cancelledRef.current) {
              setMessages(wsMessages);

              // メッセージを読み込んだら、最新のメッセージIDでread cursorを更新
              if (wsMessages.length > 0) {
                const latestMessage = wsMessages[wsMessages.length - 1];
                if (ws.isConnected) {
                  ws.send({
                    type: "read.update",
                    payload: {
                      conversationId,
                      lastReadMessageId: latestMessage.messageId,
                    },
                  });
                }
                // 未読数を0に更新
                if (updateUnreadCount) {
                  updateUnreadCount(conversationId, 0);
                }
              }
              setIsLoading(false);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load messages:", error);
        if (!cancelledRef.current) {
          setIsLoading(false);
        }
      }
    };

    loadMessages();

    return () => {
      cancelledRef.current = true;
    };
  }, [conversationId, ws.isConnected, app, updateUnreadCount, ws.send, ws]);

  // WebSocketイベントの処理
  useEffect(() => {
    const unsubscribeMessageCreated = ws.on("message.created", (event) => {
      setMessages((prev) => {
        // messageIdで重複チェック
        if (prev.some((m) => m.messageId === event.payload.messageId)) {
          return prev;
        }

        // clientMessageIdで重複チェック（楽観的更新のメッセージを置き換え）
        const existingIndex = prev.findIndex(
          (m) => m.clientMessageId === event.payload.clientMessageId,
        );

        if (existingIndex >= 0) {
          // 楽観的更新のメッセージを実際のメッセージで置き換え
          const newMessages = [...prev];
          newMessages[existingIndex] = event.payload;
          return newMessages;
        }

        // 新規メッセージとして追加
        return [...prev, event.payload];
      });

      // 会話を表示中なら、届いたメッセージまで既読にする
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
      if (event.payload.kind === "ok") {
        const apiMessages = event.payload.messages;
        const wsMessages: WsMessage[] = Array.from(apiMessages).map(
          convertApiMessageToWsMessage,
        );
        setMessages(wsMessages);
        setIsLoading(false);

        // メッセージを読み込んだら、最新のメッセージIDでread cursorを更新
        if (wsMessages.length > 0) {
          const latestMessage = wsMessages[wsMessages.length - 1];
          ws.send({
            type: "read.update",
            payload: {
              conversationId,
              lastReadMessageId: latestMessage.messageId,
            },
          });
          // 未読数を0に更新
          if (updateUnreadCount) {
            updateUnreadCount(conversationId, 0);
          }
        }
      }
    });

    return () => {
      unsubscribeMessageCreated();
      unsubscribeMessagesSynced();
    };
  }, [conversationId, updateUnreadCount, ws.send, ws.on]);

  // メッセージ送信
  const sendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || isSending) return;

      const clientMessageId = uuidv7();
      setIsSending(true);

      try {
        // 楽観的更新: すぐにメッセージを表示
        const optimisticMessage: WsMessage = {
          messageId: `temp-${clientMessageId}`,
          conversationId,
          senderId: currentUserId,
          clientMessageId,
          messageText: messageText.trim(),
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, optimisticMessage]);

        // WebSocket経由で送信
        ws.send({
          type: "message.send",
          payload: {
            conversationId,
            clientMessageId,
            messageText: messageText.trim(),
          },
        });

        // 楽観的更新のメッセージは、実際のメッセージが来たら自動的に置き換わる
        // タイムアウトで削除する（実際のメッセージが来なかった場合のフォールバック）
        setTimeout(() => {
          setMessages((prev) => {
            // clientMessageIdで楽観的更新のメッセージを探す
            const optimisticIndex = prev.findIndex(
              (m) =>
                m.clientMessageId === clientMessageId &&
                m.messageId.startsWith("temp-"),
            );
            if (optimisticIndex >= 0) {
              // 実際のメッセージがまだ来ていない場合のみ削除
              const hasRealMessage = prev.some(
                (m) =>
                  m.clientMessageId === clientMessageId &&
                  !m.messageId.startsWith("temp-"),
              );
              if (!hasRealMessage) {
                return prev.filter((_, index) => index !== optimisticIndex);
              }
            }
            return prev;
          });
        }, 5000);
      } catch (error) {
        console.error("Failed to send message:", error);
        // エラー時は楽観的更新を削除
        setMessages((prev) =>
          prev.filter((m) => m.messageId !== `temp-${clientMessageId}`),
        );
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, currentUserId, isSending, ws.send],
  );

  return {
    messages,
    isLoading,
    isSending,
    sendMessage,
  };
}

