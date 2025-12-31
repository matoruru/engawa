import { useState, useEffect, useMemo } from "react";
import { Chat } from "./components/Chat";
import { Login } from "./components/Login";
import { ConversationList } from "./components/ConversationList";
import { Profile } from "./components/Profile";
import { AcceptInvite } from "./components/AcceptInvite";
import { Button } from "./components/ui/button";
import { useAuth } from "./hooks/useAuth";
import { useLocation } from "./hooks/useLocation";
import { treaty } from "@elysiajs/eden";
import type { App as AppContract } from "@kaiwa/contracts";

function App() {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
  const { user, appUserId, isLoading, refreshSession, signOut } = useAuth(apiUrl);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Array<{ conversationId: string; title: string | null; latestMessages: Array<{ messageText: string; senderId: string; createdAt: string }>; unreadCount: number }>>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const location = useLocation();

  // URLから会話IDを取得
  const conversationIdFromUrl = useMemo(() => {
    const match = location.pathname.match(/^\/conversations\/(.+)$/);
    return match ? match[1] : null;
  }, [location.pathname]);

  // URLから画面状態を決定
  const showConversationList = useMemo(() => {
    return location.pathname === "/" || location.pathname === "";
  }, [location.pathname]);

  const showProfile = useMemo(() => {
    return location.pathname === "/profile";
  }, [location.pathname]);

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
    const code = location.getSearchParam("code");
    const state = location.getSearchParam("state");
    if (code || state) {
      // OAuthコールバック後のセッション確認
      refreshSession();
    }
  }, [refreshSession, location]);

  // ユーザーがログインしたら認証済み状態にする
  useEffect(() => {
    if (user) {
      setIsAuthenticated(true);
    }
  }, [user]);

  // 会話一覧を取得
  useEffect(() => {
    const loadConversations = async () => {
      if (!user) return;

      try {
        setIsLoadingConversations(true);
        const response = await app.conversations.get();

        if (response.data && "conversations" in response.data) {
          const conversationList = Array.from(response.data.conversations).map((c: any) => ({
            conversationId: c.conversationId,
            title: c.title,
            latestMessages: Array.from(c.latestMessages || []).map((m: any) => ({
              messageText: m.messageText,
              senderId: m.senderId,
              senderDisplayName: m.senderDisplayName,
              createdAt: m.createdAt,
            })),
            unreadCount: c.unreadCount ?? 0,
          }));
          setConversations(conversationList);
          
          // URLから会話IDを取得して設定
          if (conversationIdFromUrl) {
            setConversationId(conversationIdFromUrl);
          } else if (conversationList.length > 0 && !conversationId) {
            setConversationId(conversationList[0].conversationId);
          }
        }
      } catch (error) {
        console.error("Failed to load conversations:", error);
      } finally {
        setIsLoadingConversations(false);
      }
    };

    if (isAuthenticated && user) {
      loadConversations();
    }
  }, [isAuthenticated, user, app, conversationIdFromUrl]);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleCreateConversation = async () => {
    if (!user) return;

    try {
      setIsCreatingConversation(true);
      const response = await app.conversations.post();

      if (response.data && "conversationId" in response.data) {
        const newConversationId = response.data.conversationId as string;
        setConversations((prev) => [
          { conversationId: newConversationId, title: null, latestMessages: [], unreadCount: 0 },
          ...prev,
        ]);
        setConversationId(newConversationId);
        // URLを更新
        location.navigate(`/conversations/${newConversationId}`);
      }
    } catch (error) {
      console.error("Failed to create conversation:", error);
    } finally {
      setIsCreatingConversation(false);
    }
  };

  const handleSelectConversation = (id: string) => {
    setConversationId(id);
    // URLを更新
    location.navigate(`/conversations/${id}`);
  };

  const handleBackToList = () => {
    // URLを更新
    location.navigate("/");
  };

  const handleOpenProfile = () => {
    // URLを更新
    location.navigate("/profile");
  };

  const handleSignOut = async () => {
    await signOut();
    setIsAuthenticated(false);
    // URLを更新
    location.navigate("/");
  };

  // 招待リンクの処理
  const inviteToken = useMemo(() => {
    const match = location.pathname.match(/^\/invites\/(.+)$/);
    return match ? match[1] : null;
  }, [location.pathname]);

  if (inviteToken) {
    return <AcceptInvite token={inviteToken} apiUrl={apiUrl} />;
  }

  if (isLoading || isLoadingConversations) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Login apiUrl={apiUrl} onLoginSuccess={handleLoginSuccess} />;
  }

  // プロフィール画面を表示
  if (showProfile) {
    return (
      <Profile
        user={user}
        onBack={handleBackToList}
        onSignOut={handleSignOut}
        apiUrl={apiUrl}
      />
    );
  }

  // 会話一覧を表示
  if (showConversationList) {
    return (
      <ConversationList
        conversations={conversations}
        selectedConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onCreateConversation={handleCreateConversation}
        isCreatingConversation={isCreatingConversation}
        currentUserId={appUserId || ""}
        onOpenProfile={handleOpenProfile}
      />
    );
  }

  // チャット画面を表示
  if (conversationIdFromUrl || conversationId) {
    const activeConversationId = conversationIdFromUrl || conversationId;
    return (
      <div className="h-screen w-screen overflow-hidden">
        <Chat
          conversationId={activeConversationId!}
          currentUserId={appUserId || ""}
          apiUrl={apiUrl}
          wsUrl={import.meta.env.VITE_WS_URL}
          onBack={handleBackToList}
        />
      </div>
    );
  }

  // 会話がない場合
  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-muted-foreground">会話が見つかりません</p>
        <Button
          onClick={handleCreateConversation}
          disabled={isCreatingConversation}
        >
          {isCreatingConversation ? "作成中..." : "新しい会話を作成"}
        </Button>
      </div>
    </div>
  );
}

export default App;
