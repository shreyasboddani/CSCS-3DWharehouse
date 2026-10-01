import { create } from "zustand";
import type { Warehouse } from "../domain/warehouse";
export type User = {
  id: string;
  name: string;
  email: string;
  workspace: string;
};
let initializationEpoch = 0;
export function returnToPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.includes("\\")) return "/app";
  const url = new URL(value, "https://warehouse.invalid");
  return url.origin === "https://warehouse.invalid" &&
    (url.pathname === "/app" || url.pathname.startsWith("/app/"))
    ? url.pathname + url.search + url.hash
    : "/app";
}
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const requestEpoch = initializationEpoch;
  let res: Response;
  try {
    res = await fetch("/api/v1" + path, {
      method,
      credentials: "same-origin",
      headers: data ? { "Content-Type": "application/json" } : undefined,
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error(
      "The server could not be reached in time. If you were saving, reload to check the saved data before trying again.",
    );
  }
  if (
    res.status === 401 &&
    !path.startsWith("/auth/") &&
    requestEpoch === initializationEpoch
  ) {
    initializationEpoch += 1;
    useSession.setState({
      user: null,
      warehouses: [],
      ready: true,
      initializationError: "",
    });
  }
  if (!res.headers.get("Content-Type")?.includes("application/json"))
    throw new Error(
      "The server returned an unexpected response. Check your connection and reload before retrying a save.",
    );
  const payload = await res.json();
  if (!res.ok)
    throw new ApiError(payload.error || "Request failed", res.status);
  return payload as T;
}
type Session = {
  user: User | null;
  ready: boolean;
  initializationError: string;
  warehouses: Warehouse[];
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
  logout: () => Promise<void>;
};
export const useSession = create<Session>((set) => ({
  user: null,
  ready: false,
  initializationError: "",
  warehouses: [],
  initialize: async () => {
    const epoch = ++initializationEpoch;
    set({ ready: false, initializationError: "" });
    try {
      const result = await api<{ user: User | null }>("/auth/me");
      if (epoch === initializationEpoch)
        set({ user: result.user, ready: true, initializationError: "" });
    } catch (error) {
      if (epoch === initializationEpoch)
        set({
          ready: true,
          initializationError:
            error instanceof Error
              ? error.message
              : "Session could not be checked.",
        });
    }
  },
  refresh: async () => {
    const epoch = initializationEpoch;
    const result = await api<{ warehouses: Warehouse[] }>("/warehouses");
    if (epoch === initializationEpoch) set({ warehouses: result.warehouses });
  },
  setUser: (user) => {
    initializationEpoch += 1;
    set({ user, warehouses: [], ready: true, initializationError: "" });
  },
  logout: async () => {
    initializationEpoch += 1;
    try {
      await api("/auth/logout", "POST", {});
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    set({ user: null, warehouses: [], ready: true, initializationError: "" });
  },
}));
