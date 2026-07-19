"use client";

import { useState, use, useRef, useCallback, useEffect, type CSSProperties } from "react";
import JSZip from "jszip";

type Photo = {
  id: string;
  seq: number;
  url: string | null;
  downloadUrl: string | null;
  filename: string;
};
type Video = {
  id: string;
  seq: number;
  playUrl: string;
  downloadUrl: string | null;
  filename: string;
};
type Data = {
  name: string;
  shootDate: string | null;
  deliveryType: "review" | "final";
  selectEnabled: boolean;
  photos: Photo[];
  videos: Video[];
};

export default function DeliveryPage({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = use(params);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Data | null>(null);

  const [lightbox, setLightbox] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState({ done: 0, total: 0 });

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

  // 動画の再生通知（サーバー側で初回のみLINEへ）
  const playedRef = useRef(false);
  function onPlay() {
    if (playedRef.current) return;
    playedRef.current = true;
    fetch("/api/play-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId }),
    }).catch(() => {});
  }

  // 個別ダウンロード
  function downloadOne(p: Photo) {
    if (!p.downloadUrl) return;
    const a = document.createElement("a");
    a.href = p.downloadUrl;
    a.download = p.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 通知（個別。サーバー側で初回のみLINEへ）
    fetch("/api/download-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId, kind: "single" }),
    }).catch(() => {});
  }

  // 一括ダウンロード（ブラウザ側でZIP生成）
  async function downloadAll() {
    if (!data) return;
    const targets = data.photos.filter((p) => p.downloadUrl);
    if (targets.length === 0) return;
    setZipping(true);
    setZipProgress({ done: 0, total: targets.length });
    try {
      const zip = new JSZip();
      for (let i = 0; i < targets.length; i++) {
        const p = targets[i];
        const res = await fetch(p.downloadUrl!);
        const blob = await res.blob();
        zip.file(p.filename, blob);
        setZipProgress({ done: i + 1, total: targets.length });
      }
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.name}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      // 通知（一括。必ずLINEへ）
      fetch("/api/download-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, kind: "bulk", count: targets.length }),
      }).catch(() => {});
    } catch {
      alert("ZIPの作成に失敗しました");
    } finally {
      setZipping(false);
    }
  }

  // ☆セレクト
  function toggleSelect(seq: number) {
    const key = String(seq).padStart(3, "0");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSubmitted(false);
  }

  async function submitSelection() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/select-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, numbers: Array.from(selected) }),
      });
      if (res.ok) setSubmitted(true);
      else alert("送信に失敗しました");
    } catch {
      alert("送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  // 動画のダウンロード（納品のみ）
  function downloadVideo(v: Video) {
    if (!v.downloadUrl) return;
    const a = document.createElement("a");
    a.href = v.downloadUrl;
    a.download = v.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    fetch("/api/download-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId, kind: "single" }),
    }).catch(() => {});
  }

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

  const isFinal = data.deliveryType === "final";
  const current = lightbox !== null ? data.photos[lightbox] : null;

  // --- ギャラリー画面 ---
  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <div style={S.header}>
          <span style={S.headerLogo}>APOLLO</span>
          <span style={S.badge}>{isFinal ? "納品" : "確認用"}</span>
        </div>

        <h1 style={S.title}>{data.name}</h1>
        {data.shootDate && <p style={S.meta}>撮影日 {data.shootDate}</p>}

        {data.videos && data.videos.length > 0 && (
          <div style={S.videoSection}>
            <p style={S.count}>ムービー · {data.videos.length}本</p>
            {data.videos.map((v) => (
              <div key={v.id} style={S.videoBlock}>
                <video
                  src={v.playUrl}
                  controls
                  preload="metadata"
                  controlsList={isFinal ? undefined : "nodownload"}
                  onContextMenu={(e) => !isFinal && e.preventDefault()}
                  onPlay={onPlay}
                  style={S.video}
                />
                <div style={S.videoMeta}>
                  <span style={S.videoName}>{v.filename}</span>
                  {isFinal && v.downloadUrl ? (
                    <button style={S.videoDl} onClick={() => downloadVideo(v)}>ダウンロード</button>
                  ) : (
                    <span style={S.videoNote}>確認用のためダウンロードできません</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={S.barRow}>
          <p style={S.count}>写真 · {data.photos.length}点</p>
          {isFinal && (
            <button style={S.dlAll} onClick={downloadAll} disabled={zipping}>
              {zipping ? `準備中… ${zipProgress.done}/${zipProgress.total}` : "すべてダウンロード (ZIP)"}
            </button>
          )}
        </div>

        <div style={S.grid}>
          {data.photos.map((p, i) => (
            <div key={p.id} style={S.thumb}>
              {p.url ? (
                <img src={p.url} alt={`写真 ${p.seq}`} style={S.img} loading="lazy"
                  onClick={() => setLightbox(i)} />
              ) : (
                <span style={S.num}>{String(p.seq).padStart(3, "0")}</span>
              )}
              {isFinal && p.downloadUrl && (
                <button style={S.dlOne} onClick={() => downloadOne(p)} aria-label="ダウンロード">↓</button>
              )}
              {!isFinal && data.selectEnabled && (
                <button
                  style={{ ...S.star, ...(selected.has(String(p.seq).padStart(3, "0")) ? S.starOn : {}) }}
                  onClick={() => toggleSelect(p.seq)}
                  aria-label="この写真を選択"
                >★</button>
              )}
              <span style={S.seqTag}>{String(p.seq).padStart(3, "0")}</span>
            </div>
          ))}
        </div>

        {!isFinal && data.selectEnabled && (
          <div style={S.selectBar}>
            <span style={S.selectCount}>★ {selected.size}点を選択中</span>
            <button style={S.selectBtn} onClick={submitSelection} disabled={submitting || selected.size === 0}>
              {submitting ? "送信中…" : submitted ? "送信しました ✓" : "選択をAPOLLOに送る"}
            </button>
          </div>
        )}

        <p style={S.footer}>APOLLO</p>
      </div>

      {/* --- ライトボックス --- */}
      {current && current.url && (
        <div style={S.lb} onClick={close}>
          <button style={{ ...S.lbBtn, ...S.lbClose }} onClick={(e) => { e.stopPropagation(); close(); }} aria-label="閉じる">✕</button>
          <button style={{ ...S.lbBtn, ...S.lbPrev }} onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="前へ">‹</button>
          <img src={current.url} alt={`写真 ${current.seq}`} style={S.lbImg} onClick={(e) => e.stopPropagation()} />
          <button style={{ ...S.lbBtn, ...S.lbNext }} onClick={(e) => { e.stopPropagation(); next(); }} aria-label="次へ">›</button>
          <div style={S.lbBottom}>
            <span style={S.lbCaption}>{lightbox! + 1} / {data.photos.length}</span>
            {isFinal && current.downloadUrl && (
              <button style={S.lbDl} onClick={(e) => { e.stopPropagation(); downloadOne(current); }}>この写真をダウンロード</button>
            )}
          </div>
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
  barRow: { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 14px", flexWrap: "wrap", gap: 10 },
  count: { fontSize: 12, letterSpacing: "0.12em", color: "#999", margin: 0 },
  dlAll: { background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, height: 36, padding: "0 16px", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 },
  thumb: { position: "relative", aspectRatio: "3/2", background: "#f4f4f4", border: "0.5px solid #eee", borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" },
  img: { width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" },
  num: { fontSize: 12, color: "#bbb" },
  dlOne: { position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: 6, background: "rgba(255,255,255,0.9)", border: "0.5px solid #ddd", fontSize: 15, color: "#333", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  footer: { textAlign: "center", fontSize: 11, letterSpacing: "0.2em", color: "#ccc", marginTop: 40 },

  lb: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 },
  lbImg: { maxWidth: "92vw", maxHeight: "84vh", objectFit: "contain", userSelect: "none" },
  lbBtn: { position: "fixed", background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  lbClose: { top: 20, right: 24, width: 44, height: 44, fontSize: 18 },
  lbPrev: { left: 20, top: "50%", transform: "translateY(-50%)", width: 52, height: 52, fontSize: 30 },
  lbNext: { right: 20, top: "50%", transform: "translateY(-50%)", width: 52, height: 52, fontSize: 30 },
  lbBottom: { position: "fixed", bottom: 20, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 },
  lbCaption: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  lbDl: { background: "#fff", color: "#1a1a1a", border: "none", borderRadius: 8, height: 38, padding: "0 18px", fontSize: 13, fontWeight: 500, cursor: "pointer" },

  videoSection: { margin: "0 0 32px" },
  videoBlock: { marginTop: 12 },
  video: { width: "100%", borderRadius: 12, background: "#000", display: "block" },
  videoMeta: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, flexWrap: "wrap" },
  videoName: { fontSize: 14, color: "#333" },
  videoNote: { fontSize: 12, color: "#999" },
  videoDl: { background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, height: 36, padding: "0 16px", fontSize: 13, fontWeight: 500, cursor: "pointer" },

  star: { position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: 999, background: "rgba(255,255,255,0.9)", border: "0.5px solid #ddd", fontSize: 14, color: "#bbb", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 },
  starOn: { background: "#1a1a1a", borderColor: "#1a1a1a", color: "#fff" },
  seqTag: { position: "absolute", bottom: 6, left: 8, fontSize: 11, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.6)", pointerEvents: "none" },
  selectBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 24, padding: "16px 0", borderTop: "0.5px solid #eee", flexWrap: "wrap" },
  selectCount: { fontSize: 13, color: "#555" },
  selectBtn: { background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, height: 40, padding: "0 20px", fontSize: 14, fontWeight: 500, cursor: "pointer" },
};