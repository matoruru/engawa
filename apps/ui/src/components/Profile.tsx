import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { ArrowLeft, LogOut, User } from "lucide-react";

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
}

export function Profile({ user, onBack, onSignOut }: ProfileProps) {
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
        <div className="flex items-center gap-3">
          <Button
            onClick={onBack}
            size="icon"
            variant="ghost"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">プロフィール</h1>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>アカウント情報</CardTitle>
            <CardDescription>あなたのプロフィール情報</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* アバター */}
            <div className="flex flex-col items-center gap-4">
              <Avatar className="h-24 w-24">
                {user.image ? (
                  <AvatarImage src={user.image} alt={user.name} />
                ) : null}
                <AvatarFallback className="text-2xl">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="text-center">
                <h2 className="text-xl font-semibold">{user.name}</h2>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>

            {/* ユーザー情報 */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">表示名</p>
                  <p className="text-sm text-muted-foreground">{user.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">メールアドレス</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
            </div>

            {/* ログアウトボタン */}
            <div className="pt-4 border-t">
              <Button
                onClick={onSignOut}
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
    </div>
  );
}

