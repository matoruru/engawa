import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface WsMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  messageText: string;
  createdAt: string;
}

export type WsEnvelope<TType extends string = string, TPayload = unknown> = {
  type: TType;
  payload: TPayload;
};

export interface WebSocketClient {
  isConnected: boolean;
  socketId: string | null;
  send: <T>(evt: T) => void;
  on: <T = unknown>(type: string, listener: (event: T) => void) => () => void;
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

  const listenersRef = useRef(new Map<string, Set<(event: unknown) => void>>());

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
        const parsed: unknown = JSON.parse(String(event.data));

        // type でディスパッチするため、最低限 object かを確認
        if (typeof parsed === "object" && parsed !== null && "type" in parsed) {
          const msg = parsed as { type: string };

          const typedListeners = listenersRef.current.get(msg.type);
          if (typedListeners) {
            typedListeners.forEach((fn) => {
              fn(parsed);
            });
          }

          const wildcardListeners = listenersRef.current.get("*");
          if (wildcardListeners) {
            wildcardListeners.forEach((fn) => {
              fn(parsed);
            });
          }
        } else {
          // 期待フォーマット外は捨てる（必要ならログ）
          // console.warn("Unexpected WS message:", parsed);
        }
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

      wsRef.current = null; // close後のソケットを保持しない（次回connectの判定を正しくする）
    };
  }, [url, clearReconnectTimer, reconnectDelayMs]);

  const send = useCallback(<T>(evt: T) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(evt));
    } else {
      console.warn("WebSocket is not connected", ws?.readyState);
    }
  }, []);

  const on = useCallback(<T>(type: string, listener: (event: T) => void) => {
    const map = listenersRef.current;
    const set = map.get(type) ?? new Set<(event: unknown) => void>();

    // listener は unknown を受けてから T にキャストして呼ぶ
    const wrapped = (event: unknown) => {
      listener(event as T);
    };

    set.add(wrapped);
    if (!map.has(type)) map.set(type, set);

    return () => {
      const current = map.get(type);
      if (!current) return;

      current.delete(wrapped); // delete の戻り値(boolean)は返さない
      if (current.size === 0) {
        map.delete(type);
      }
    };
  }, []);

  // enabledで接続を制御
  useEffect(() => {
    if (!enabled) {
      disconnect();
      // EffectCallback の戻り値を常に「void | Destructor」にする
      return () => {
        // すでに disconnect 済みでも安全
        disconnect();
      };
    }

    connect();
    return () => disconnect();
  }, [enabled, connect, disconnect]);

  useEffect(() => {
    const unsub = on<WsEnvelope<"server.hello", { socketId: string }>>(
      "server.hello",
      (event) => {
        setSocketId(event.payload.socketId);
      },
    );
    return () => {
      unsub();
    };
  }, [on]);

  return useMemo(
    () => ({ isConnected, socketId, send, on, connect, disconnect }),
    [isConnected, socketId, send, on, connect, disconnect],
  );
}
