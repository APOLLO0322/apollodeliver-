"use client";

import { useState, useRef, type CSSProperties } from "react";

type Created = { id: string; url: string; password: string; linkId: string };
type UploadState = "idle" | "uploading" | "done";

export default function NewDeliveryPage() {
  const [name, setName] = useState("");
  const [shootDate, setShootDate] = useState("");
  const [deliveryType, setDeliveryType] = useState<"review" | "final">("review");
  const [selectEnabled, setSelectEnabled] = useState(false);
  const [deleteAfterDays, setDeleteAfterDays] = useState(30);

  const [creating, setCreating] = useState(false);
  const [project, setProject] = useState<Created | null>(null);

  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadedCount, setUploadedCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // 1. 案件を作成 → project が返ってきたらドロップゾーンが出る
  async function createProject() {
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, shootDate: shootDate || null, deliveryType, selectEnabled, deleteAfterDays }),
      });
      const data = await res.json();
      if (res.ok) setProject(data);
      else alert(data.error ?? "作成に失敗しました");
    } finally {
      setCreating(false);
    }
  }

  // 2. 写真をアップロード
  async function uploadFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !project) return;
    const photos = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (photos.length === 0) {
      alert("写真ファイルを入れてください（動画は次のステップで対応します）");
      return;
    }
    setUploadState("uploading");
    const form = new FormData();
    form.append("projectId", project.id);
    photos.forEach((f) => form.append("files", f));

    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) {
        setUploadedCount((c) => c + data.uploaded);
        setUploadState("done");
      } else {
        alert(data.error ?? "アップロードに失敗しました");
        setUploadState("idle");
      }
    } catch {
      alert("アップロード中にエラーが発生しました");
      setUploadState("idle");
    }
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? (typeof window !== "undefined" ? window.location.origin : "");
  const fullUrl = project ? `${base}${project.url}` : "";

  return (
    <main style={S.page}>
      <div style={S.card}>
        <h1 style={S.h1}>新規納品を作成</h1>

        {/* 設定フォーム（案件作成後はロック） */}
        <label style={S.label}>案件名</label>
        <input style={S.input} value={name} disabled={!!project}
          onChange={(e) => setName(e.target.value)} placeholder="cafe LOTUS 秋メニュー撮影" />

        <div style={S.row}>
          <div>
            <label style={S.label}>撮影日</label>
            <input style={{ ...S.input, width: 150 }} type="date" value={shootDate} disabled={!!project}
              onChange={(e) => setShootDate(e.target.value)} />
          </div>
          <div>
            <label style={S.label}>種別</label>
            <div style={S.seg}>
              <button style={deliveryType === "review" ? S.segOn : S.segOff} disabled={!!project}
                onClick={() => setDeliveryType("review")}>確認用</button>
              <button style={deliveryType === "final" ? S.segOn : S.segOff} disabled={!!project}
                onClick={() => setDeliveryType("final")}>納品</button>
            </div>
          </div>
          <div>
            <label style={S.label}>自動削除</label>
            <select style={{ ...S.input, width: 120 }} value={deleteAfterDays} disabled={!!project}
              onChange={(e) => setDeleteAfterDays(Number(e.target.value))}>
              <option value={30}>30日後</option>
              <option value={14}>14日後</option>
              <option value={7}>7日後</option>
              <option value={0}>なし</option>
            </select>
          </div>
        </div>

        {deliveryType === "review" && !project && (
          <label style={S.check}>
            <input type="checkbox" checked={selectEnabled}
              onChange={(e) => setSelectEnabled(e.target.checked)} />
            写真のセレクト機能（☆）を使う
          </label>
        )}

        {/* 案件作成前：作成ボタン */}
        {!project && (
          <button style={S.primary} onClick={createProject} disabled={creating || !name}>
            {creating ? "作成中…" : "案件を作成"}
          </button>
        )}

        {/* 案件作成後：ドロップゾーン */}
        {project && (
          <>
            <div
              style={{ ...S.drop, ...(dragOver ? S.dropOver : {}) }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
              onClick={() => fileInput.current?.click()}
            >
              <input ref={fileInput} type="file" accept="image/*" multiple hidden
                onChange={(e) => uploadFiles(e.target.files)} />
              {uploadState === "uploading" ? (
                <p style={S.dropText}>アップロード中…（軽量版を生成しています）</p>
              ) : (
                <>
                  <p style={S.dropText}>写真をここにドラッグ、またはクリックして選択</p>
                  <p style={S.dropSub}>原本を保存し、確認用の軽量版を自動生成します</p>
                </>
              )}
            </div>

            {uploadedCount > 0 && (
              <p style={S.uploaded}>✓ {uploadedCount}枚の写真をアップロード済み</p>
            )}

            {/* 共有リンク */}
            <div style={S.result}>
              <p style={S.resultLabel}>共有リンク</p>
              <div style={S.resultRow}>
                <input style={S.mono} readOnly value={fullUrl} />
                <button style={S.ghost} onClick={() => navigator.clipboard.writeText(fullUrl)}>コピー</button>
              </div>
              <div style={S.resultRow}>
                <input style={S.mono} readOnly value={`パスワード ${project.password}`} />
                <button style={S.ghost} onClick={() => navigator.clipboard.writeText(project.password)}>コピー</button>
              </div>
              <p style={S.hint}>パスワードはこの画面でしか確認できません。控えてからクライアントに渡してください。</p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#fafafa", padding: "48px 16px", display: "flex", justifyContent: "center" },
  card: { width: "100%", maxWidth: 560, background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "32px 28px" },
  h1: { fontSize: 20, fontWeight: 500, margin: "0 0 24px", letterSpacing: "0.02em" },
  label: { display: "block", fontSize: 13, color: "#888", margin: "0 0 6px" },
  input: { width: "100%", height: 38, border: "0.5px solid #e5e5e5", borderRadius: 8, padding: "0 12px", fontSize: 14, boxSizing: "border-box", marginBottom: 16, background: "#fff" },
  row: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" },
  seg: { display: "inline-flex", border: "0.5px solid #e5e5e5", borderRadius: 8, overflow: "hidden", marginBottom: 16 },
  segOn: { border: "none", background: "#1a1a1a", color: "#fff", fontSize: 13, fontWeight: 500, padding: "0 16px", height: 38, cursor: "pointer" },
  segOff: { border: "none", background: "#fff", color: "#666", fontSize: 13, padding: "0 16px", height: 38, cursor: "pointer" },
  check: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#555", margin: "0 0 20px" },
  primary: { width: "100%", height: 44, background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer" },
  drop: { border: "1.5px dashed #d4d4d4", borderRadius: 12, background: "#fafafa", padding: "28px", textAlign: "center", cursor: "pointer", marginTop: 8 },
  dropOver: { borderColor: "#1a1a1a", background: "#f0f0f0" },
  dropText: { fontSize: 14, color: "#333", margin: 0 },
  dropSub: { fontSize: 12, color: "#999", margin: "6px 0 0" },
  uploaded: { fontSize: 13, color: "#555", margin: "12px 0 0" },
  result: { marginTop: 24, padding: 16, background: "#fafafa", border: "0.5px solid #e5e5e5", borderRadius: 12 },
  resultLabel: { fontSize: 12, letterSpacing: "0.1em", color: "#888", margin: "0 0 10px" },
  resultRow: { display: "flex", gap: 8, marginBottom: 8 },
  mono: { flex: 1, height: 38, border: "0.5px solid #e5e5e5", borderRadius: 8, padding: "0 12px", fontSize: 13, fontFamily: mono, background: "#fff", boxSizing: "border-box" },
  ghost: { height: 38, padding: "0 14px", background: "#fff", border: "0.5px solid #d4d4d4", borderRadius: 8, fontSize: 13, color: "#555", cursor: "pointer", whiteSpace: "nowrap" },
  hint: { fontSize: 12, color: "#999", margin: "8px 0 0", lineHeight: 1.6 },
};
