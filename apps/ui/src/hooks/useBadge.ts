import { useEffect } from "react";

export function useBadge(count: number) {
  useEffect(() => {
    if (!("navigator" in window) || !("setAppBadge" in navigator)) {
      return;
    }

    const updateBadge = async () => {
      try {
        if (count > 0) {
          await navigator.setAppBadge(count);
        } else {
          await navigator.clearAppBadge();
        }
      } catch (error) {
        console.error("バッジの更新に失敗:", error);
      }
    };

    updateBadge();
  }, [count]);
}
