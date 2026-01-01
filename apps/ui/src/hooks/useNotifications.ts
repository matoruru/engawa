import { useEffect, useRef } from "react";

export function useNotifications() {
  const permissionRef = useRef<NotificationPermission | null>(null);

  // 通知許可をリクエスト
  const requestPermission = async (): Promise<boolean> => {
    if (!("Notification" in window)) {
      console.warn("このブラウザは通知をサポートしていません");
      return false;
    }

    if (Notification.permission === "granted") {
      return true;
    }

    if (Notification.permission === "denied") {
      console.warn("通知が拒否されています");
      return false;
    }

    const permission = await Notification.requestPermission();
    permissionRef.current = permission;
    return permission === "granted";
  };

  // 通知を送信
  const showNotification = async (
    title: string,
    options?: NotificationOptions,
  ) => {
    if (!("Notification" in window)) {
      return;
    }

    if (Notification.permission !== "granted") {
      const granted = await requestPermission();
      if (!granted) {
        return;
      }
    }

    // サービスワーカーが利用可能な場合は、サービスワーカー経由で通知を送信
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, {
          badge: "/icons/icon-192.png",
          icon: "/icons/icon-192.png",
          ...options,
        });
        return;
      } catch (error) {
        console.error("Service Worker通知の送信に失敗:", error);
      }
    }

    // フォールバック: 通常の通知APIを使用
    new Notification(title, {
      badge: "/icons/icon-192.png",
      icon: "/icons/icon-192.png",
      ...options,
    });
  };

  // 初期化時に通知許可を確認
  useEffect(() => {
    if ("Notification" in window) {
      permissionRef.current = Notification.permission;
    }
  }, []);

  return {
    requestPermission,
    showNotification,
    permission: permissionRef.current,
  };
}
