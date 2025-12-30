import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ScrollArea } from "./ui/scroll-area";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { useWebSocket, type WsMessage } from "../hooks/useWebSocket";
import { treaty } from "@elysiajs/eden";
import type { App as AppContract } from "@kaiwa/contracts";
import { Send, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { v7 as uuidv7 } from "uuid";

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

interface ChatProps {
  conversationId: string;
  currentUserId: string;
  apiUrl?: string;
  wsUrl?: string;
  onBack?: () => void;
}

export function Chat({
  conversationId,
  currentUserId,
  apiUrl = "http://localhost:3000",
  wsUrl,
  onBack,
}: ChatProps) {
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const app = useMemo(
    () =>
      treaty<AppContract>(apiUrl, {
        fetch: {
          credentials: "include",
        },
      }),
    [apiUrl]
  );
  const ws = useWebSocket(
    wsUrl || apiUrl.replace(/^http/, "ws") + "/ws"
  );

  // メッセージをスクロール位置の最下部に表示
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 初期メッセージの読み込み
  useEffect(() => {
    const loadMessages = async () => {
      try {
        setIsLoading(true);
        const response = await app.messages.sync.post({
          conversationId,
          limit: 50,
        });

        if (response.data && "messages" in response.data && response.data.kind === "ok") {
          const apiMessages = response.data.messages;
          const wsMessages: WsMessage[] = Array.from(apiMessages).map(convertApiMessageToWsMessage);
          setMessages(wsMessages);
        }
      } catch (error) {
        console.error("Failed to load messages:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (ws.isConnected) {
      loadMessages();
    }
  }, [conversationId, ws.isConnected, app]);

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
          (m) => m.clientMessageId === event.payload.clientMessageId
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
    });

    const unsubscribeMessagesSynced = ws.on("messages.synced", (event) => {
      if (event.payload.kind === "ok") {
        setMessages(event.payload.messages);
      }
    });

    return () => {
      unsubscribeMessageCreated();
      unsubscribeMessagesSynced();
    };
  }, [ws]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;

    const messageText = input.trim();
    const clientMessageId = uuidv7();
    setInput("");
    setIsSending(true);

    try {
      // 楽観的更新: すぐにメッセージを表示
      const optimisticMessage: WsMessage = {
        messageId: `temp-${clientMessageId}`,
        conversationId,
        senderId: currentUserId,
        clientMessageId,
        messageText,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      // WebSocket経由で送信
      ws.send({
        type: "message.send",
        payload: {
          conversationId,
          clientMessageId,
          messageText,
        },
      });

      // 楽観的更新のメッセージは、実際のメッセージが来たら自動的に置き換わる
      // タイムアウトで削除する（実際のメッセージが来なかった場合のフォールバック）
      setTimeout(() => {
        setMessages((prev) => {
          // clientMessageIdで楽観的更新のメッセージを探す
          const optimisticIndex = prev.findIndex(
            (m) => m.clientMessageId === clientMessageId && m.messageId.startsWith("temp-")
          );
          if (optimisticIndex >= 0) {
            // 実際のメッセージがまだ来ていない場合のみ削除
            const hasRealMessage = prev.some(
              (m) => m.clientMessageId === clientMessageId && !m.messageId.startsWith("temp-")
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
        prev.filter((m) => m.messageId !== `temp-${clientMessageId}`)
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: string | Date) => {
    try {
      const d = typeof date === "string" ? new Date(date) : date;
      if (isNaN(d.getTime())) return "";
      return d.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const getInitials = (userId: string) => {
    return userId.slice(0, 2).toUpperCase();
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* ヘッダー */}
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button
              onClick={onBack}
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h1 className="text-lg font-semibold">チャット</h1>
        </div>
      </div>

      {/* メッセージリスト */}
      <ScrollArea className="flex-1 px-4" ref={scrollAreaRef}>
        <div className="py-4 space-y-4 min-h-full">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <p className="text-muted-foreground">読み込み中...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex justify-center py-8">
              <p className="text-muted-foreground">メッセージがありません</p>
            </div>
          ) : (
            messages.map((message) => {
              const isOwn = message.senderId === currentUserId;
              return (
                <div
                  key={message.messageId}
                  className={cn(
                    "flex gap-3",
                    isOwn ? "justify-end" : "justify-start"
                  )}
                >
                  {!isOwn && (
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs">
                        {getInitials(message.senderId)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn(
                      "flex flex-col gap-1 max-w-[80%] sm:max-w-[70%]",
                      isOwn ? "items-end" : "items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2 text-sm",
                        isOwn
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm"
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {message.messageText}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground px-1">
                      {formatTime(message.createdAt)}
                    </span>
                  </div>
                  {isOwn && (
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs">
                        {getInitials(message.senderId)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* 入力エリア */}
      <div className="border-t border-border bg-card p-4 safe-area-inset-bottom">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力..."
            className="min-h-[60px] max-h-[120px] resize-none text-base"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isSending || !ws.isConnected}
            size="icon"
            className="h-[60px] w-[60px] shrink-0 rounded-full"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
        {!ws.isConnected && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            接続中...
          </p>
        )}
      </div>
    </div>
  );
}

