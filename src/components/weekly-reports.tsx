"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowRight,Download,RefreshCw} from "lucide-react";
import type {Member} from "@/lib/domain";
import {supabase} from "@/lib/supabase";
import {reportPeriod} from "@/lib/report-period";
import {browserDraftStore,readSelection,readDraft,saveSelection,saveDraft,type Selection,type Draft} from "@/lib/weekly-report-draft";
import {loadWeeklySource,makeWeeklyReport,brandName,brandLogo,platforms,weeklyTotals,weeklySeo,formatSeoDuration,weeklyCampaigns,allocationValues,emptyAllocation,type Brand,type WeeklySource,type WeeklyPayload,type WeeklyDepartment} from "@/lib/weekly-report";
import {buildWeeklyWorkbook} from "@/lib/seo-monthly-export";
import {reportGroups,reportWord,type ReportLanguage} from "@/lib/weekly-report-language";
import {readableError} from "@/lib/workspace-quality";
import {showToast} from "@/lib/toasts";
import {confirmInCurrentLanguage} from "./app-language-provider";
function printReport(report:WeeklyPayload,lang:ReportLanguage){
 const ar=lang==="ar";
 const win=window.open("","_blank");if(!win){showToast("اسمح بفتح النوافذ للتقرير ثم حاول تاني.","error");return;}
 win.opener=null;const doc=win.document;doc.open();doc.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Weekly Marketing Team Report</title><style>@page{size:A4;margin:14mm}body{font:11px Arial,sans-serif;color:#253a55}header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #f3b820;padding-bottom:14px}header img{width:130px;max-height:70px;object-fit:contain}h1{font-size:22px;margin:0 0 8px}h2{font-size:15px;margin:22px 0 8px;break-after:avoid}h3{font-size:12px;margin:14px 0 6px;break-after:avoid}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #dfe6ee;padding:6px;text-align:start;overflow-wrap:anywhere;white-space:pre-wrap;vertical-align:top}th{background:#253a55;color:white}thead{display:table-header-group}tr{break-inside:auto}footer{border-top:1px solid #dfe6ee;margin-top:24px;padding:12px 0}button{margin:12px 0;padding:8px 15px}@media print{button{display:none}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body></body></html>');doc.close();doc.documentElement.lang=lang;doc.documentElement.dir=ar?"rtl":"ltr";doc.body.style.direction=ar?"rtl":"ltr";
 const header=doc.createElement("header"),text=doc.createElement("div"),title=doc.createElement("h1"),date=doc.createElement("div"),img=doc.createElement("img");title.textContent=ar?"التقرير الأسبوعي لفريق التسويق":"Weekly Marketing Team Report";date.textContent=brandName(report.brand)+" | "+report.first+" — "+report.last;img.src=new URL(brandLogo(report.brand),window.location.origin).href;img.alt=brandName(report.brand);text.append(title,date);header.append(text,img);doc.body.append(header);
 const button=doc.createElement("button");button.textContent=ar?"حفظ PDF / طباعة":"Save PDF / Print";button.onclick=()=>win.print();doc.body.append(button);
 for(const group of reportGroups(report,lang)){const heading=doc.createElement("h2");heading.textContent=group.title;doc.body.append(heading);for(const section of group.sections){if(section.title){const h=doc.createElement("h3");h.textContent=section.title;doc.body.append(h);}const table=doc.createElement("table");const tr=table.createTHead().insertRow();for(const cell of section.headers){const th=doc.createElement("th");th.textContent=cell;tr.append(th);}const body=table.createTBody();for(const row of section.rows.length?section.rows:[[ar?"لا توجد بيانات مسجلة":"No recorded data"]]){const tr=body.insertRow();for(const cell of row)tr.insertCell().textContent=String(cell);}doc.body.append(table);}}
 const footer=doc.createElement("footer");footer.textContent=(report.notes?report.notes+"\n\n":"")+(ar?"إعداد: ناردين جمال | مديرة التسويق":"Prepared by: Nardine Gamal | Marketing Manager");footer.style.whiteSpace="pre-wrap";doc.body.append(footer);
 button.disabled=true;const ready=()=>{button.disabled=false;win.focus();};if(img.complete&&img.naturalWidth)ready();else {img.onload=ready;img.onerror=()=>{button.textContent=ar?"تعذر تحميل اللوجو":"Logo unavailable";};}
}
async function excel(report:WeeklyPayload){const response=await fetch(brandLogo(report.brand));if(!response.ok)throw Error("Logo unavailable");const logo=new Uint8Array(await response.arrayBuffer());const bytes=buildWeeklyWorkbook(report,logo);const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));const a=document.createElement("a");a.href=url;a.download=brandName(report.brand)+"-Marketing-"+report.first+"-to-"+report.last+".xlsx";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export default function WeeklyReports({member,onBack}:{member:Member;onBack:()=>void}){
 const [editor,setEditor]=useState(()=>{const store=browserDraftStore(),selection=readSelection(store,member.id);return {selection,draft:readDraft(store,member.id,selection)};});
 const latest=useRef(editor);
 const [storageError,setStorageError]=useState(false);
 const {brand,first,last,department,lang}=editor.selection;
 const {posts,whatsapp,notes,allocations,selected}=editor.draft;
 const [source,setSource]=useState<WeeklySource|null>(null),[saved,setSaved]=useState<{id:string;payload:WeeklyPayload}|null>(null),[busy,setBusy]=useState(false),[err,setErr]=useState(""),[archive,setArchive]=useState<{id:string;payload:WeeklyPayload;created_at:string}[]>([]),[preview,setPreview]=useState(false);
 // Persist synchronously in input handlers, not a delayed effect that can lose the final keystroke on refresh.
 function updateDraft<K extends keyof Draft>(key:K,value:Draft[K]|((old:Draft[K])=>Draft[K])){
  const old=latest.current;
  const next={...old,draft:{...old.draft,[key]:typeof value==="function"?(value as (old:Draft[K])=>Draft[K])(old.draft[key]):value}};
  latest.current=next;setEditor(next);
  const store=browserDraftStore();
  const draftOk=saveDraft(store,member.id,next.selection,next.draft),selectionOk=saveSelection(store,member.id,next.selection);
  setStorageError(!draftOk||!selectionOk);
 }
 function updateSelection(patch:Partial<Selection>){
  const old=latest.current,selection={...old.selection,...patch},store=browserDraftStore();
  const changedScope=old.selection.brand!==selection.brand||old.selection.first!==selection.first||old.selection.last!==selection.last;
  const next={selection,draft:changedScope?readDraft(store,member.id,selection):old.draft};
  latest.current=next;setEditor(next);
  setStorageError(!saveSelection(store,member.id,selection));
  if(changedScope){setSaved(null);setPreview(false);}
 }
 const setBrand=(brand:Brand)=>updateSelection({brand}),setFirst=(first:string)=>updateSelection({first}),setLast=(last:string)=>updateSelection({last}),setDepartment=(department:WeeklyDepartment)=>updateSelection({department}),setLang=(lang:ReportLanguage)=>updateSelection({lang});
 const setPosts=(v:Draft["posts"]|((old:Draft["posts"])=>Draft["posts"]))=>updateDraft("posts",v);
 const setWhatsapp=(v:string)=>updateDraft("whatsapp",v),setNotes=(v:string)=>updateDraft("notes",v);
 const setAllocations=(v:(old:Draft["allocations"])=>Draft["allocations"])=>updateDraft("allocations",v);
 const setSelected=(v:Draft["selected"]|((old:Draft["selected"])=>Draft["selected"]))=>updateDraft("selected",v);

 const lock=useRef(false);
 async function reload(){const [s,a]=await Promise.all([loadWeeklySource(),supabase.from("stc_weekly_report_snapshots").select("id,payload,created_at").order("created_at",{ascending:false}).limit(100)]);if(a.error)throw a.error;setSource(s);setArchive(a.data as typeof archive);}
 useEffect(()=>{void reload().catch(e=>setErr(readableError(e)));},[]);
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setErr("");try{await fn();}catch(e){setErr(readableError(e));}finally{lock.current=false;setBusy(false);}}
 const period=(()=>{try{return reportPeriod(first,last);}catch{return null;}})();
 const data=source&&period?weeklyTotals(source,brand,period):null;
 const seo=source&&period?weeklySeo(source,brand,period):[];
 const campaigns=source&&period?weeklyCampaigns(source,brand,period):[];
 const valid=!!source&&!!period&&(data?.rows||[]).every(r=>allocationValues(r.total,allocations[r.key]).valid)&&[...Object.values(posts),whatsapp].every(v=>v===""||(Number.isSafeInteger(Number(v))&&Number(v)>=0));
 const active=valid&&source&&period?makeWeeklyReport(source,brand,period,posts,whatsapp,notes,department,allocations,selected):null;
 const combined=valid&&source&&period?makeWeeklyReport(source,brand,period,posts,whatsapp,notes,"all",allocations,selected):null;
 const report=saved?.payload??active;
 const showContent=department==="all"||department==="content",showSeo=department==="all"||department==="seo",showMedia=department==="all"||department==="media";
 const changeAllocation=(key:string,field:keyof typeof emptyAllocation,value:string)=>setAllocations(old=>({...old,[key]:{...(old[key]||emptyAllocation),[field]:value}}));
 function archiveReport(payload:WeeklyPayload){void run(async()=>{const r=await supabase.from("stc_weekly_report_snapshots").insert({brand:payload.brand,period_start:payload.first,period_end:payload.last,payload,created_by:member.id});if(r.error)throw r.error;await reload();showToast("تم حفظ التقرير في الأرشيف.","success");});}
 async function removeArchive(id:string){if(!(await confirmInCurrentLanguage("حذف التقرير المحفوظ من الأرشيف فقط؟ بيانات التاسكات الأصلية لن تتغير.")))return;void run(async()=>{const r=await supabase.from("stc_weekly_report_snapshots").delete().eq("id",id).select("id");if(r.error)throw r.error;if(!r.data?.length)throw Error("Report not found");if(saved?.id===id)setSaved(null);await reload();showToast("تم حذف التقرير.","success");});}
 return <div className="easy-shell" dir="rtl"><header className="easy-header"><div className="wr-brand"><img src={brandLogo(brand)} alt={brandName(brand)}/><strong>تقارير الماركتنج الرسمية</strong></div><button className="easy-btn easy-btn--light" onClick={onBack}><ArrowRight size={18}/> رجوع للتيم</button></header><main className="easy-content wr-page">
 <section className="wr-panel"><h1>التقرير الأسبوعي</h1><div className="wr-fields"><label>الشركة<select value={brand} onChange={e=>{setBrand(e.target.value as Brand);}}><option value="stc">STC</option><option value="ichem">iChem</option></select></label><label>من تاريخ<input type="date" value={first} onChange={e=>{setFirst(e.target.value);}}/></label><label>إلى تاريخ<input type="date" value={last} min={first} onChange={e=>{setLast(e.target.value);}}/></label></div><div className="wr-tabs">{([["content","المحتوى والتصميم"],["seo","SEO والمواقع"],["media","الإعلانات"],["all","كل الأقسام"]] as const).map(([key,label])=><button type="button" key={key} aria-pressed={department===key} onClick={()=>{setDepartment(key);setSaved(null);setPreview(false);}}>{label}</button>)}</div><div className="stc-report-actions"><button className="easy-link-btn" disabled={busy} onClick={()=>void run(reload)}><RefreshCw size={16}/> تحديث البيانات</button><span className="wr-meta">البيانات بتتسحب تلقائيًا من السيستم.</span>{!storageError&&<span className="wr-meta">المسودة بتتحفظ تلقائيًا على الجهاز.</span>}</div></section>
 {err&&<p role="alert" className="easy-error">{err}</p>}
 {storageError&&<p role="alert" className="wr-warning">تعذر حفظ المسودة على الجهاز. متقفليش الصفحة قبل حفظ التقرير.</p>}
 {!source&&<p>جاري تحميل التقرير…</p>}{!period&&<p role="alert">اختار فترة صحيحة.</p>}
 {!saved&&source&&period&&<>
 {showContent&&<section className="wr-panel"><h2>إنجازات المحتوى والتصميم</h2><p>إجمالي المخرجات المعتمدة خلال الفترة. وزعي العدد حسب الاستخدام.</p>
 {!!((data?.missing||0)+(data?.unknown||0))&&<p className="wr-warning">بعض التاسكات القديمة ناقصها الشركة أو النوع أو العدد؛ مش داخلة في الإجماليات. <b>{(data?.missing||0)+(data?.unknown||0)}</b></p>}
 {!data?.rows.length?<p>لا توجد أعمال معتمدة ومصنفة في الفترة.</p>:<div className="wr-table"><table className="wr-alloc"><thead><tr><th>نوع الشغل</th><th>إجمالي المنفذ</th><th>تم النشر أو الاستخدام</th><th>الأسبوع القادم</th><th>غير مستخدم</th><th>لم يحدد بعد</th></tr></thead><tbody>{data.rows.map(r=>{const v=allocations[r.key]||emptyAllocation,a=allocationValues(r.total,v);return <tr key={r.key}><td>{reportWord(r.label,"ar")}</td><td><b>{r.total}</b></td>{(["published","next","unused"] as const).map((key,i)=><td key={key}><input type="number" min={0} max={r.total} step={1} inputMode="numeric" aria-label={["تم النشر أو الاستخدام","الأسبوع القادم","غير مستخدم"][i]} placeholder="0" value={v[key]} onChange={e=>changeAllocation(r.key,key,e.target.value)}/></td>)}<td>{a.valid?a.remaining:<span className="wr-error">العدد أكبر من الإجمالي أو غير صحيح</span>}</td></tr>;})}</tbody></table></div>}
 <details className="wr-compact"><summary>أعداد المنشورات على المنصات (اختياري)</summary><div className="wr-fields">{platforms.map(p=><label key={p}>{p}<input type="number" min={0} step={1} placeholder="—" value={posts[p]||""} onChange={e=>setPosts(old=>({...old,[p]:e.target.value}))}/></label>)}</div></details></section>}
 {showSeo&&<section className="wr-panel"><h2>إنجازات SEO خلال الأسبوع</h2><p>الأعمال المسجلة في التقرير اليومي خلال الفترة المختارة.</p>{seo.length?<><div className="wr-table"><table><thead><tr><th>التاريخ</th><th>الأعمال المنفذة</th><th>ساعات العمل (ساعة:دقيقة)</th></tr></thead><tbody>{seo.map(r=><tr key={r.date}><td>{r.date}</td><td data-no-translate style={{whiteSpace:"pre-wrap"}}>{r.activities.join("\n")}</td><td><b>{formatSeoDuration(r.minutes)}</b></td></tr>)}</tbody></table></div><p><strong>إجمالي ساعات الفترة: </strong><b>{formatSeoDuration(seo.reduce((sum,r)=>sum+r.minutes,0))}</b></p></>:<p>لا توجد أعمال مسجلة في التقرير اليومي خلال الفترة.</p>}</section>}
 {showMedia&&<section className="wr-panel"><h2>الحملات الإعلانية</h2><p>اختاري الحملات المطلوب إضافتها للتقرير.</p>{campaigns.length?<><div className="stc-report-actions"><button className="easy-link-btn" onClick={()=>setSelected(campaigns.map(c=>c.brief.id))}>اختيار الكل</button><button className="easy-link-btn" onClick={()=>setSelected([])}>إلغاء الاختيار</button><span>{selected.filter(id=>campaigns.some(c=>c.brief.id===id)).length} / {campaigns.length}</span></div>{campaigns.map(({brief:b,result:r})=><label className="wr-campaign" key={b.id}><input type="checkbox" checked={selected.includes(b.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,b.id]:old.filter(id=>id!==b.id))}/><span><strong data-no-translate>{r?.campaign_goal||b.post_url}</strong><small data-no-translate>{r?.results||"—"}{r?.daily_budget!=null?" · "+r.daily_budget+" "+(r.currency||""):""}</small></span></label>)}</>:<p>لا توجد حملات مسجلة في الفترة.</p>}<label>رسائل واتساب (اختياري)<input type="number" min={0} step={1} value={whatsapp} onChange={e=>setWhatsapp(e.target.value)}/></label></section>}
 </>}
 <section className="wr-panel"><div className="wr-report-head"><h2>تصدير التقرير</h2><label>لغة التقرير<select value={lang} onChange={e=>setLang(e.target.value as ReportLanguage)}><option value="ar" data-no-translate>العربية</option><option value="en" data-no-translate>English</option></select></label></div>
 {!saved&&<label>ملاحظات التقرير (اختياري)<textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label>}
 <div className="stc-report-actions"><button className="easy-btn easy-btn--light" disabled={!report} onClick={()=>setPreview(v=>!v)}>{preview?"إخفاء المعاينة":"معاينة التقرير"}</button><button className="easy-btn easy-btn--navy" disabled={busy||!report} onClick={()=>report&&printReport(report,lang)}><Download size={16}/> PDF</button><button className="easy-btn easy-btn--light" disabled={busy||!report} onClick={()=>report&&void run(()=>excel(report))}>Excel</button>{!saved&&<button className="easy-btn easy-btn--light" disabled={busy||!report} onClick={()=>report&&archiveReport(report)}>حفظ التقرير في الأرشيف</button>}{saved&&<button className="easy-btn easy-btn--light" onClick={()=>{setSaved(null);setPreview(false);}}>رجوع للتقرير الحالي</button>}</div>
 {!saved&&department!=="all"&&<button className="easy-link-btn" disabled={!combined||busy} onClick={()=>{setDepartment("all");setPreview(true);}}>تجهيز التقرير المجمع لكل الأقسام</button>}
 {preview&&report&&<div data-no-translate dir={lang==="ar"?"rtl":"ltr"}><div className="wr-brand"><img src={brandLogo(report.brand)} alt={brandName(report.brand)}/><h3>{report.first} — {report.last}</h3></div>{reportGroups(report,lang).map(g=><div key={g.title}><h3>{g.title}</h3>{g.sections.map((s,k)=><div key={k}>{s.title&&<h4>{s.title}</h4>}<div className="wr-table"><table><thead><tr>{s.headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{s.rows.map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table>{!s.rows.length&&<p>{lang==="ar"?"لا توجد بيانات مسجلة":"No recorded data"}</p>}</div></div>)}</div>)}</div>}</section>
 <details className="wr-panel wr-compact"><summary>أرشيف التقارير الرسمية</summary>{archive.filter(a=>a.payload.brand===brand).map(a=><div className="wr-archive" key={a.id}><span>{a.payload.first} — {a.payload.last}</span><div className="stc-report-actions">{a.payload.formatVersion===2&&<button className="easy-btn easy-btn--light" onClick={()=>{setSaved(a);setPreview(true);}}>عرض التقرير</button>}{a.payload.formatVersion!==2&&<small>نسخة قديمة</small>}<button className="easy-link-btn easy-danger" disabled={busy} onClick={()=>void removeArchive(a.id)}>حذف التقرير</button></div></div>)}</details>
 </main></div>;
}
