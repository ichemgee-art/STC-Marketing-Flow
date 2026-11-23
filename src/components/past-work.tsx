"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, CalendarDays, CheckCircle2, Search, UserRound, ExternalLink, FileText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { safeUrl, type ArchiveRow, type Member } from "@/lib/domain";
import type { Lang } from "@/lib/i18n";

const memory = new Map<string, { rows: ArchiveRow[]; timestamp: number }>();
function cell(r: ArchiveRow, col: string): string {
  const entry = Object.entries(r.cells).find(([address]) => new RegExp("^" + col + r.row_number + "$").test(address));
  const val = entry?.[1]?.value;
  return typeof val === "string" || typeof val === "number" ? String(val) : "";
}
function statusOf(r: ArchiveRow): "done" | "ongoing" | "unknown" {
  const raw = String(r.mapped.source_status || "").trim().toLowerCase();
  if (["done", "completed", "finished", "complete", "approved", "تم", "منتهي"].includes(raw)) return "done";
  if (["in progress", "in_progress", "working", "pending", "prd", "todo", "to do", "review"].includes(raw)) return "ongoing";
  return "unknown";
}
function details(r: ArchiveRow): string[] {
  if (r.sheet === "Fatma") return [cell(r, "B"), cell(r, "D"), cell(r, "E"), cell(r, "H")].filter(Boolean);
  if (r.sheet === "Fatma2") return [cell(r, "C"), cell(r, "E")].filter(Boolean);
  return [cell(r, "D"),cell(r,"E")].filter(Boolean).filter(s=>s.toLowerCase() !== String(r.mapped.source_status||"").toLowerCase());
}
function dateText(r: ArchiveRow): string {
  return String(r.mapped.date || r.mapped.source_date || "—");
}
export default function PastWork({ userId, lang, member }: { userId: string; lang: Lang; member: Member }) {
  const t=(en:string,ar:string)=>lang==="ar"?ar:en;
  const key="stc-past-filters:"+userId;
  const [rows,setRows]=useState<ArchiveRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [sheet,setSheet]=useState("all");
  const [status,setStatus]=useState("all");
  const [selected,setSelected]=useState<ArchiveRow|null>(null);
  const [owner,setOwner]=useState("all");
  useEffect(()=>{
    try{
      const saved=JSON.parse(sessionStorage.getItem(key)||"{}");
      if(typeof saved.search==="string")setSearch(saved.search);
      if(typeof saved.sheet==="string")setSheet(saved.sheet);
      if(typeof saved.status==="string")setStatus(saved.status);
      if(typeof saved.owner==="string")setOwner(saved.owner);
    }catch{}
  },[key]);
  useEffect(()=>{
    try{sessionStorage.setItem(key,JSON.stringify({search,sheet,status,owner}));}catch{}
  },[key,search,sheet,status,owner]);
  const load=useCallback(async()=>{
    const cached=memory.get(userId);
    if(cached && Date.now()-cached.timestamp < 120000){
      setRows(cached.rows);setLoading(false);
    }
    setError("");
    const all:ArchiveRow[]=[];
    for(let start=0;;start+=1000){
      const r=await supabase.from("stc_archive_rows").select("*").order("sheet").order("row_number").range(start,start+999);
      if(r.error){setError(r.error.message);setLoading(false);return;}
      all.push(...r.data as ArchiveRow[]);
      if(r.data.length<1000)break;
    }
    setRows(all);setLoading(false);memory.set(userId,{rows:all,timestamp:Date.now()});
  },[userId]);
  useEffect(()=>{void load()},[load]);
  const sheets=useMemo(()=>Array.from(new Set(rows.map(r=>r.sheet))),[rows]);
  const owners=useMemo(()=>Array.from(new Set(rows.map(r=>String(r.mapped.owner_label||"").trim()).filter(Boolean))),[rows]);
  const visible=useMemo(()=>rows.filter(r=>{
    const x=(String(r.mapped.title||"")+" "+details(r).join(" ")).toLowerCase();
    return (sheet==="all"||r.sheet===sheet) && (status==="all"||statusOf(r)===status) &&
    (owner==="all"||String(r.mapped.owner_label||"")===owner) && x.includes(search.trim().toLowerCase());
  }),[rows,sheet,status,owner,search]);
  const done=rows.filter(r=>statusOf(r)==="done").length;
  return <section className="past-work">
    <div className="past-heading">
      <div>
        <span className="task-eyebrow">{t("PRESERVED FROM YOUR ORIGINAL WORKBOOK","محفوظ من الإكسيل الأصلي")}</span>
        <h2><Archive size={24}/>{member.role==="manager"?t("Team work history","سجل شغل الفريق السابق"):t("My previous work","شغلي السابق")}</h2>
        <p>{t("These records preserve original dates, statuses and notes; they are not newly approved tasks.","كل السجلات بتواريخها وحالاتها وملاحظاتها الأصلية، ومش محسوبة كمهام تم اعتمادها في السيستم الجديد.")}</p>
      </div>
      <div className="past-count"><strong>{rows.length}</strong><span>{t("Past records","سجل قديم")}</span></div>
    </div>
    <div className="past-summary"><span><FileText size={17}/>{t("Archived records","سجلات محفوظة")}: <b>{rows.length}</b></span><span><CheckCircle2 size={17}/>{t("Marked Done in source","مكتوب عليها Done في الإكسيل")}: <b>{done}</b></span></div>
    <div className="past-controls">
      <label className="past-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("Search past work","ابحث في شغلك القديم")}/></label>
      <select value={sheet} onChange={e=>setSheet(e.target.value)} aria-label={t("Source sheet","الشيت الأصلي")}><option value="all">{t("All sheets","كل المصادر")}</option>{sheets.map(s=><option key={s}>{s}</option>)}</select>
      {member.role==="manager"&&<select value={owner} onChange={e=>setOwner(e.target.value)} aria-label={t("Owner","المسؤول")}><option value="all">{t("All team","كل الفريق")}</option>{owners.map(s=><option key={s}>{s}</option>)}</select>}
      <select value={status} onChange={e=>setStatus(e.target.value)} aria-label={t("Original status","الحالة القديمة")}><option value="all">{t("All statuses","كل الحالات")}</option><option value="done">{t("Done in source","منتهية سابقًا")}</option><option value="ongoing">{t("Unfinished in source","غير مكتملة سابقًا")}</option><option value="unknown">{t("Unspecified in source","الحالة غير محددة")}</option></select>
    </div>
    {error&&<p className="error" role="alert">{error}<button onClick={()=>void load()}>{t("Retry","حاول تاني")}</button></p>}
    {loading&&rows.length===0&&<p className="muted">{t("Loading preserved history…","جاري تحميل السجل القديم…")}</p>}
    {!loading&&visible.length===0&&<div className="task-empty-state"><h3>{t("No matching past work","مفيش نتائج مطابقة")}</h3><p>{t("Change your filters or search words.","جرّب تغير البحث أو الفلاتر.")}</p></div>}
    <div className="past-grid">{visible.map(r=><button className="past-card" key={r.id} onClick={()=>setSelected(r)} type="button">
      <div className="past-card-head"><span className={"past-status "+statusOf(r)}>{statusOf(r)==="done"?t("Done previously","منتهية سابقًا"):statusOf(r)==="ongoing"?t("Old work in progress","حالة قديمة غير مكتملة"):t("Original status unspecified","الحالة غير محددة")}</span><span className="past-source">{r.sheet} · #{r.row_number}</span></div>
      <h3>{String(r.mapped.title||t("Original entry","سجل من الإكسيل")).trim()||t("Original entry","سجل من الإكسيل")}</h3>
      <p className="past-card-summary">{details(r)[0]||t("Open for original details","افتح البطاقة لعرض التفاصيل الأصلية")}</p>
      <div className="past-card-meta"><span><UserRound size={15}/>{String(r.mapped.owner_label||t("Unspecified","غير محدد"))}</span><span><CalendarDays size={15}/>{dateText(r)}</span></div>
    </button>)}</div>
    {selected&&<div className="modal-backdrop" onClick={()=>setSelected(null)}><section className="modal detail" role="dialog" aria-modal="true" aria-label={t("Historical record details","تفاصيل السجل القديم")} onClick={e=>e.stopPropagation()}>
      <div className="section-title"><span className="status-pill">{t("Read-only history","سجل قديم للعرض فقط")}</span><button onClick={()=>setSelected(null)} aria-label={t("Close","إغلاق")}>×</button></div>
      <h2>{String(selected.mapped.title||t("Original record","سجل أصلي"))}</h2>
      <div className="past-card-meta"><span><UserRound size={15}/>{String(selected.mapped.owner_label||"—")}</span><span><CalendarDays size={15}/>{dateText(selected)}</span></div>
      <p className="muted">{t("Original status","الحالة الأصلية")}: <b>{String(selected.mapped.source_status||"—")}</b> · {selected.sheet} #{selected.row_number}</p>
      <div className="past-original-cells">
        {Object.entries(selected.cells).map(([address,c])=><div key={address} className="past-source-cell">
          <strong>{address}</strong><p dir="auto">{String(c.value??"")}</p>
          {safeUrl(c.value)&&<a href={safeUrl(c.value)!} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/>{t("Open reference","فتح المرجع")}</a>}
          {c.comment&&<p className="muted">{t("Original comment","التعليق الأصلي")}: {JSON.stringify(c.comment)}</p>}
          {c.hyperlink&&<p className="muted">{t("Original link","الرابط الأصلي")}: {JSON.stringify(c.hyperlink)}</p>}
        </div>)}
      </div>
      <p className="muted">{t("The original source is unchanged. This record is not a new task.","كل البيانات الأصلية محفوظة بدون تغيير، والسجل ده مش مهمة جديدة.")}</p>
    </section></div>}
  </section>;
}
