import { useEffect, useRef, useState } from "react";

export type WsClientEvent =
  | {
      type: "messages.sync";
      payload: {
        conversationId: string;
        afterMessageId?: string;
        limit: number;
      };
    }
  | {
      type: "message.send";
      payload: {
        conversationId: string;
        clientMessageId: string;
        messageText: string;
      };
    }
  | {
      type: "read.update";
      payload: {
        conversationId: string;
        lastReadMessageId: string;
      };
    }
  | {
      type: "typing.start";
      payload: {
        conversationId: string;
      };
    }
  | {
      type: "typing.stop";
      payload: {
        conversationId: string;
      };
    };

export type WsServerEvent =
  | {
      type: "server.hello";
      payload: { socketId: string };
    }
  | {
      type: "server.error";
      payload: { reason: "UNAUTHORIZED" | "BAD_PAYLOAD" };
    }
  | {
      type: "messages.synced";
      payload:
        | { kind: "ok"; messages: WsMessage[] }
        | { kind: "forbidden"; reason: "NOT_A_MEMBER" };
    }
  | {
      type: "message.created";
      payload: WsMessage;
    }
  | {
      type: "message.rejected";
      payload: { kind: "forbidden"; reason: "NOT_A_MEMBER" };
    }
  | {
      type: "read.updated";
      payload:
        | { kind: "updated"; cursor: WsReadCursor }
        | { kind: "ignored"; cursor: WsReadCursor | null }
        | { kind: "forbidden"; reason: "NOT_A_MEMBER" };
    }
  | {
      type: "typing.started";
      payload: {
        conversationId: string;
        userId: string;
      };
    }
  | {
      type: "typing.stopped";
      payload: {
        conversationId: string;
        userId: string;
      };
    }
  | {
      type: "*";
      payload: never;
    };

export type WsMessage = {
  messageId: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  messageText: string;
  createdAt: string | Date;
};

export type WsReadCursor = {
  conversationId: string;
  userId: string;
  lastReadMessageId: string;
  updatedAt: string | Date;
};

export function useWebSocket(url: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const listenersRef = useRef<
    Map<WsServerEvent["type"], Set<(event: WsServerEvent) => void>>
  >(new Map());

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WsServerEvent;
          const listeners = listenersRef.current.get(data.type);
          if (listeners) {
            listeners.forEach((listener) => listener(data));
          }
          // すべてのイベントタイプのリスナーも呼ぶ
          const allListeners = listenersRef.current.get(
            "*" as WsServerEvent["type"]
          );
          if (allListeners) {
            allListeners.forEach((listener) => listener(data));
          }
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setSocketId(null);
        // 自動再接続（5秒後）
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, 5000);
      };
    } catch (error) {
      console.error("Failed to connect WebSocket:", error);
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
  };

  const send = (event: WsClientEvent) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    } else {
      console.warn("WebSocket is not connected");
    }
  };

  const on = <T extends WsServerEvent["type"]>(
    type: T,
    listener: (event: Extract<WsServerEvent, { type: T }>) => void
  ) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(listener as (event: WsServerEvent) => void);

    return () => {
      const listeners = listenersRef.current.get(type);
      if (listeners) {
        listeners.delete(listener as (event: WsServerEvent) => void);
      }
    };
  };

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [url]);

  // server.helloイベントをリッスンしてsocketIdを設定
  useEffect(() => {
    const unsubscribe = on("server.hello", (event) => {
      setSocketId(event.payload.socketId);
    });
    return unsubscribe;
  }, []);

  return {
    isConnected,
    socketId,
    send,
    on,
    connect,
    disconnect,
  };
}

