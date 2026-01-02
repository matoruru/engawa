import { treaty } from "@elysiajs/eden";
import type { App as AppContract } from "@engawa/contracts";
import { useEffect, useMemo, useRef } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import { AcceptInvite } from "./components/AcceptInvite";
import { Chat } from "./components/Chat";
import { ConversationList } from "./components/ConversationList";
import { Login } from "./components/Login";
import { Profile } from "./components/Profile";
import { TabLayout } from "./components/TabLayout";
import { constants } from "./constants";
import {
  ConversationsProvider,
  useConversations,
} from "./contexts/ConversationsContext";
import { useApi } from "./hooks/useApi";
import { useAuth } from "./hooks/useAuth";
import { useBadge } from "./hooks/useBadge";
import { useNotifications } from "./hooks/useNotifications";
import { useWebSocket } from "./hooks/useWebSocket";

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
  const apiUrl = constants.API_URL;
  const { user, appUserId, isLoading, refreshSession, signOut } =
    useAuth(apiUrl);
  const {
    conversations,
    setConversations,
    updateUnreadCount,
    totalUnreadCount,
  } = useConversations();
  const navigate = useNavigate();
  const location = useLocation();
  const currentConversationIdRef = useRef<string | null>(null);
  const conversationsRef = useRef(conversations);
  const { showNotification, requestPermission } = useNotifications();
  const ws = useWebSocket(constants.WS_URL);

  // conversationsの最新値をrefに保持
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // バッジを更新
  useBadge(totalUnreadCount);

  // 現在表示中の会話IDを追跡
  useEffect(() => {
    const match = location.pathname.match(/^\/conversations\/([^/]+)$/);
    currentConversationIdRef.current = match ? match[1] : null;
  }, [location.pathname]);

  // 通知許可をリクエスト（初回ログイン時）
  useEffect(() => {
    if (user) {
      requestPermission();
    }
  }, [user, requestPermission]);

  // WebSocketでメッセージを受信した時に通知を送信し、未読数を更新
  useEffect(() => {
    if (!user || !ws.isConnected) return;

    const unsubscribe = ws.on("message.created", (event) => {
      const { conversationId, senderId, messageText } = event.payload;
      const currentConversationId = currentConversationIdRef.current;

      // 現在表示中の会話でない場合、未読数を増やす
      if (conversationId !== currentConversationId) {
        setConversations((prev) => {
          const conversation = prev.find(
            (c) => c.conversationId === conversationId,
          );
          if (conversation) {
            // 未読数を増やす
            const newUnreadCount = conversation.unreadCount + 1;
            // 最新メッセージを更新
            const updatedMessages = [
              ...conversation.latestMessages,
              {
                messageText,
                senderId,
                senderDisplayName: "誰か", // 後で更新される可能性がある
                createdAt: new Date().toISOString(),
              },
            ].slice(-2); // 最新2件のみ保持

            return prev.map((c) =>
              c.conversationId === conversationId
                ? {
                    ...c,
                    unreadCount: newUnreadCount,
                    latestMessages: updatedMessages,
                  }
                : c,
            );
          }
          return prev;
        });
      }

      // 現在表示中の会話でない場合、または自分が送信したメッセージでない場合のみ通知
      if (conversationId !== currentConversationId && senderId !== appUserId) {
        // 会話情報を取得（更新後の最新値）
        setTimeout(() => {
          const conversation = conversationsRef.current.find(
            (c) => c.conversationId === conversationId,
          );
          const title =
            conversation?.title || `会話 ${conversationId.slice(0, 8)}`;
          const senderName =
            conversation?.latestMessages.find((m) => m.senderId === senderId)
              ?.senderDisplayName || "誰か";

          showNotification(`${senderName}: ${messageText}`, {
            body: title,
            tag: conversationId,
            requireInteraction: false,
          });
        }, 0);
      }
    });

    return unsubscribe;
  }, [user, ws.isConnected, ws, appUserId, showNotification, setConversations]);

  const app = useApi(apiUrl);

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
          const conversationList: ConversationPreview[] = Array.from(
            response.data.conversations,
          ).map((c) => ({
            conversationId: String(c.conversationId),
            title: c.title === null ? null : String(c.title),
            latestMessages: Array.from(c.latestMessages || []).map((m) => ({
              messageText: String(m.messageText),
              senderId: String(m.senderId),
              senderDisplayName: String(m.senderDisplayName),
              createdAt:
                m.createdAt instanceof Date
                  ? m.createdAt.toISOString()
                  : String(m.createdAt),
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
    <Routes>
      <Route
        path="/invites/:token"
        element={<AcceptInvite apiUrl={apiUrl} />}
      />
      <Route
        path="/"
        element={
          <TabLayout>
            <ConversationList
              currentUserId={appUserId || ""}
              onCreateConversation={handleCreateConversation}
            />
          </TabLayout>
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
          <TabLayout>
            <Profile
              user={user}
              onBack={() => navigate("/")}
              onSignOut={handleSignOut}
              apiUrl={apiUrl}
            />
          </TabLayout>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
    <div className="h-dvh w-dvw overflow-hidden">
      <Chat
        conversationId={conversationId}
        currentUserId={currentUserId}
        apiUrl={apiUrl}
        wsUrl={constants.WS_URL}
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
