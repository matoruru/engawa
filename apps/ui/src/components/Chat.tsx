import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ScrollArea } from "./ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useWebSocket, type WsMessage } from "../hooks/useWebSocket";
import { AddFriendToConversationDialog } from "./AddFriendToConversationDialog";
import { treaty } from "@elysiajs/eden";
import type { App as AppContract } from "@idobata/contracts";
import { Send, ArrowLeft, UserPlus, LogOut, Pencil } from "lucide-react";
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
  updateUnreadCount?: (conversationId: string, unreadCount: number) => void;
}

export function Chat({
  conversationId,
  currentUserId,
  apiUrl = "http://localhost:3000",
  wsUrl,
  onBack,
  updateUnreadCount,
}: ChatProps) {
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [memberAvatars, setMemberAvatars] = useState<Map<string, { displayName: string; avatarUrl: string | null }>>(new Map());
  const [members, setMembers] = useState<Array<{
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<Map<string, number>>(new Map());

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

  // 会話タイトルを取得
  useEffect(() => {
    const loadTitle = async () => {
      try {
        const response = await app.conversations({ conversationId }).get();
        if (response.data && "conversationId" in response.data) {
          setConversationTitle(response.data.title || `会話 ${conversationId.slice(0, 8)}`);
        } else {
          setConversationTitle(`会話 ${conversationId.slice(0, 8)}`);
        }
      } catch (error) {
        console.error("Failed to load title:", error);
        setConversationTitle(`会話 ${conversationId.slice(0, 8)}`);
      }
    };
    loadTitle();
  }, [conversationId, app]);

  // メンバー情報を取得
  useEffect(() => {
    const loadMembers = async () => {
      try {
        const response = await app.conversations({ conversationId }).members.get();
        if (response.data && "members" in response.data) {
          const members = response.data.members as Array<{
            id: string;
            username: string;
            displayName: string;
            avatarUrl: string | null;
          }>;
          const avatarMap = new Map<string, { displayName: string; avatarUrl: string | null }>();
          members.forEach((member) => {
            avatarMap.set(member.id, {
              displayName: member.displayName,
              avatarUrl: member.avatarUrl,
            });
          });
          setMemberAvatars(avatarMap);
          setMembers(members);
        }
      } catch (error) {
        console.error("Failed to load members:", error);
      }
    };
    loadMembers();
  }, [conversationId, app]);

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

  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
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

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // タイピング開始/停止の処理
  useEffect(() => {
    if (!ws.isConnected) return;

    const handleTypingStart = () => {
      if (input.trim()) {
        ws.send({
          type: "typing.start",
          payload: { conversationId },
        });
      }
    };

    const handleTypingStop = () => {
      ws.send({
        type: "typing.stop",
        payload: { conversationId },
      });
    };

    // デバウンス: 500ms後にタイピング開始を送信
    const existingTimeout = typingTimeoutRef.current.get(conversationId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    if (input.trim()) {
      const timeoutId = window.setTimeout(handleTypingStart, 500);
      typingTimeoutRef.current.set(conversationId, timeoutId);
    } else {
      handleTypingStop();
    }

    // 3秒後に自動的にタイピング停止を送信
    const stopTimeoutId = window.setTimeout(() => {
      if (input.trim()) {
        handleTypingStop();
      }
    }, 3000);

    return () => {
      const timeoutId = typingTimeoutRef.current.get(conversationId);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      clearTimeout(stopTimeoutId);
    };
  }, [input, conversationId, ws.isConnected, ws]);

  // タイピングイベントの受信
  useEffect(() => {
    if (!ws.isConnected) return;

    const unsubscribeTypingStarted = ws.on("typing.started", (event) => {
      if (event.payload.conversationId === conversationId && event.payload.userId !== currentUserId) {
        setTypingUsers((prev) => new Set(prev).add(event.payload.userId));
        // 3秒後に自動的にタイピング停止
        const timeoutId = window.setTimeout(() => {
          setTypingUsers((prev) => {
            const next = new Set(prev);
            next.delete(event.payload.userId);
            return next;
          });
        }, 3000);
        const existingTimeout = typingTimeoutRef.current.get(event.payload.userId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }
        typingTimeoutRef.current.set(event.payload.userId, timeoutId);
      }
    });

    const unsubscribeTypingStopped = ws.on("typing.stopped", (event) => {
      if (event.payload.conversationId === conversationId && event.payload.userId !== currentUserId) {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          next.delete(event.payload.userId);
          return next;
        });
        const timeoutId = typingTimeoutRef.current.get(event.payload.userId);
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    });

    return () => {
      unsubscribeTypingStarted();
      unsubscribeTypingStopped();
    };
  }, [ws.isConnected, conversationId, currentUserId, ws]);

  const handleLeaveConversation = async () => {
    if (!confirm("この会話から脱会しますか？")) {
      return;
    }

    try {
      setIsLeaving(true);
      const response = await fetch(`${apiUrl}/conversations/${conversationId}/members`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // 会話一覧に戻る
          if (onBack) {
            onBack();
          }
        } else {
          alert("脱会に失敗しました");
        }
      } else {
        alert("脱会に失敗しました");
      }
    } catch (error) {
      console.error("Failed to leave conversation:", error);
      alert("脱会に失敗しました");
    } finally {
      setIsLeaving(false);
    }
  };

  const handleSaveTitle = async () => {
    try {
      const response = await fetch(`${apiUrl}/conversations/${conversationId}/title`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: titleInput || null }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setConversationTitle(titleInput || `会話 ${conversationId.slice(0, 8)}`);
          setIsEditingTitle(false);
        }
      }
    } catch (error) {
      console.error("Failed to update title:", error);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* ヘッダー */}
      <div className="border-b border-border bg-card">
        {/* メンバー一覧 */}
        <div className="px-4 py-2 border-b border-border">
          <div className="flex items-center gap-2 overflow-x-auto">
            {members.map((member) => {
              const isOwn = member.id === currentUserId;
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-2 shrink-0 px-2 py-1 rounded-lg bg-muted/50"
                >
                  <Avatar className="h-6 w-6">
                    {member.avatarUrl ? (
                      <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                    ) : null}
                    <AvatarFallback className="text-xs">
                      {getInitials(member.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium">
                    {isOwn ? "あなた" : member.displayName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
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
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSaveTitle();
                    } else if (e.key === "Escape") {
                      setIsEditingTitle(false);
                      setTitleInput(conversationTitle || "");
                    }
                  }}
                  className="text-lg font-semibold bg-transparent border-b border-primary focus:outline-none"
                  autoFocus
                />
              </div>
            ) : (
              <h1 
                className="text-lg font-semibold cursor-pointer hover:text-primary flex items-center gap-2"
                onClick={() => {
                  setTitleInput(conversationTitle || "");
                  setIsEditingTitle(true);
                }}
              >
                <span>{conversationTitle || `会話 ${conversationId.slice(0, 8)}`}</span>
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </h1>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "text-xs px-2 py-1 rounded-full border shrink-0",
                ws.isConnected
                  ? "text-muted-foreground border-border bg-muted/30"
                  : "text-amber-700 border-amber-200 bg-amber-50"
              )}
              title={ws.isConnected ? "接続済み" : "接続中"}
            >
              {ws.isConnected ? "オンライン" : "接続中…"}
            </div>
            <Button
              onClick={() => setShowInviteDialog(true)}
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
            >
              <UserPlus className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleLeaveConversation}
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={isLeaving}
              title="会話から脱会"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        </div>
      </div>

      {/* メッセージリスト */}
      <ScrollArea className="flex-1 min-h-0 px-4">
        <div className="py-4 space-y-4">
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
              const member = memberAvatars.get(message.senderId);
              const displayName = member?.displayName || message.senderId;
              
              return (
                <div
                  key={message.messageId}
                  className={cn(
                    "flex gap-3",
                    isOwn ? "justify-end" : "justify-start"
                  )}
                >
                  {!isOwn && (
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <Avatar className="h-8 w-8">
                        {member?.avatarUrl ? (
                          <AvatarImage src={member.avatarUrl} alt={displayName} />
                        ) : (
                          <AvatarFallback className="text-xs">
                            {getInitials(displayName)}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <span className="text-xs text-muted-foreground max-w-[60px] truncate text-center">
                        {displayName}
                      </span>
                    </div>
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
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* 入力エリア */}
      <div className="border-t border-border bg-card p-4 safe-area-inset-bottom">
        {/* タイピング表示（スクロール領域の外に固定） */}
        <div
          className={cn(
            "h-6 flex items-center gap-2 text-xs text-muted-foreground transition-opacity",
            typingUsers.size > 0 ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <div className="flex gap-1">
            <div
              className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <div
              className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <div
              className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </div>
          <span className="truncate">
            {Array.from(typingUsers)
              .map((userId) => memberAvatars.get(userId)?.displayName || userId)
              .join(", ")}
            がタイプ中...
          </span>
        </div>
        <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
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
      </div>

      {/* 友達追加ダイアログ */}
      {showInviteDialog && (
        <AddFriendToConversationDialog
          conversationId={conversationId}
          apiUrl={apiUrl}
          onClose={() => setShowInviteDialog(false)}
          onInviteSuccess={() => {
            // 追加成功時の処理（必要に応じて）
          }}
        />
      )}
    </div>
  );
}

