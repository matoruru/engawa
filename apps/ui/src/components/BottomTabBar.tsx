import { MessageSquare, User } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { useConversations } from "../contexts/ConversationsContext";

export function BottomTabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasUnreadMessages } = useConversations();

  const isConversationsActive =
    location.pathname === "/" ||
    location.pathname.startsWith("/conversations/");
  const isProfileActive = location.pathname === "/profile";

  return (
    <div className="border-t border-border bg-card safe-area-inset-bottom">
      <div className="flex">
        <button
          type="button"
          onClick={() => navigate("/")}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 py-3 px-4 transition-colors relative",
            isConversationsActive
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          <MessageSquare className="h-5 w-5" />
          <span className="text-xs font-medium">会話</span>
          {hasUnreadMessages && (
            <span className="absolute top-2 right-1/2 translate-x-4 h-2 w-2 rounded-full bg-red-500" />
          )}
        </button>
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 py-3 px-4 transition-colors",
            isProfileActive
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          <User className="h-5 w-5" />
          <span className="text-xs font-medium">プロフィール</span>
        </button>
      </div>
    </div>
  );
}
