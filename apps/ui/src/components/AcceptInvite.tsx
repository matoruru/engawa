import { AlertCircle, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "../hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

interface AcceptInviteProps {
  apiUrl: string;
}

export function AcceptInvite({ apiUrl }: AcceptInviteProps) {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<{
    token: string;
    inviterId: string;
    expiresAt: string;
    acceptedAt: string | null;
    inviter: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
    } | null;
  } | null>(null);
  const [status, setStatus] = useState<
    | "loading"
    | "notFound"
    | "expired"
    | "alreadyAccepted"
    | "conflict"
    | "ready"
    | "accepted"
  >("loading");
  const [isAccepting, setIsAccepting] = useState(false);
  const { user, appUserId } = useAuth(apiUrl);
  const app = useApi(apiUrl);

  useEffect(() => {
    if (!token) {
      return;
    }

    const loadInvite = async () => {
      try {
        const { data } = await app.invites({ token }).get();
        if (data) {
          switch (data.kind) {
            case "ok":
              setInvite(data.invite);
              setStatus("ready");
              break;
            default:
              setStatus(data.kind);
              break;
          }
        } else {
          setStatus("notFound");
        }
      } catch (error) {
        console.error("Failed to load invite:", error);
        setStatus("notFound");
      }
    };

    loadInvite();
  }, [token, app]);

  if (!token) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">無効な招待リンクです</p>
      </div>
    );
  }

  const handleAccept = async () => {
    if (!user || !appUserId) {
      // ログインが必要
      return;
    }

    try {
      setIsAccepting(true);
      const { data } = await app
        .invites({ token })
        .accept.post({ userId: appUserId });
      if (data) {
        switch (data.kind) {
          case "accepted":
            setStatus("accepted");
            break;
          default:
            setStatus(data.kind);
            break;
        }
      }
    } catch (error) {
      console.error("Failed to accept invite:", error);
    } finally {
      setIsAccepting(false);
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

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  if (status === "notFound") {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              招待が見つかりません
            </CardTitle>
            <CardDescription>この招待リンクは無効です。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              招待の有効期限が切れています
            </CardTitle>
            <CardDescription>この招待リンクは期限切れです。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (status === "alreadyAccepted") {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-green-500" />
              既に受け入れ済み
            </CardTitle>
            <CardDescription>
              この招待は既に受け入れられています。
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (status === "accepted") {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-green-500" />
              友達になりました！
            </CardTitle>
            <CardDescription>
              {invite?.inviter?.displayName || "ユーザー"}
              さんと友達になりました。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => {
                navigate("/");
              }}
              className="w-full"
            >
              ホームに戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>友達招待</CardTitle>
          <CardDescription>
            {invite?.inviter ? (
              <>
                <span className="font-medium">
                  {invite.inviter.displayName}
                </span>
                さんからの招待
              </>
            ) : (
              "招待を受け入れますか？"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {invite?.inviter && (
            <div className="flex flex-col items-center gap-4">
              <Avatar className="h-20 w-20">
                {invite.inviter.avatarUrl ? (
                  <AvatarImage
                    src={invite.inviter.avatarUrl}
                    alt={invite.inviter.displayName}
                    className="object-cover"
                  />
                ) : (
                  <AvatarFallback className="text-xl bg-primary/10">
                    {getInitials(invite.inviter.displayName)}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="text-center">
                <h2 className="text-lg font-semibold">
                  {invite.inviter.displayName}
                </h2>
                <p className="text-sm text-muted-foreground">
                  @{invite.inviter.username}
                </p>
              </div>
            </div>
          )}

          {!user || !appUserId ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                招待を受け入れるにはログインが必要です
              </p>
              <Button
                onClick={() => {
                  navigate("/");
                }}
                className="w-full"
              >
                ログイン
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleAccept}
              disabled={isAccepting}
              className="w-full"
            >
              <UserCheck className="mr-2 h-4 w-4" />
              {isAccepting ? "受け入れ中..." : "招待を受け入れる"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
