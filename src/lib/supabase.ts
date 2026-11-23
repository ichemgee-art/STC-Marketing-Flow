import { createClient } from "@supabase/supabase-js";
export const configured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://missing.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "missing",
);
