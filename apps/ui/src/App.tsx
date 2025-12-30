import { useState } from "react";
import { Chat } from "./components/Chat";

// 開発用: 実際のアプリでは認証から取得
const DEFAULT_CONVERSATION_ID = "00000000-0000-0000-0000-000000000000";
const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

function App() {
  const [conversationId] = useState(DEFAULT_CONVERSATION_ID);
  const [currentUserId] = useState(DEFAULT_USER_ID);

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Chat
        conversationId={conversationId}
        currentUserId={currentUserId}
        apiUrl={import.meta.env.VITE_API_URL || "http://localhost:3000"}
        wsUrl={import.meta.env.VITE_WS_URL}
      />
    </div>
  );
}

export default App;
