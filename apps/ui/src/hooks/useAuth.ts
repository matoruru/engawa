import { useEffect, useState, useMemo } from "react";
import { createBetterAuthClient } from "../lib/authClient";

interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
}

export function useAuth(apiUrl: string) {
  const [user, setUser] = useState<User | null>(null);
  const [appUserId, setAppUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const authClient = useMemo(
    () => createBetterAuthClient(`${apiUrl}/api/auth`),
    [apiUrl]
  );

  const fetchAppUserId = async () => {
    try {
      const meResponse = await fetch(`${apiUrl}/me`, {
        method: "GET",
        credentials: "include",
      });

      if (meResponse.ok) {
        const meData = (await meResponse.json()) as { userId: string };
        setAppUserId(meData.userId);
      } else {
        setAppUserId(null);
      }
    } catch (error) {
      console.error("Failed to get app user ID:", error);
      setAppUserId(null);
    }
  };

  const checkSession = async () => {
    try {
      const session = await authClient.getSession();
      if (session?.data?.user) {
        setUser(session.data.user);
        await fetchAppUserId();
      } else {
        setUser(null);
        setAppUserId(null);
      }
    } catch (error) {
      console.error("Failed to check session:", error);
      setUser(null);
      setAppUserId(null);
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
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        return { success: false, error: result.error.message || "ログインに失敗しました" };
      }

      if (result.data?.user) {
        setUser(result.data.user);
        await fetchAppUserId();
        return { success: true };
      }

      return { success: false, error: "ログインに失敗しました" };
    } catch (error) {
      console.error("Failed to sign in:", error);
      return { success: false, error: "ログインに失敗しました" };
    }
  };

  const signUpWithEmail = async (email: string, password: string, name: string) => {
    try {
      const result = await authClient.signUp.email({
        email,
        password,
        name,
      });

      if (result.error) {
        return { success: false, error: result.error.message || "登録に失敗しました" };
      }

      if (result.data?.user) {
        setUser(result.data.user);
        await fetchAppUserId();
        return { success: true };
      }

      return { success: false, error: "登録に失敗しました" };
    } catch (error) {
      console.error("Failed to sign up:", error);
      return { success: false, error: "登録に失敗しました" };
    }
  };

  const signInWithGoogle = () => {
    authClient.signIn.social({
      provider: "google",
      callbackURL: window.location.origin,
    });
  };

  const signOut = async () => {
    try {
      await authClient.signOut();
      setUser(null);
      setAppUserId(null);
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  return {
    user,
    appUserId,
    isLoading,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut,
    refreshSession: checkSession,
  };
}

