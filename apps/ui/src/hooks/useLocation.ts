import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * ブラウザのLocation APIをラップしたカスタムフック
 * URLの読み取りと更新を管理する
 */
export function useLocation() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const [search, setSearch] = useState(window.location.search);

  // URL変更を監視
  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
      setSearch(window.location.search);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // pushStateの変更を監視するためにhistory.pushStateをラップ
  useEffect(() => {
    const originalPushState = window.history.pushState;
    window.history.pushState = (...args) => {
      originalPushState.apply(window.history, args);
      // 状態を即座に更新
      setPathname(window.location.pathname);
      setSearch(window.location.search);
    };

    return () => {
      window.history.pushState = originalPushState;
    };
  }, []);

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, "", path);
    // 状態を即座に更新（pushStateのラップで監視されるが、念のため明示的に更新）
    setPathname(path);
    setSearch("");

    // カスタムイベントを発火して他のコンポーネントに通知
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  const getSearchParam = useCallback((key: string): string | null => {
    const params = new URLSearchParams(window.location.search);
    return params.get(key);
  }, []);

  const getOrigin = useCallback((): string => {
    return window.location.origin;
  }, []);

  return useMemo(
    () => ({
      pathname,
      search,
      navigate,
      getSearchParam,
      getOrigin,
    }),
    [pathname, search, navigate, getSearchParam, getOrigin],
  );
}
