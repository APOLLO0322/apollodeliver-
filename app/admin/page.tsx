"use client";

import { useState, useEffect, type CSSProperties } from "react";
import Link from "next/link";

type Project = {
  id: string;
  link_id: string;
  name: string;
  shoot_date: string | null;
  delivery_type: "review" | "final";
  select_enabled: boolean;
  expires_at: string | null;
  created_at: string;
  photoCount: number;
  videoCount: number;
};

export default function AdminListPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .finally(() => setLoading(false));
  }, []);

  const base = typeof window !== "undefined" ? window.location.origin : "";

  function fmt(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  function expiryLabel(p: Project) {
    if (!p.expires_at) return "自動削除なし";
    const days = Math.ceil((new Date(p.expires_at).getTime() - Date.now()) / 86400000);
    if (days < 0) return "期限切れ";
    return `あと${days}日で削除`;
  }

  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <div style={S.header}>
          <span style={S.logo}>APOLLO</span>
          <Link href="/admin/new" style={S.newBtn}>＋ 新規納品</Link>
        </div>

        <h1 style={S.h1}>案件一覧</h1>

        {loading ? (
          <p style={S.empty}>読み込み中…</p>
        ) : projects.length === 0 ? (
          <p style={S.empty}>まだ案件がありません</p>
        ) : (
          <div style={S.list}>
            {projects.map((p) => (
              <div key={p.id} style={S.row}>
                <div style={S.rowMain}>
                  <div style={S.rowTop}>
                    <span style={p.delivery_type === "final" ? S.badgeFinal : S.badgeReview}>
                      {p.delivery_type === "final" ? "納品" : "確認用"}
                    </span>
                    <Link href={`/admin/${p.id}`} style={S.name}>{p.name}</Link>
                  </div>
                  <p style={S.meta}>
                    撮影日 {fmt(p.shoot_date)} ・ 写真 {p.photoCount}点 ・ 動画 {p.videoCount}本 ・ {expiryLabel(p)}
                  </p>
                </div>
                <div style={S.rowActions}>
                  <button style={S.ghost} onClick={() => navigator.clipboard.writeText(`${base}/d/${p.link_id}`)}>
                    リンクをコピー
                  </button>
                  <Link href={`/admin/${p.id}`} style={S.detail}>詳細</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#fafafa", padding: "40px 16px 80px" },
  wrap: { maxWidth: 820, margin: "0 auto" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 },
  logo: { fontSize: 18, fontWeight: 500, letterSpacing: "0.3em" },
  newBtn: { background: "#1a1a1a", color: "#fff", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 500, textDecoration: "none" },
  h1: { fontSize: 20, fontWeight: 500, margin: "0 0 20px" },
  empty: { fontSize: 14, color: "#999" },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  row: { background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" },
  rowMain: { flex: 1, minWidth: 240 },
  rowTop: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 },
  badgeReview: { fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 5, border: "0.5px solid #d4d4d4", color: "#666" },
  badgeFinal: { fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 5, background: "#1a1a1a", color: "#fff" },
  name: { fontSize: 15, fontWeight: 500, color: "#1a1a1a", textDecoration: "none" },
  meta: { fontSize: 12, color: "#999", margin: 0 },
  rowActions: { display: "flex", alignItems: "center", gap: 8 },
  ghost: { height: 34, padding: "0 12px", background: "#fff", border: "0.5px solid #d4d4d4", borderRadius: 8, fontSize: 12, color: "#555", cursor: "pointer", whiteSpace: "nowrap" },
  detail: { height: 34, padding: "0 12px", display: "inline-flex", alignItems: "center", background: "#f4f4f4", borderRadius: 8, fontSize: 12, color: "#333", textDecoration: "none", whiteSpace: "nowrap" },
};