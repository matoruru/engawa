import { useEffect, useMemo } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from "react-router";
import { Chat } from "./components/Chat";
import { Login } from "./components/Login";
import { ConversationList } from "./components/ConversationList";
import { Profile } from "./components/Profile";
import { AcceptInvite } from "./components/AcceptInvite";
import { BottomTabBar } from "./components/BottomTabBar";
import { useAuth } from "./hooks/useAuth";
import { ConversationsProvider, useConversations } from "./contexts/ConversationsContext";
import { treaty } from "@elysiajs/eden";
import type { App as AppContract } from "@kaiwa/contracts";

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

function AppContent() {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
  const { user, appUserId, isLoading, refreshSession, signOut } = useAuth(apiUrl);
  const { setConversations, updateUnreadCount } = useConversations();
  const navigate = useNavigate();

  const app = useMemo(
    () =>
      treaty<AppContract>(apiUrl, {
        fetch: {
          credentials: "include",
        },
      }),
    [apiUrl]
  );

  // Googleログイン後のリダイレクト処理
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const state = urlParams.get("state");
    if (code || state) {
      refreshSession();
    }
  }, [refreshSession]);

  // 会話一覧を取得
  useEffect(() => {
    const loadConversations = async () => {
      if (!user) return;

      try {
        const response = await app.conversations.get();

        if (response.data && "conversations" in response.data) {
          const conversationList: ConversationPreview[] = Array.from(response.data.conversations).map((c) => ({
            conversationId: String(c.conversationId),
            title: c.title === null ? null : String(c.title),
            latestMessages: Array.from(c.latestMessages || []).map((m) => ({
              messageText: String(m.messageText),
              senderId: String(m.senderId),
              senderDisplayName: String(m.senderDisplayName),
              createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
            })),
            unreadCount: typeof c.unreadCount === "number" ? c.unreadCount : 0,
          }));
          setConversations(conversationList);
        }
      } catch (error) {
        console.error("Failed to load conversations:", error);
      }
    };

    if (user) {
      loadConversations();
    }
  }, [user, app, setConversations]);

  const handleCreateConversation = async () => {
    if (!user) return;

    try {
      const response = await app.conversations.post();

      if (response.data && "conversationId" in response.data) {
        const newConversationId = response.data.conversationId as string;
        navigate(`/conversations/${newConversationId}`);
      }
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  if (!user) {
    return <Login apiUrl={apiUrl} onLoginSuccess={() => {}} />;
  }

  return (
    <>
      <Routes>
        <Route
          path="/invites/:token"
          element={<AcceptInvite apiUrl={apiUrl} />}
        />
        <Route
          path="/"
          element={
            <>
              <ConversationList
                currentUserId={appUserId || ""}
                onCreateConversation={handleCreateConversation}
              />
              <BottomTabBar />
            </>
          }
        />
        <Route
          path="/conversations/:conversationId"
          element={
            <ConversationChat
              apiUrl={apiUrl}
              currentUserId={appUserId || ""}
              onBack={() => navigate("/")}
              updateUnreadCount={updateUnreadCount}
            />
          }
        />
        <Route
          path="/profile"
          element={
            <>
              <Profile
                user={user}
                onBack={() => navigate("/")}
                onSignOut={handleSignOut}
                apiUrl={apiUrl}
              />
              <BottomTabBar />
            </>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function ConversationChat({
  apiUrl,
  currentUserId,
  onBack,
  updateUnreadCount,
}: {
  apiUrl: string;
  currentUserId: string;
  onBack: () => void;
  updateUnreadCount: (conversationId: string, unreadCount: number) => void;
}) {
  const { conversationId } = useParams<{ conversationId: string }>();
  
  if (!conversationId) {
    return null;
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Chat
        conversationId={conversationId}
        currentUserId={currentUserId}
        apiUrl={apiUrl}
        wsUrl={import.meta.env.VITE_WS_URL}
        onBack={onBack}
        updateUnreadCount={updateUnreadCount}
      />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ConversationsProvider>
        <AppContent />
      </ConversationsProvider>
    </BrowserRouter>
  );
}

export default App;
