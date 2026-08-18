import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_REQUEST_TIMEOUT_MS = 12000;
const PRODUCTION_API_URL = "https://a2b-lift-backend-production-4fea.up.railway.app/";
const inFlightGetRequests = new Map<string, Promise<Response>>();

/**
 * Gets the base URL for the Express API server.
 * EXPO_PUBLIC_DOMAIN can be a full URL (https://host:port) or just a host/host:port.
 * e.g. EXPO_PUBLIC_DOMAIN=https://a2b-lift.up.railway.app
 *   or EXPO_PUBLIC_DOMAIN=a2b-lift.up.railway.app
 */
export function getApiUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const normalizedDomain = String(domain || "").trim().toLowerCase().replace(/\/+$/, "");

  if (
    !normalizedDomain ||
    normalizedDomain === "https://a2blift.com" ||
    normalizedDomain === "https://www.a2blift.com" ||
    normalizedDomain === "https://api.a2blift.com" ||
    normalizedDomain === "https://api-production-0783.up.railway.app"
  ) {
    return PRODUCTION_API_URL;
  }

  // If already a full URL with protocol, use it directly
  if (domain.startsWith("http://") || domain.startsWith("https://")) {
    return domain.endsWith("/") ? domain : domain + "/";
  }

  // Otherwise treat as host (optionally with port) and determine protocol
  const isLocal =
    domain.includes("localhost") ||
    domain.includes("127.0.0.1") ||
    /^192\.168\.\d+\.\d+/.test(domain) ||
    /^10\.\d+\.\d+\.\d+/.test(domain) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+/.test(domain);
  const protocol = isLocal ? "http" : "https";
  return `${protocol}://${domain}/`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Clone the response before reading to avoid consuming the body
    const clonedRes = res.clone();
    const contentType = clonedRes.headers.get("content-type") || "";
    let text = "";
    if (contentType.includes("application/json")) {
      const body = await clonedRes.json().catch(() => null);
      text = body?.message || body?.error || JSON.stringify(body || {});
    } else {
      text = (await clonedRes.text()) || res.statusText;
      const preMatch = text.match(/<pre>(.*?)<\/pre>/is);
      if (preMatch?.[1]) text = preMatch[1];
      text = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
}

export function isUnauthorizedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /^401\b/.test(message) || message.toLowerCase().includes("unauthorized");
}

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const token = await AsyncStorage.getItem("a2b_token");
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {
    // ignore
  }
  return {};
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = API_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("Request timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const authHeader = await getAuthHeader();
  const headers: Record<string, string> = {
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...authHeader,
  };

  const normalizedMethod = method.toUpperCase();
  const requestKey = `${normalizedMethod}:${url}:${authHeader.Authorization || ""}`;
  const executeRequest = async (retries = 2): Promise<Response> => {
    let attempt = 0;
    while (true) {
      try {
        const res = await fetchWithTimeout(url.toString(), {
          method: normalizedMethod,
          headers,
          body: data ? JSON.stringify(data) : undefined,
          // credentials: "include" is not supported by expo/fetch on native — JWT via Authorization header is used instead
        });
        // If upstream error (502, 503, 504) and we have retries remaining, retry with backoff
        if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < retries) {
          attempt++;
          await new Promise((r) => setTimeout(r, attempt * 600));
          continue;
        }
        await throwIfResNotOk(res);
        return res;
      } catch (err: any) {
        const isTransient =
          err?.message?.includes("502") ||
          err?.message?.includes("503") ||
          err?.message?.includes("504") ||
          err?.message?.includes("upstream") ||
          err?.message?.includes("Network request failed");
        if (isTransient && attempt < retries) {
          attempt++;
          await new Promise((r) => setTimeout(r, attempt * 600));
          continue;
        }
        throw err;
      }
    }
  };

  if (normalizedMethod !== "GET") {
    return executeRequest();
  }

  let request = inFlightGetRequests.get(requestKey);
  if (!request) {
    request = executeRequest();
    inFlightGetRequests.set(requestKey, request);
  }

  try {
    return (await request).clone();
  } finally {
    if (inFlightGetRequests.get(requestKey) === request) {
      inFlightGetRequests.delete(requestKey);
    }
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const authHeader = await getAuthHeader();
    const res = await fetchWithTimeout(url.toString(), {
      headers: authHeader,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as any;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
