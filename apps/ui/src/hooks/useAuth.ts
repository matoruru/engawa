import { treaty } from "@elysiajs/eden";
import type { App as AppContract } from "@idobata/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createBetterAuthClient } from "../lib/authClient";
import { useApi } from "./useApi";

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

  const api = useApi(apiUrl);

  const authClient = useMemo(
    () => createBetterAuthClient(`${apiUrl}/api/auth`),
    [apiUrl],
  );

  const fetchAppUserId = useCallback(async () => {
    try {
      const meResponse = await api.me.get();
      if (meResponse.data && "user" in meResponse.data) {
        setAppUserId(meResponse.data.user.id);
      } else {
        setAppUserId(null);
      }
    } catch (error) {
      console.error("Failed to get app user ID:", error);
      setAppUserId(null);
    }
  }, [api]);

  const checkSession = useCallback(async () => {
    try {
      const session = await authClient.getSession();
      if (session?.data?.user) {
        const user = session.data.user;
        setUser({
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image ?? undefined,
        });
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
  }, [authClient, fetchAppUserId]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      try {
        const result = await authClient.signIn.email({
          email,
          password,
        });

        if (result.error) {
          return {
            success: false,
            error: result.error.message || "ログインに失敗しました",
          };
        }

        if (result.data?.user) {
          const user = result.data.user;
          setUser({
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image ?? undefined,
          });
          await fetchAppUserId();
          return { success: true };
        }

        return { success: false, error: "ログインに失敗しました" };
      } catch (error) {
        console.error("Failed to sign in:", error);
        return { success: false, error: "ログインに失敗しました" };
      }
    },
    [authClient, fetchAppUserId],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string, name: string) => {
      try {
        const result = await authClient.signUp.email({
          email,
          password,
          name,
        });

        if (result.error) {
          return {
            success: false,
            error: result.error.message || "登録に失敗しました",
          };
        }

        if (result.data?.user) {
          const user = result.data.user;
          setUser({
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image ?? undefined,
          });
          await fetchAppUserId();
          return { success: true };
        }

        return { success: false, error: "登録に失敗しました" };
      } catch (error) {
        console.error("Failed to sign up:", error);
        return { success: false, error: "登録に失敗しました" };
      }
    },
    [authClient, fetchAppUserId],
  );

  const signInWithGoogle = useCallback(() => {
    authClient.signIn.social({
      provider: "google",
      callbackURL: typeof window !== "undefined" ? window.location.origin : "",
    });
  }, [authClient]);

  const signOut = useCallback(async () => {
    try {
      await authClient.signOut();
      setUser(null);
      setAppUserId(null);
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  }, [authClient]);

  return useMemo(
    () => ({
      user,
      appUserId,
      isLoading,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signOut,
      refreshSession: checkSession,
    }),
    [
      user,
      appUserId,
      isLoading,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signOut,
      checkSession,
    ],
  );
}
