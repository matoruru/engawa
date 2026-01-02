import { treaty } from "@elysiajs/eden";
import type { App as AppContract } from "@engawa/contracts";
import { Check, LogOut, Pencil, User as UserIcon, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import { FriendsList } from "./FriendsList";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";

interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
}

interface ProfileProps {
  user: User;
  onBack: () => void;
  onSignOut: () => void;
  apiUrl: string;
}

export function Profile({ user, onSignOut, apiUrl }: ProfileProps) {
  const [activeTab, setActiveTab] = useState<"profile" | "friends">("profile");
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState(user.name || "");
  const [usernameInput, setUsernameInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  } | null>(null);

  const app = useApi(apiUrl);

  // 現在のユーザー情報を取得
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const response = await app.me.get();
        if (response.data && "user" in response.data) {
          const userData = response.data.user as {
            id: string;
            username: string;
            displayName: string;
            avatarUrl: string | null;
          };
          setCurrentUser(userData);
          setDisplayNameInput(userData.displayName);
          setUsernameInput(userData.username);
        }
      } catch (error) {
        console.error("Failed to load current user:", error);
      }
    };
    loadCurrentUser();
  }, [app]);

  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* ヘッダー */}
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center">
          <h1 className="text-lg font-semibold">プロフィール</h1>
        </div>
      </div>

      {/* タブ */}
      <div className="border-b border-border bg-card">
        <div className="flex">
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={cn(
              "flex-1 px-4 py-3 text-sm font-medium transition-colors",
              activeTab === "profile"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            プロフィール
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("friends")}
            className={cn(
              "flex-1 px-4 py-3 text-sm font-medium transition-colors",
              activeTab === "friends"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            友達
          </button>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "profile" ? (
          <div className="h-full overflow-y-auto p-4">
            <Card>
              <CardHeader>
                <CardTitle>アカウント情報</CardTitle>
                <CardDescription>あなたのプロフィール情報</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* アバター */}
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <Avatar className="h-24 w-24">
                      {currentUser?.avatarUrl ? (
                        <AvatarImage
                          src={currentUser.avatarUrl}
                          alt={currentUser.displayName}
                        />
                      ) : user.image ? (
                        <AvatarImage src={user.image} alt={user.name} />
                      ) : null}
                      <AvatarFallback className="text-2xl">
                        {getInitials(currentUser?.displayName || user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <label
                      htmlFor="avatar-upload"
                      className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-2 cursor-pointer hover:bg-primary/90 transition-colors"
                      title="アバターを変更"
                    >
                      <Pencil className="h-4 w-4" />
                    </label>
                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !currentUser) return;

                        // 画像をData URLに変換
                        const reader = new FileReader();
                        reader.onload = async (event) => {
                          const dataUrl = event.target?.result as string;
                          if (!dataUrl) return;

                          setIsSaving(true);
                          setError(null);
                          try {
                            const response = await app.me.patch({
                              avatarUrl: dataUrl,
                            });
                            if (
                              response.data &&
                              "success" in response.data &&
                              response.data.success
                            ) {
                              setCurrentUser({
                                ...currentUser,
                                avatarUrl: dataUrl,
                              });
                            } else if (
                              response.data &&
                              "error" in response.data
                            ) {
                              setError(response.data.error as string);
                            }
                          } catch (error) {
                            console.error("Failed to update avatar:", error);
                            setError("アバターの更新に失敗しました");
                          } finally {
                            setIsSaving(false);
                          }
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </div>
                  <div className="text-center">
                    <h2 className="text-xl font-semibold">
                      {currentUser?.displayName || user.name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </div>

                {/* ユーザー情報 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <UserIcon className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium mb-1">表示名</p>
                      {isEditingDisplayName ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={displayNameInput}
                            onChange={(e) =>
                              setDisplayNameInput(e.target.value)
                            }
                            className="flex-1"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              if (!currentUser) return;
                              setIsSaving(true);
                              setError(null);
                              try {
                                const response = await app.me.patch({
                                  displayName: displayNameInput,
                                });
                                if (
                                  response.data &&
                                  "success" in response.data &&
                                  response.data.success
                                ) {
                                  setCurrentUser({
                                    ...currentUser,
                                    displayName: displayNameInput,
                                  });
                                  setIsEditingDisplayName(false);
                                } else if (
                                  response.data &&
                                  "error" in response.data
                                ) {
                                  setError(response.data.error as string);
                                }
                              } catch (error) {
                                console.error(
                                  "Failed to update display name:",
                                  error,
                                );
                                setError("更新に失敗しました");
                              } finally {
                                setIsSaving(false);
                              }
                            }}
                            disabled={isSaving}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setIsEditingDisplayName(false);
                              setDisplayNameInput(
                                currentUser?.displayName || "",
                              );
                              setError(null);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-muted-foreground">
                            {currentUser?.displayName || user.name}
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setIsEditingDisplayName(true)}
                            className="h-6 w-6 p-0"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <UserIcon className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium mb-1">ユーザーID</p>
                      {isEditingUsername ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={usernameInput}
                            onChange={(e) => setUsernameInput(e.target.value)}
                            className="flex-1"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              if (!currentUser) return;
                              setIsSaving(true);
                              setError(null);
                              try {
                                const response = await app.me.patch({
                                  username: usernameInput,
                                });
                                if (
                                  response.data &&
                                  "success" in response.data &&
                                  response.data.success
                                ) {
                                  setCurrentUser({
                                    ...currentUser,
                                    username: usernameInput,
                                  });
                                  setIsEditingUsername(false);
                                } else if (
                                  response.data &&
                                  "error" in response.data
                                ) {
                                  const errorMsg = response.data
                                    .error as string;
                                  if (errorMsg === "USERNAME_ALREADY_EXISTS") {
                                    setError(
                                      "このユーザーIDは既に使用されています",
                                    );
                                  } else {
                                    setError(errorMsg);
                                  }
                                }
                              } catch (error) {
                                console.error(
                                  "Failed to update username:",
                                  error,
                                );
                                setError("更新に失敗しました");
                              } finally {
                                setIsSaving(false);
                              }
                            }}
                            disabled={isSaving}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setIsEditingUsername(false);
                              setUsernameInput(currentUser?.username || "");
                              setError(null);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-muted-foreground">
                            @{currentUser?.username || ""}
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setIsEditingUsername(true)}
                            className="h-6 w-6 p-0"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <UserIcon className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">メールアドレス</p>
                      <p className="text-sm text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  {error && (
                    <div className="text-sm text-red-500 bg-red-50 p-2 rounded">
                      {error}
                    </div>
                  )}
                </div>

                {/* バージョン情報 */}
                <div className="pt-4 border-t">
                  <div className="text-xs text-muted-foreground text-center">
                    バージョン {import.meta.env.VITE_APP_VERSION || "0.0.0"}
                  </div>
                </div>

                {/* ログアウトボタン */}
                <div className="pt-4 border-t">
                  <Button
                    onClick={() => setShowLogoutDialog(true)}
                    variant="outline"
                    className="w-full"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    ログアウト
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <FriendsList apiUrl={apiUrl} />
        )}
      </div>

      {/* ログアウト確認ダイアログ */}
      {showLogoutDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">ログアウト</h2>
            <p className="text-sm text-muted-foreground">
              ログアウトしますか？
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                onClick={() => setShowLogoutDialog(false)}
                variant="outline"
              >
                キャンセル
              </Button>
              <Button
                onClick={() => {
                  setShowLogoutDialog(false);
                  onSignOut();
                }}
                variant="default"
              >
                はい
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
