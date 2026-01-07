import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface WsMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  messageText: string;
  createdAt: string;
}

export interface WebSocketClient {
  isConnected: boolean;
  socketId: string | null;
  send: (evt: any) => void;
  on: (type: string, listener: (event: any) => void) => () => void;
  connect: () => void;
  disconnect: () => void;
}

type UseWebSocketOptions = {
  enabled?: boolean;
  reconnectDelayMs?: number;
};

export function useWebSocket(
  url: string,
  options?: UseWebSocketOptions,
): WebSocketClient {
  const enabled = options?.enabled ?? true;
  const reconnectDelayMs = options?.reconnectDelayMs ?? 5000;

  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(true);

  const listenersRef = useRef(new Map<string, Set<(event: any) => void>>());

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current != null) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    clearReconnectTimer();

    const ws = wsRef.current;
    if (ws) {
      // 手動close → oncloseで再接続しないためにハンドラを先に外す
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;

      try {
        ws.close(1000, "client disconnect");
      } catch {
        // ignore
      }
    }

    wsRef.current = null;
    setIsConnected(false);
    setSocketId(null);
  }, [clearReconnectTimer]);

  const connect = useCallback(() => {
    shouldReconnectRef.current = true;

    const cur = wsRef.current;
    if (
      cur &&
      (cur.readyState === WebSocket.OPEN ||
        cur.readyState === WebSocket.CONNECTING)
    ) {
      return; // CONNECTING中に新規作らない
    }

    clearReconnectTimer();

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      clearReconnectTimer();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        listenersRef.current.get(data.type)?.forEach((fn) => fn(data));
        listenersRef.current.get("*")?.forEach((fn) => fn(data));
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e, event.data);
      }
    };

    ws.onerror = (e) => {
      // onerrorは情報が薄い。原因はonclose(code/reason)やNetworkのWSで見るのが有効
      console.error("WebSocket error:", e);
    };

    ws.onclose = (ev) => {
      setIsConnected(false);
      setSocketId(null);

      console.warn("WebSocket closed:", {
        code: ev.code,
        reason: ev.reason,
        wasClean: ev.wasClean,
      });

      if (!shouldReconnectRef.current) return;
      reconnectTimeoutRef.current = window.setTimeout(
        () => connect(),
        reconnectDelayMs,
      );
    };
  }, [url, clearReconnectTimer, reconnectDelayMs]);

  const send = useCallback((evt: any) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(evt));
    } else {
      console.warn("WebSocket is not connected", ws?.readyState);
    }
  }, []);

  const on = useCallback((type: string, listener: (event: any) => void) => {
    if (!listenersRef.current.has(type))
      listenersRef.current.set(type, new Set());
    listenersRef.current.get(type)!.add(listener);
    return () => listenersRef.current.get(type)?.delete(listener);
  }, []);

  // enabledで接続を制御
  useEffect(() => {
    if (!enabled) {
      disconnect();
      return;
    }
    connect();
    return () => disconnect();
  }, [enabled, connect, disconnect]);

  useEffect(() => {
    const unsub = on("server.hello", (event) => {
      setSocketId(event.payload.socketId);
    });
    return unsub;
  }, [on]);

  return useMemo(
    () => ({ isConnected, socketId, send, on, connect, disconnect }),
    [isConnected, socketId, send, on, connect, disconnect],
  );
}
