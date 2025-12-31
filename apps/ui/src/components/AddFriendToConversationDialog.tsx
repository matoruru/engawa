import { useState, useEffect, useMemo } from "react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { X, UserPlus } from "lucide-react";
import { treaty } from "@elysiajs/eden";
import type { App as AppContract } from "@idobata/contracts";

interface Friend {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface AddFriendToConversationDialogProps {
  conversationId: string;
  apiUrl: string;
  onClose: () => void;
  onInviteSuccess: () => void;
}

export function AddFriendToConversationDialog({
  conversationId,
  apiUrl,
  onClose,
  onInviteSuccess,
}: AddFriendToConversationDialogProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [members, setMembers] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviting, setIsInviting] = useState<string | null>(null);

  const app = useMemo(
    () =>
      treaty<AppContract>(apiUrl, {
        fetch: {
          credentials: "include",
        },
      }),
    [apiUrl]
  );

  // 友達一覧を取得
  useEffect(() => {
    const loadFriends = async () => {
      try {
        setIsLoading(true);
        const friendsResponse = await app.friends.get();
        if (friendsResponse.data && "friends" in friendsResponse.data) {
          const friendsData = friendsResponse.data.friends as Array<{
            id: string;
            username: string;
            displayName: string;
            avatarUrl: string | null;
          }>;
          setFriends(friendsData);
        }

        // 会話のメンバーを取得
        try {
          const membersResponse = await fetch(
            `${apiUrl}/conversations/${conversationId}/members`,
            {
              method: "GET",
              credentials: "include",
            }
          );
          if (membersResponse.ok) {
            const membersData = await membersResponse.json();
            if (membersData.members) {
              setMembers(membersData.members);
            }
          }
        } catch (error) {
          console.error("Failed to load members:", error);
        }
      } catch (error) {
        console.error("Failed to load friends or members:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadFriends();
  }, [conversationId, app]);

  // 既にメンバーの友達を除外
  const availableFriends = friends.filter(
    (friend) => !members.some((member) => member.id === friend.id)
  );

  const handleInvite = async (friendId: string) => {
    try {
      setIsInviting(friendId);
      const response = await fetch(
        `${apiUrl}/conversations/${conversationId}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ userId: friendId }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // メンバーリストを更新
          const friend = friends.find((f) => f.id === friendId);
          if (friend) {
            setMembers((prev) => [...prev, friend]);
          }
          onInviteSuccess();
        }
      }
    } catch (error) {
      console.error("Failed to invite friend:", error);
    } finally {
      setIsInviting(null);
    }
  };

  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md max-h-[80vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">友達を追加</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* コンテンツ */}
        <ScrollArea className="flex-1 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">読み込み中...</p>
            </div>
          ) : availableFriends.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserPlus className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                追加できる友達がいません
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                すべての友達が既にこの会話に参加しています
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {availableFriends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      {friend.avatarUrl ? (
                        <AvatarImage src={friend.avatarUrl} alt={friend.displayName} />
                      ) : (
                        <AvatarFallback>
                          {getInitials(friend.displayName)}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{friend.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        @{friend.username}
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleInvite(friend.id)}
                    disabled={isInviting === friend.id}
                    size="sm"
                    variant="outline"
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    {isInviting === friend.id ? "追加中..." : "追加"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

