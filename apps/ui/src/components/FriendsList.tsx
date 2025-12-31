import { treaty } from "@elysiajs/eden";
import type { App as AppContract } from "@idobata/contracts";
import { Check, Copy, Link2, UserMinus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "../hooks/useLocation";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";

interface Friend {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface FriendsListProps {
  apiUrl: string;
}

export function FriendsList({ apiUrl }: FriendsListProps) {
  const location = useLocation();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [friendToRemove, setFriendToRemove] = useState<Friend | null>(null);

  const app = useMemo(
    () =>
      treaty<AppContract>(apiUrl, {
        fetch: { credentials: "include" },
      }),
    [apiUrl],
  );

  useEffect(() => {
    const loadFriends = async () => {
      try {
        setIsLoading(true);
        const response = await app.friends.get();
        if (response.data && "friends" in response.data) {
          setFriends(response.data.friends as Friend[]);
        }
      } catch (e) {
        console.error("Failed to load friends:", e);
      } finally {
        setIsLoading(false);
      }
    };
  
    loadFriends();
  }, [app]);

  const handleCreateInvite = async () => {
    try {
      setIsCreatingInvite(true);
      const response = await app.invites.post();
      if (
        response.data &&
        "token" in response.data &&
        "inviteUrl" in response.data
      ) {
        const baseUrl = location.getOrigin();
        const fullUrl = `${baseUrl}${response.data.inviteUrl}`;
        setInviteUrl(fullUrl);
      }
    } catch (error) {
      console.error("Failed to create invite:", error);
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleCopyInviteUrl = async () => {
    if (inviteUrl) {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRemoveFriend = async (friend: Friend) => {
    setFriendToRemove(friend);
  };

  const confirmRemoveFriend = async () => {
    if (!friendToRemove) return;

    try {
      setIsAdding(friendToRemove.id);
      const response = await fetch(`${apiUrl}/friends/${friendToRemove.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          await app.friends.get();
        }
      }
    } catch (error) {
      console.error("Failed to remove friend:", error);
    } finally {
      setIsAdding(null);
      setFriendToRemove(null);
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
    <div className="flex h-full flex-col">
      {/* 招待リンク生成 */}
      <div className="border-b border-border bg-card p-4 space-y-3">
        <Button
          onClick={handleCreateInvite}
          disabled={isCreatingInvite}
          className="w-full"
          variant="outline"
        >
          <Link2 className="mr-2 h-4 w-4" />
          {isCreatingInvite ? "生成中..." : "招待リンクを生成"}
        </Button>
        {inviteUrl && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground text-center">
              このリンクを招待したい友達に共有してください
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-3">
              <Input value={inviteUrl} readOnly className="flex-1 text-sm" />
              <Button onClick={handleCopyInviteUrl} size="icon" variant="ghost">
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* コンテンツ */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* 友達一覧 */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-muted-foreground">
                友達一覧
              </h3>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">読み込み中...</p>
              </div>
            ) : friends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-2">
                  友達がいません
                </p>
                <p className="text-xs text-muted-foreground">
                  招待リンクから友達を追加しましょう
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {friends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        {friend.avatarUrl ? (
                          <AvatarImage
                            src={friend.avatarUrl}
                            alt={friend.displayName}
                          />
                        ) : (
                          <AvatarFallback>
                            {getInitials(friend.displayName)}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {friend.displayName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          @{friend.username}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleRemoveFriend(friend)}
                      disabled={isAdding === friend.id}
                      size="sm"
                      variant="ghost"
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* 友達削除確認ダイアログ */}
      {friendToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">友達を削除</h2>
            <p className="text-sm text-muted-foreground">
              本当に
              <span className="font-medium text-foreground">
                {friendToRemove.displayName}
              </span>
              さんと友達をやめますか？
            </p>
            <div className="flex gap-3 justify-end">
              <Button onClick={() => setFriendToRemove(null)} variant="outline">
                キャンセル
              </Button>
              <Button
                onClick={confirmRemoveFriend}
                disabled={isAdding === friendToRemove.id}
                variant="destructive"
                className="bg-red-500 hover:bg-red-600"
              >
                {isAdding === friendToRemove.id ? "削除中..." : "削除"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
