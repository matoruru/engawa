import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type ConversationPreview = {
  conversationId: string;
  title: string | null;
  latestMessages: Array<{
    messageText: string;
    senderId: string;
    senderDisplayName: string;
    createdAt: string;
  }>;
  unreadCount: number;
};

interface ConversationsContextType {
  conversations: ConversationPreview[];
  setConversations: (conversations: ConversationPreview[]) => void;
  updateConversation: (conversationId: string, updates: Partial<ConversationPreview>) => void;
  updateUnreadCount: (conversationId: string, unreadCount: number) => void;
  totalUnreadCount: number;
  hasUnreadMessages: boolean;
}

const ConversationsContext = createContext<ConversationsContextType | undefined>(undefined);

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);

  const updateConversation = useCallback((conversationId: string, updates: Partial<ConversationPreview>) => {
    setConversations((prev) =>
      prev.map((c) => (c.conversationId === conversationId ? { ...c, ...updates } : c))
    );
  }, []);

  const updateUnreadCount = useCallback((conversationId: string, unreadCount: number) => {
    setConversations((prev) =>
      prev.map((c) => (c.conversationId === conversationId ? { ...c, unreadCount } : c))
    );
  }, []);

  const totalUnreadCount = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const hasUnreadMessages = totalUnreadCount > 0;

  return (
    <ConversationsContext.Provider
      value={{
        conversations,
        setConversations,
        updateConversation,
        updateUnreadCount,
        totalUnreadCount,
        hasUnreadMessages,
      }}
    >
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversations() {
  const context = useContext(ConversationsContext);
  if (context === undefined) {
    throw new Error("useConversations must be used within a ConversationsProvider");
  }
  return context;
}

