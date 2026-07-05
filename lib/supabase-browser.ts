import { createClient } from "@supabase/supabase-js";

// ブラウザ側で署名付きアップロードURLを使うためのクライアント。
// anon キーは公開して問題ない（RLSで守られる）。NEXT_PUBLIC_ が付いた変数のみ使う。
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
