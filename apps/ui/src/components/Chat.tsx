import { ArrowLeft, LogOut, Pencil, Send, UserPlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { useConversationMessages } from "@/hooks/useConversationMessages";
import { cn } from "@/lib/utils";
import { useWebSocket, type WsEnvelope } from "../hooks/useWebSocket";
import { AddFriendToConversationDialog } from "./AddFriendToConversationDialog";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Textarea } from "./ui/textarea";

interface ChatProps {
  conversationId: string;
  currentUserId: string;
  apiUrl: string;
  wsUrl: string;
  onBack?: () => void;
  updateUnreadCount?: (conversationId: string, unreadCount: number) => void;
}

type TypingPayload = {
  conversationId: string;
  userId: string;
};

type TypingStartedEvent = WsEnvelope<"typing.started", TypingPayload>;
type TypingStoppedEvent = WsEnvelope<"typing.stopped", TypingPayload>;

export function Chat({
  conversationId,
  currentUserId,
  apiUrl,
  wsUrl,
  onBack,
  updateUnreadCount,
}: ChatProps) {
  const [input, setInput] = useState("");
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [conversationTitle, setConversationTitle] = useState<string | null>(
    null,
  );
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [memberAvatars, setMemberAvatars] = useState<
    Map<string, { displayName: string; avatarUrl: string | null }>
  >(new Map());
  const [members, setMembers] = useState<
    Array<{
      id: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
    }>
  >([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<Map<string, number>>(new Map());

  const app = useApi(apiUrl);

  // WebSocketはここで1回だけ
  const ws = useWebSocket(wsUrl, { enabled: true });
  const { isConnected, send, on } = ws;

  // useConversationMessagesはwsを受け取るだけ（中でuseWebSocketしない）
  const { messages, isLoading, isSending, sendMessage } =
    useConversationMessages({
      conversationId,
      currentUserId,
      apiUrl,
      ws,
      updateUnreadCount,
    });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // 会話タイトルを取得
  useEffect(() => {
    const loadTitle = async () => {
      try {
        const response = await app.conversations({ conversationId }).get();
        if (response.data && "conversationId" in response.data) {
          setConversationTitle(
            response.data.title || `会話 ${conversationId.slice(0, 8)}`,
          );
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
        const response = await app
          .conversations({ conversationId })
          .members.get();
        if (response.data && "members" in response.data) {
          const m = response.data.members as Array<{
            id: string;
            username: string;
            displayName: string;
            avatarUrl: string | null;
          }>;
          const avatarMap = new Map<
            string,
            { displayName: string; avatarUrl: string | null }
          >();
          m.forEach((member) => {
            avatarMap.set(member.id, {
              displayName: member.displayName,
              avatarUrl: member.avatarUrl,
            });
          });
          setMemberAvatars(avatarMap);
          setMembers(m);
        }
      } catch (error) {
        console.error("Failed to load members:", error);
      }
    };
    loadMembers();
  }, [conversationId, app]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending) return;
    const messageText = input.trim();
    setInput("");
    await sendMessage(messageText);
  }, [input, isSending, sendMessage]);

  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: string | Date) => {
    try {
      const d = typeof date === "string" ? new Date(date) : date;
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const typingStateRef = useRef<"idle" | "started">("idle");
  const startTimerRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  // タイピング開始/停止（send依存にする。wsオブジェクト丸ごと依存しない）
  useEffect(() => {
    if (!isConnected) return;

    const trimmed = input.trim();

    if (startTimerRef.current) window.clearTimeout(startTimerRef.current);
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    startTimerRef.current = null;
    stopTimerRef.current = null;

    if (trimmed === "") {
      if (typingStateRef.current === "started") {
        send({ type: "typing.stop", payload: { conversationId } });
        typingStateRef.current = "idle";
      }
      return;
    }

    if (typingStateRef.current === "idle") {
      startTimerRef.current = window.setTimeout(() => {
        send({ type: "typing.start", payload: { conversationId } });
        typingStateRef.current = "started";
      }, 500);
    }

    stopTimerRef.current = window.setTimeout(() => {
      if (typingStateRef.current === "started") {
        send({ type: "typing.stop", payload: { conversationId } });
        typingStateRef.current = "idle";
      }
    }, 3000);

    return () => {
      if (startTimerRef.current) window.clearTimeout(startTimerRef.current);
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    };
  }, [input, conversationId, isConnected, send]);

  // タイピングイベント受信
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribeTypingStarted = on<TypingStartedEvent>(
      "typing.started",
      (event) => {
        if (
          event.payload.conversationId === conversationId &&
          event.payload.userId !== currentUserId
        ) {
          setTypingUsers((prev) => new Set(prev).add(event.payload.userId));

          const timeoutId = window.setTimeout(() => {
            setTypingUsers((prev) => {
              const next = new Set(prev);
              next.delete(event.payload.userId);
              return next;
            });
          }, 3000);

          const existingTimeout = typingTimeoutRef.current.get(
            event.payload.userId,
          );
          if (existingTimeout) clearTimeout(existingTimeout);
          typingTimeoutRef.current.set(event.payload.userId, timeoutId);
        }
      },
    );

    const unsubscribeTypingStopped = on<TypingStoppedEvent>(
      "typing.stopped",
      (event) => {
        if (
          event.payload.conversationId === conversationId &&
          event.payload.userId !== currentUserId
        ) {
          setTypingUsers((prev) => {
            const next = new Set(prev);
            next.delete(event.payload.userId);
            return next;
          });
          const timeoutId = typingTimeoutRef.current.get(event.payload.userId);
          if (timeoutId) clearTimeout(timeoutId);
        }
      },
    );

    return () => {
      unsubscribeTypingStarted();
      unsubscribeTypingStopped();
    };
  }, [isConnected, conversationId, currentUserId, on]);

  const handleLeaveConversation = async () => {
    if (!confirm("この会話から脱会しますか？")) return;

    try {
      setIsLeaving(true);
      const response = await fetch(
        `${apiUrl}/conversations/${conversationId}/members`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) onBack?.();
        else alert("脱会に失敗しました");
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
      const response = await fetch(
        `${apiUrl}/conversations/${conversationId}/title`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ title: titleInput || null }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setConversationTitle(
            titleInput || `会話 ${conversationId.slice(0, 8)}`,
          );
          setIsEditingTitle(false);
        }
      }
    } catch (error) {
      console.error("Failed to update title:", error);
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-card">
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
                      <AvatarImage
                        src={member.avatarUrl}
                        alt={member.displayName}
                      />
                    ) : (
                      <AvatarFallback className="text-xs">
                        {getInitials(member.displayName)}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <span className="text-xs font-medium">
                    {isOwn ? "あなた" : member.displayName}
                  </span>
                </div>
              );
            })}
          </div>

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
                      if (e.key === "Enter") handleSaveTitle();
                      else if (e.key === "Escape") {
                        setIsEditingTitle(false);
                        setTitleInput(conversationTitle || "");
                      }
                    }}
                    className="text-lg font-semibold bg-transparent border-b border-primary focus:outline-none"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="text-lg font-semibold cursor-pointer hover:text-primary flex items-center gap-2"
                  onClick={() => {
                    setTitleInput(conversationTitle || "");
                    setIsEditingTitle(true);
                  }}
                >
                  <span>
                    {conversationTitle || `会話 ${conversationId.slice(0, 8)}`}
                  </span>
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "text-xs px-2 py-1 rounded-full border shrink-0",
                  isConnected
                    ? "text-muted-foreground border-border bg-muted/30"
                    : "text-amber-700 border-amber-200 bg-amber-50",
                )}
                title={isConnected ? "接続済み" : "接続中"}
              >
                {isConnected ? "オンライン" : "接続中…"}
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
                    isOwn ? "justify-end" : "justify-start",
                  )}
                >
                  {!isOwn && (
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <Avatar className="h-8 w-8">
                        {member?.avatarUrl ? (
                          <AvatarImage
                            src={member.avatarUrl}
                            alt={displayName}
                          />
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
                      isOwn ? "items-end" : "items-start",
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2 text-sm",
                        isOwn
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm",
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

      <div className="border-t border-border bg-card p-4 safe-area-inset-bottom">
        <div
          className={cn(
            "h-6 flex items-center gap-2 text-xs text-muted-foreground transition-opacity",
            typingUsers.size > 0
              ? "opacity-100"
              : "opacity-0 pointer-events-none",
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
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder="メッセージを入力..."
            className="min-h-[60px] max-h-[120px] resize-none text-base"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isSending || !isConnected}
            size="icon"
            className="h-[60px] w-[60px] shrink-0 rounded-full"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {showInviteDialog && (
        <AddFriendToConversationDialog
          conversationId={conversationId}
          apiUrl={apiUrl}
          onClose={() => setShowInviteDialog(false)}
          onInviteSuccess={() => {}}
        />
      )}
    </div>
  );
}
