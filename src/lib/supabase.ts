import { createClient } from "@supabase/supabase-js";

export const configured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Each tab has its own session; logging in as Nardine in one tab won't
// replace Gerges's session in another tab of the same browser profile.
// The tab key survives refreshes but is not shared through localStorage.
const browserSessionStorage = {
  getItem(key: string): string | null {
    try {
      return typeof window === "undefined" ? null : window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      if (typeof window !== "undefined") window.sessionStorage.setItem(key, value);
    } catch {
      // Private browsing / strict browser policies can disable storage.
    }
  },
  removeItem(key: string): void {
    try {
      if (typeof window !== "undefined") window.sessionStorage.removeItem(key);
    } catch {
      // No session to remove when storage is unavailable.
    }
  },
};

function tabAuthStorageKey(): string {
  if (typeof window === "undefined") return "stc-marketing-auth-server";
  const key = "stc-marketing-tab-id";
  try {
    let id = window.sessionStorage.getItem(key);
    if (!id) {
      id = window.crypto.randomUUID();
      window.sessionStorage.setItem(key, id);
    }
    // A unique storageKey also isolates Supabase cross-tab auth broadcasts.
    return "stc-marketing-auth-" + id;
  } catch {
    return "stc-marketing-auth-tab";
  }
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://missing.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "missing",
  {
    auth: {
      storage: browserSessionStorage,
      storageKey: tabAuthStorageKey(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
