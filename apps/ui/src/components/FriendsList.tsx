import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Search, UserPlus, UserMinus, Users, Link2, Copy, Check } from "lucide-react";
import { treaty } from "@elysiajs/eden";
import type { App as AppContract } from "@kaiwa/contracts";
import { cn } from "@/lib/utils";

interface Friend {
  id: string;
  username: string;
  displayName: string;
}

interface FriendsListProps {
  apiUrl: string;
  currentUserId: string;
}

export function FriendsList({ apiUrl, currentUserId }: FriendsListProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [copied, setCopied] = useState(false);

  const app = treaty<AppContract>(apiUrl, {
    fetch: {
      credentials: "include",
    },
  });

  const loadFriends = async () => {
    try {
      setIsLoading(true);
      const response = await app.friends.get();
      if (response.data && "friends" in response.data) {
        const friendsData = response.data.friends as Array<{
          id: string;
          username: string;
          displayName: string;
        }>;
        setFriends(friendsData);
      }
    } catch (error) {
      console.error("Failed to load friends:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFriends();
  }, []);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query || query.trim().length === 0) {
      setSearchResults([]);
      return;
    }

    try {
      setIsSearching(true);
      const response = await app.users.search.get({
        query: { q: query },
      });
      if (response.data && "users" in response.data) {
        const users = response.data.users as Array<{
          id: string;
          username: string;
          displayName: string;
        }>;
        // 既に友達のユーザーを除外
        const friendIds = new Set(friends.map((f) => f.id));
        const filtered = users.filter(
          (u) => u.id !== currentUserId && !friendIds.has(u.id)
        );
        setSearchResults(filtered);
      }
    } catch (error) {
      console.error("Failed to search users:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCreateInvite = async () => {
    try {
      setIsCreatingInvite(true);
      const response = await app.invites.post();
      if (response.data && "token" in response.data && "inviteUrl" in response.data) {
        const baseUrl = window.location.origin;
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

  const handleRemoveFriend = async (friendId: string) => {
    try {
      setIsAdding(friendId);
      const response = await app.friends[":friendId"].delete({
        params: { friendId },
      });
      if (response.data && "success" in response.data && response.data.success) {
        await loadFriends();
      }
    } catch (error) {
      console.error("Failed to remove friend:", error);
    } finally {
      setIsAdding(null);
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
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-3">
            <Input
              value={inviteUrl}
              readOnly
              className="flex-1 text-sm"
            />
            <Button
              onClick={handleCopyInviteUrl}
              size="icon"
              variant="ghost"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </div>

      {/* 検索バー */}
      <div className="border-b border-border bg-card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="ユーザーを検索..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
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
                  検索して友達を追加しましょう
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
                        <AvatarFallback>
                          {getInitials(friend.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{friend.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          @{friend.username}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleRemoveFriend(friend.id)}
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
    </div>
  );
}

