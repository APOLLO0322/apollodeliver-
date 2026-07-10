"use client";

import { useState, use, useCallback, useEffect, type CSSProperties } from "react";

type Photo = { id: string; seq: number; url: string | null };
type Data = {
  name: string;
  shootDate: string | null;
  deliveryType: "review" | "final";
  selectEnabled: boolean;
  photos: Photo[];
};

export default function DeliveryPage({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = use(params);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Data | null>(null);

  // ライトボックスで開いている写真のindex（null＝閉じている）
  const [lightbox, setLightbox] = useState<number | null>(null);

  async function unlock() {
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, password }),
      });
      const json = await res.json();
      if (res.ok) setData(json);
      else setError(json.error ?? "エラーが発生しました");
    } catch {
      setError("接続に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  const close = useCallback(() => setLightbox(null), []);
  const prev = useCallback(() => {
    setLightbox((i) => (i === null || !data ? i : (i - 1 + data.photos.length) % data.photos.length));
  }, [data]);
  const next = useCallback(() => {
    setLightbox((i) => (i === null || !data ? i : (i + 1) % data.photos.length));
  }, [data]);

  // キーボード操作（←→で送る、Escで閉じる）
  useEffect(() => {
    if (lightbox === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, close, prev, next]);

  // --- パスワード画面 ---
  if (!data) {
    return (
      <main style={S.gate}>
        <div style={S.gateCard}>
          <div style={S.logo}>APOLLO</div>
          <p style={S.gateSub}>共有リンクを開くにはパスワードが必要です</p>
          <input
            style={S.gateInput}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && unlock()}
            placeholder="パスワード"
          />
          {error && <p style={S.error}>{error}</p>}
          <button style={S.gateBtn} onClick={unlock} disabled={loading || !password}>
            {loading ? "確認中…" : "開く"}
          </button>
        </div>
      </main>
    );
  }

  const current = lightbox !== null ? data.photos[lightbox] : null;

  // --- ギャラリー画面 ---
  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <div style={S.header}>
          <span style={S.headerLogo}>APOLLO</span>
          <span style={S.badge}>{data.deliveryType === "review" ? "確認用" : "納品"}</span>
        </div>

        <h1 style={S.title}>{data.name}</h1>
        {data.shootDate && <p style={S.meta}>撮影日 {data.shootDate}</p>}

        <p style={S.count}>写真 · {data.photos.length}点</p>

        <div style={S.grid}>
          {data.photos.map((p, i) => (
            <div key={p.id} style={S.thumb} onClick={() => p.url && setLightbox(i)}>
              {p.url ? (
                <img src={p.url} alt={`写真 ${p.seq}`} style={S.img} loading="lazy" />
              ) : (
                <span style={S.num}>{String(p.seq).padStart(3, "0")}</span>
              )}
            </div>
          ))}
        </div>

        <p style={S.footer}>APOLLO</p>
      </div>

      {/* --- ライトボックス（拡大表示） --- */}
      {current && current.url && (
        <div style={S.lb} onClick={close}>
          <button style={{ ...S.lbBtn, ...S.lbClose }} onClick={(e) => { e.stopPropagation(); close(); }} aria-label="閉じる">✕</button>
          <button style={{ ...S.lbBtn, ...S.lbPrev }} onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="前へ">‹</button>
          <img
            src={current.url}
            alt={`写真 ${current.seq}`}
            style={S.lbImg}
            onClick={(e) => e.stopPropagation()}
          />
          <button style={{ ...S.lbBtn, ...S.lbNext }} onClick={(e) => { e.stopPropagation(); next(); }} aria-label="次へ">›</button>
          <span style={S.lbCaption}>{lightbox! + 1} / {data.photos.length}</span>
        </div>
      )}
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  gate: { minHeight: "100vh", background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  gateCard: { width: "100%", maxWidth: 360, background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "36px 28px", textAlign: "center" },
  logo: { fontSize: 22, fontWeight: 500, letterSpacing: "0.34em", marginBottom: 20 },
  gateSub: { fontSize: 13, color: "#888", margin: "0 0 20px" },
  gateInput: { width: "100%", height: 42, border: "0.5px solid #e5e5e5", borderRadius: 8, padding: "0 14px", fontSize: 14, boxSizing: "border-box", marginBottom: 12 },
  gateBtn: { width: "100%", height: 42, background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer" },
  error: { fontSize: 13, color: "#c0392b", margin: "0 0 12px" },

  page: { minHeight: "100vh", background: "#fff", padding: "0 0 60px" },
  wrap: { maxWidth: 900, margin: "0 auto", padding: "0 24px" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 0", borderBottom: "0.5px solid #eee", marginBottom: 28 },
  headerLogo: { fontSize: 18, fontWeight: 500, letterSpacing: "0.3em" },
  badge: { fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", padding: "3px 10px", borderRadius: 5, background: "#1a1a1a", color: "#fff" },
  title: { fontSize: 24, fontWeight: 500, margin: "0 0 6px" },
  meta: { fontSize: 13, color: "#888", margin: "0 0 24px" },
  count: { fontSize: 12, letterSpacing: "0.12em", color: "#999", margin: "0 0 14px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 },
  thumb: { position: "relative", aspectRatio: "3/2", background: "#f4f4f4", border: "0.5px solid #eee", borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  img: { width: "100%", height: "100%", objectFit: "cover" },
  num: { fontSize: 12, color: "#bbb" },
  footer: { textAlign: "center", fontSize: 11, letterSpacing: "0.2em", color: "#ccc", marginTop: 40 },

  lb: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 },
  lbImg: { maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain", userSelect: "none" },
  lbBtn: { position: "fixed", background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  lbClose: { top: 20, right: 24, width: 44, height: 44, fontSize: 18 },
  lbPrev: { left: 20, top: "50%", transform: "translateY(-50%)", width: 52, height: 52, fontSize: 30 },
  lbNext: { right: 20, top: "50%", transform: "translateY(-50%)", width: 52, height: 52, fontSize: 30 },
  lbCaption: { position: "fixed", bottom: 24, left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: 13 },
};