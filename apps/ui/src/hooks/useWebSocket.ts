import { useCallback, useEffect, useRef, useState } from "react";

export function useWebSocket(url: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const listenersRef = useRef(new Map<string, Set<(event: any) => void>>());

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

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
        const data = JSON.parse(event.data);
        listenersRef.current.get(data.type)?.forEach((fn) => fn(data));
        listenersRef.current.get("*")?.forEach((fn) => fn(data));
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };

    ws.onerror = (e) => console.error("WebSocket error:", e);

    ws.onclose = () => {
      setIsConnected(false);
      setSocketId(null);
      reconnectTimeoutRef.current = window.setTimeout(() => connect(), 5000);
    };
  }, [url]);

  const send = useCallback((evt: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(evt));
    } else {
      console.warn("WebSocket is not connected");
    }
  }, []);

  const on = useCallback((type: string, listener: (event: any) => void) => {
    if (!listenersRef.current.has(type)) listenersRef.current.set(type, new Set());
    listenersRef.current.get(type)!.add(listener);
    return () => listenersRef.current.get(type)?.delete(listener);
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  useEffect(() => {
    const unsub = on("server.hello", (event) => {
      setSocketId(event.payload.socketId);
    });
    return unsub;
  }, [on]);

  return { isConnected, socketId, send, on, connect, disconnect };
}
