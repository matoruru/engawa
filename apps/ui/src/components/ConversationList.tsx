import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Plus, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConversations } from "../contexts/ConversationsContext";

interface ConversationListProps {
  currentUserId: string;
  onCreateConversation: () => void;
}

export function ConversationList({
  currentUserId,
  onCreateConversation,
}: ConversationListProps) {
  const navigate = useNavigate();
  const { conversations } = useConversations();
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);

  const handleCreateConversation = async () => {
    setIsCreatingConversation(true);
    try {
      await onCreateConversation();
    } finally {
      setIsCreatingConversation(false);
    }
  };

  return (
    <div className="relative flex h-screen flex-col bg-background">
      {/* ヘッダー */}
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center">
          <h1 className="text-lg font-semibold">会話</h1>
        </div>
      </div>

      {/* 会話一覧 */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">会話がありません</p>
              <Button
                onClick={handleCreateConversation}
                disabled={isCreatingConversation}
                size="sm"
              >
                {isCreatingConversation ? "作成中..." : "新しい会話を作成"}
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map((conversation) => (
                <button
                  key={conversation.conversationId}
                  onClick={() => navigate(`/conversations/${conversation.conversationId}`)}
                  className={cn(
                    "w-full rounded-lg px-4 py-3 text-left transition-colors",
                    "hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <MessageSquare className="h-5 w-5 text-primary" />
                      {conversation.unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 border-2 border-background" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {conversation.title || `会話 ${conversation.conversationId.slice(0, 8)}`}
                        </p>
                        {conversation.unreadCount > 0 && (
                          <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                            {conversation.unreadCount}
                          </span>
                        )}
                      </div>
                      {conversation.latestMessages.length > 0 ? (
                        <div className="space-y-0.5 mt-1">
                          {conversation.latestMessages.slice(-2).map((message, idx) => (
                            <p key={idx} className="text-xs text-muted-foreground truncate">
                              {message.senderId === currentUserId ? "あなた" : message.senderDisplayName}: {message.messageText}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground truncate">
                          メッセージがありません
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* フローティングアクションボタン */}
      <div className="absolute bottom-24 right-4 safe-area-inset-bottom">
        <Button
          onClick={handleCreateConversation}
          disabled={isCreatingConversation}
          size="icon"
          className="h-14 w-14 rounded-full shadow-lg bg-blue-500 hover:bg-blue-600 text-white"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}

