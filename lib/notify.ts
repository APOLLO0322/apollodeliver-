// LINEに通知を送る共通関数。
// broadcast方式：このBotを友だち追加している全員に送る。
// スタッフを増やすときは、対象者がBotを友だち追加するだけで通知対象になる。
// 通知の失敗が本来の処理（閲覧・DL）を止めないよう、エラーは握りつぶしてログだけ残す。
export async function notifyLine(text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    console.warn("[notifyLine] LINEのトークンが未設定のためスキップしました");
    return;
  }

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/broadcast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: [{ type: "text", text }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[notifyLine] 送信失敗 ${res.status}: ${body}`);
    }
  } catch (e) {
    console.error("[notifyLine] 例外:", e);
  }
}