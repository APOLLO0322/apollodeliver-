import { createClient } from "@supabase/supabase-js";

// ⚠️ このクライアントは service_role キーを使う = RLSを貫通する強い権限。
//    サーバー側（API route / Server Component / Server Action）からのみ import すること。
//    'use client' のファイルから絶対に import しない。
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
