import { useState, useEffect, useMemo } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { X, UserPlus, Search } from "lucide-react";
import { treaty } from "@elysiajs/eden";
import type { App as AppContract } from "@idobata/contracts";

interface User {
  id: string;
  username: string;
  displayName: string;
}

interface InviteUserDialogProps {
  conversationId: string;
  apiUrl: string;
  currentUserId: string;
  onClose: () => void;
  onInviteSuccess: () => void;
}

export function InviteUserDialog({
  conversationId,
  apiUrl,
  currentUserId,
  onClose,
  onInviteSuccess,
}: InviteUserDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isInviting, setIsInviting] = useState<string | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);

  const app = useMemo(
    () =>
      treaty<AppContract>(apiUrl, {
        fetch: {
          credentials: "include",
        },
      }),
    [apiUrl]
  );

  // ユーザー検索関数（型安全な実装）
  const searchUsersApi = async (query: string): Promise<{ users: User[] }> => {
    const url = new URL(`${apiUrl}/users/search`);
    url.searchParams.set("q", query);
    const response = await fetch(url.toString(), {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to search users");
    }

    return (await response.json()) as { users: User[] };
  };

  // メンバー一覧を取得
  useEffect(() => {
    const loadMembers = async () => {
      try {
        setIsLoadingMembers(true);
        const response = await app.conversations({ conversationId }).members.get();

        if (response.data && "members" in response.data) {
          const membersData = response.data.members;
          if (Array.isArray(membersData)) {
            setMembers(membersData);
          }
        }
      } catch (error) {
        console.error("Failed to load members:", error);
      } finally {
        setIsLoadingMembers(false);
      }
    };

    loadMembers();
  }, [conversationId, app]);

  // ユーザー検索
  useEffect(() => {
    const searchUsers = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      try {
        setIsSearching(true);
        const data = await searchUsersApi(searchQuery);

        if (data && "users" in data) {
          const users = data.users;
          // 既にメンバーのユーザーを除外
          const memberIds = new Set(members.map((m) => m.id));
          setSearchResults(users.filter((u) => !memberIds.has(u.id)));
        }
      } catch (error) {
        console.error("Failed to search users:", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(searchUsers, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, members, apiUrl]);

  const handleInvite = async (userId: string) => {
    try {
      setIsInviting(userId);
      const response = await app.conversations({ conversationId }).members.post({
        userId,
      });

      if (response.data && "success" in response.data) {
        if (response.data.success) {
          // メンバー一覧を再取得
          const membersResponse = await app.conversations({ conversationId }).members.get();
          if (membersResponse.data && "members" in membersResponse.data) {
            const membersData = membersResponse.data.members;
            if (Array.isArray(membersData)) {
              setMembers(membersData);
            }
          }
          setSearchQuery("");
          setSearchResults([]);
          onInviteSuccess();
        } else {
          if (response.data && typeof response.data === "object" && "error" in response.data) {
            const error = response.data.error;
            console.error("Failed to invite user:", error);
          } else {
            console.error("Failed to invite user: Unknown error");
          }
        }
      } else {
        console.error("Failed to invite user: Invalid response");
      }
    } catch (error) {
      console.error("Failed to invite user:", error);
    } finally {
      setIsInviting(null);
    }
  };

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-card shadow-lg">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold">メンバーを招待</h2>
          <Button onClick={onClose} variant="ghost" size="icon">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 検索バー */}
        <div className="border-b border-border p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="ユーザー名または表示名で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* メンバー一覧 */}
        <div className="border-b border-border p-4">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            メンバー ({members.length})
          </h3>
          {isLoadingMembers ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-lg p-2"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {getInitials(member.displayName || member.username)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {member.displayName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      @{member.username}
                    </p>
                  </div>
                  {member.id === currentUserId && (
                    <span className="text-xs text-muted-foreground">あなた</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 検索結果 */}
        <ScrollArea className="max-h-[300px]">
          <div className="p-4">
            {searchQuery.trim() && (
              <>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  検索結果
                </h3>
                {isSearching ? (
                  <p className="text-sm text-muted-foreground">検索中...</p>
                ) : searchResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    ユーザーが見つかりません
                  </p>
                ) : (
                  <div className="space-y-2">
                    {searchResults.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-accent"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="text-xs">
                              {getInitials(user.displayName || user.username)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {user.displayName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              @{user.username}
                            </p>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleInvite(user.id)}
                          disabled={isInviting === user.id}
                          size="sm"
                          variant="outline"
                        >
                          {isInviting === user.id ? (
                            "招待中..."
                          ) : (
                            <>
                              <UserPlus className="mr-1 h-3 w-3" />
                              招待
                            </>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

