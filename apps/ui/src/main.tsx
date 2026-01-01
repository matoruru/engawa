import { registerSW } from "virtual:pwa-register";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// PWA: service worker registration (auto-update)
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // 新しいバージョンが利用可能になった時
    if (confirm("新しいバージョンが利用可能です。今すぐ更新しますか？")) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log("アプリがオフラインで使用可能になりました");
  },
  onRegistered(registration) {
    console.log("Service Worker登録完了", registration);
  },
  onRegisterError(error) {
    console.error("Service Worker登録エラー", error);
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
