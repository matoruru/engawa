import { useEffect, useState } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
}

interface Session {
  user: User;
  session: {
    id: string;
    expiresAt: Date;
  };
}

export function useAuth(apiUrl: string) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkSession = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/auth/get-session`, {
        method: "GET",
        credentials: "include",
      });

      if (response.ok) {
        const data = (await response.json()) as { user: User; session: Session["session"] } | null;
        if (data?.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Failed to check session:", error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  const signInWithEmail = async (email: string, password: string) => {
    try {
      const response = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = (await response.json()) as { user: User; session: Session["session"] };
        setUser(data.user);
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.message || "ログインに失敗しました" };
      }
    } catch (error) {
      console.error("Failed to sign in:", error);
      return { success: false, error: "ログインに失敗しました" };
    }
  };

  const signUpWithEmail = async (email: string, password: string, name: string) => {
    try {
      const response = await fetch(`${apiUrl}/api/auth/sign-up/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password, name }),
      });

      if (response.ok) {
        const data = (await response.json()) as { user: User; session: Session["session"] };
        setUser(data.user);
        return { success: true };
      } else {
        const error = await response.json();
        return { success: false, error: error.message || "登録に失敗しました" };
      }
    } catch (error) {
      console.error("Failed to sign up:", error);
      return { success: false, error: "登録に失敗しました" };
    }
  };

  const signInWithGoogle = () => {
    // Googleログインはリダイレクト方式
    window.location.href = `${apiUrl}/api/auth/sign-in/social?provider=google`;
  };

  const signOut = async () => {
    try {
      await fetch(`${apiUrl}/api/auth/sign-out`, {
        method: "POST",
        credentials: "include",
      });
      setUser(null);
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  return {
    user,
    isLoading,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut,
    refreshSession: checkSession,
  };
}

