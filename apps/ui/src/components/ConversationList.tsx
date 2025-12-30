import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Plus, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConversationPreview {
  conversationId: string;
  latestMessages: Array<{
    messageText: string;
    senderId: string;
    createdAt: string;
  }>;
}

interface ConversationListProps {
  conversations: ConversationPreview[];
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onCreateConversation: () => void;
  isCreatingConversation: boolean;
  currentUserId: string;
}

export function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
  onCreateConversation,
  isCreatingConversation,
  currentUserId,
}: ConversationListProps) {
  return (
    <div className="flex h-screen flex-col bg-background">
      {/* ヘッダー */}
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">会話</h1>
          <Button
            onClick={onCreateConversation}
            disabled={isCreatingConversation}
            size="icon"
            variant="ghost"
          >
            <Plus className="h-5 w-5" />
          </Button>
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
                onClick={onCreateConversation}
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
                  onClick={() => onSelectConversation(conversation.conversationId)}
                  className={cn(
                    "w-full rounded-lg px-4 py-3 text-left transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    selectedConversationId === conversation.conversationId
                      ? "bg-accent text-accent-foreground"
                      : ""
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        会話 {conversation.conversationId.slice(0, 8)}
                      </p>
                      {conversation.latestMessages.length > 0 ? (
                        <div className="space-y-0.5 mt-1">
                          {conversation.latestMessages.slice(-2).map((message, idx) => (
                            <p key={idx} className="text-xs text-muted-foreground truncate">
                              {message.senderId === currentUserId ? "あなた" : "相手"}: {message.messageText}
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
    </div>
  );
}

