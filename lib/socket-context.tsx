import React, {
  createContext,
  useContext,
  useMemo,
  useRef,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

type EventCallback = (...args: any[]) => void;

interface SocketContextValue {
  emit: (event: string, data: any) => void;
  on: (event: string, callback: EventCallback) => void;
  off: (event: string, callback?: EventCallback) => void;
  triggerEvent: (event: string, data: any) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, accessToken } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  // Local listeners map — used to re-attach after reconnect and for triggerEvent
  const listenersRef = useRef<Map<string, Set<EventCallback>>>(new Map());
  const persistentRegistrationsRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    if (!user || !accessToken) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      persistentRegistrationsRef.current.clear();
      return;
    }

    let baseUrl: string;
    try {
      baseUrl = getApiUrl();
    } catch {
      console.warn("SocketProvider: EXPO_PUBLIC_DOMAIN not set, skipping socket connection");
      return;
    }

    const socket = io(baseUrl, {
      transports: ["websocket", "polling"],
      upgrade: true,
      rememberUpgrade: true,
      auth: { token: accessToken },
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 8000,
    });

    socketRef.current = socket;
    listenersRef.current.forEach((callbacks, event) => {
      callbacks.forEach((callback) => socket.on(event, callback));
    });

    socket.on("connect", () => {
      console.log("[Socket] connected:", socket.id);
      persistentRegistrationsRef.current.forEach((data, event) => {
        socket.emit(event, data);
      });
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket] disconnected:", reason);
    });

    socket.on("connect_error", (err) => {
      console.warn("[Socket] connection error:", err.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, accessToken]);

  const on = useCallback((event: string, callback: EventCallback) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(callback);
    // Attach to live socket if already connected
    socketRef.current?.on(event, callback);
  }, []);

  const off = useCallback((event: string, callback?: EventCallback) => {
    if (!callback) {
      listenersRef.current.delete(event);
      socketRef.current?.removeAllListeners(event);
    } else {
      listenersRef.current.get(event)?.delete(callback);
      socketRef.current?.off(event, callback);
    }
  }, []);

  const emit = useCallback((event: string, data: any) => {
    if (event === "chauffeur:register") {
      persistentRegistrationsRef.current.set(event, data);
    }
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn("[Socket] emit called while disconnected, event:", event);
    }
  }, []);

  // Allows manually triggering local listeners (e.g. for HTTP-polling fallback)
  const triggerEvent = useCallback((event: string, data: any) => {
    listenersRef.current.get(event)?.forEach((cb) => cb(data));
  }, []);

  const value = useMemo(
    () => ({ emit, on, off, triggerEvent }),
    [emit, on, off, triggerEvent]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}
