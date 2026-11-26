"use client";
import {useEffect,useRef,useState} from "react";
import {Download,FileSpreadsheet,FileText} from "lucide-react";
import {contentSummary} from "@/lib/content-report";
import type {Member} from "@/lib/domain";
import {buildDepartmentWorkbook,buildSeoMonthlyWorkbook, type DepartmentSheet} from "@/lib/seo-monthly-export";
import {monthlyReport,loadSeoDaily,type Department,type ReportPerson} from "@/lib/monthly-report-data";
import {showToast} from "@/lib/toasts";
import {readableError} from "@/lib/workspace-quality";
import {companyReportPeriod,companyReportMonth,companyMonthRange,companyMonthKey,cairoDate} from "@/lib/report-period";
const today=()=>cairoDate(new Date().toISOString());
const currentMonth=()=>companyMonthKey(today());
function printable(win:Window,reports:DepartmentSheet[],periodLabel:string){
 if(reports.every(r=>r.kind==="content")){printContent(win,reports,periodLabel);return;}
 const doc=win.document;doc.open();doc.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>STC Monthly report</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,Tahoma,sans-serif;color:#253a55;direction:rtl;margin:0;font-size:12px}h1{font-size:20px;border-bottom:3px solid #f3b820;padding:10px 0}h2{font-size:16px}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#253a55;color:white}td,th{border:1px solid #dfe6ee;padding:7px;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap;text-align:right}th:nth-child(4){width:36%}th:nth-child(3){width:19%}tr{break-inside:auto}thead{display:table-header-group}section+section{break-before:page}.print-action{padding:10px 18px;border:0;border-radius:8px;background:#253a55;color:white;cursor:pointer}@media print{.print-action{display:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body></body></html>');doc.close();
 const button=doc.createElement("button");button.className="print-action";button.textContent="حفظ PDF / طباعة";button.onclick=()=>win.print();doc.body.append(button);
 for(const report of reports){const section=doc.createElement("section");const title=doc.createElement("h1");title.textContent="STC | تقرير الفترة "+periodLabel;section.append(title);const sub=doc.createElement("h2");sub.textContent=report.subtitle;section.append(sub);const table=doc.createElement("table"),head=table.createTHead().insertRow();
 for(const text of ["التاريخ","النوع","العمل / العنوان","التفاصيل","الحالة","القيمة / المدة"]){const th=doc.createElement("th");th.textContent=text;head.append(th);}
 const body=table.createTBody();for(const row of report.rows){const tr=body.insertRow();for(const value of row){tr.insertCell().textContent=String(value);}}section.append(table);doc.body.append(section);}
 win.focus();
 win.setTimeout(()=>{if(!win.closed)win.print();},250);
}
function printContent(win:Window,reports:DepartmentSheet[],periodLabel:string){
 const doc=win.document;doc.open();doc.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>Marketing Flow | تقرير التاسكات</title><style>@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#253a55;margin:0;font-size:12pt;line-height:1.65}header{display:flex;justify-content:space-between;align-items:center;gap:14px;border-bottom:3px solid #f3b820;padding-bottom:12px;margin-bottom:16px}h1{font-size:20pt;margin:0 0 4px}h2{font-size:16pt;margin:0 0 12px}h3{font-size:13pt;margin:0;overflow-wrap:anywhere}.logos{display:flex;align-items:center;gap:12px;flex-shrink:0}.logos img{width:auto;max-width:32mm;max-height:12mm;object-fit:contain}.period{font-size:10pt;color:#52677e}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:10px 0 18px;break-inside:avoid}.summary div{border:1px solid #dfe6ee;border-radius:6px;padding:7px 5px;text-align:center;font-size:9pt}.summary b{display:block;font-size:18pt;color:#253a55}.task{border:1px solid #dfe6ee;border-radius:7px;margin:0 0 10px;padding:12px;break-inside:avoid}.task-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;break-after:avoid}.state{font-size:10pt;font-weight:bold;white-space:nowrap;border:1px solid #dfe6ee;border-radius:5px;padding:2px 7px;color:#253a55}.state[data-state="approved"]{background:#e5f5ed;color:#166445}.state[data-state="review"]{background:#fff1ce;color:#805500}.dates{font-size:10pt;color:#52677e;margin:7px 0;display:flex;gap:18px;flex-wrap:wrap}.details{margin:6px 0 0;padding-top:7px;border-top:1px solid #e6ebf1;white-space:pre-wrap;overflow-wrap:anywhere;unicode-bidi:plaintext;font-size:11pt}.task.long{break-inside:auto}.empty{padding:20px;text-align:center;border:1px solid #dfe6ee}.foot{font-size:9pt;color:#52677e;margin-top:12px}.print-action{padding:10px 18px;margin-bottom:12px;border:0;border-radius:6px;background:#253a55;color:white;cursor:pointer}.print-help{font-size:10pt;color:#52677e;margin:0 0 10px}section+section{break-before:page}@media print{.print-action,.print-help{display:none}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body></body></html>');doc.close();
 const button=doc.createElement("button");button.className="print-action";button.textContent="حفظ PDF / طباعة";button.onclick=()=>win.print();doc.body.append(button);
 const help=doc.createElement("p");help.className="print-help";help.textContent="لنسخة PDF نظيفة: اختر حفظ كملف PDF وألغِ الرؤوس والتذييلات (Headers and footers) في إعدادات الطباعة.";doc.body.append(help);
 const el=(tag:string,value:string,cls?:string)=>{const n=doc.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;};
 for(const report of reports){
  const section=doc.createElement("section"),header=doc.createElement("header"),intro=doc.createElement("div"),logos=doc.createElement("div");logos.className="logos";
  intro.append(el("h1","تقرير التاسكات"),el("div","المحتوى والتصميم","period"));
  for(const [path,name] of [["/stc-logo.png","STC"],["/ichem-logo.png","iChem"]]){const img=doc.createElement("img");img.src=new URL(path,window.location.origin).href;img.alt=name;logos.append(img);}
  header.append(intro,logos);section.append(header,el("h2",report.name));
  const period=doc.createElement("div");period.className="period";const date=el("b",periodLabel);date.dir="ltr";period.append("الفترة: ",date);section.append(period);
  const totals=contentSummary(report.rows),summary=doc.createElement("div");summary.className="summary";
  for(const [label,count] of [["إجمالي التاسكات",totals.total],["تم الاعتماد",totals.approved],["بانتظار المراجعة",totals.review],["باقي الحالات",totals.other]] as const){const cell=el("div",label);cell.prepend(el("b",String(count)));summary.append(cell);}
  section.append(summary);
  if(!report.rows.length)section.append(el("p","لا توجد تاسكات مسجلة في الفترة.","empty"));
  for(const [i,row] of report.rows.entries()){
   const task=doc.createElement("article");task.className="task"+(String(row[1]).length>1400?" long":"");
   const top=doc.createElement("div");top.className="task-top";
   const state=el("span",String(row[4]),"state");state.dataset.state=row[4]==="تم الاعتماد"?"approved":row[4]==="بانتظار المراجعة"?"review":"other";
   const title=el("h3",String(i+1)+". "+String(row[0]));title.dir="auto";top.append(title,state);
   const dates=doc.createElement("div");dates.className="dates";dates.append(el("span","تاريخ التكليف: "+row[2]),el("span","موعد التسليم: "+row[3]));
   task.append(top,dates);if(row[1]&&row[1]!=="—")task.append(el("div",String(row[1]),"details"));section.append(task);
  }
  section.append(el("p","التقرير يعرض كل تاسك مرة واحدة حسب البيانات المتاحة للفترة. سجل الحركات محفوظ داخل السيستم.","foot"));doc.body.append(section);
 }
 win.focus();
 // Wait for both logos. Keep the manual button available if a logo cannot load.
 void Promise.all(Array.from(doc.images).map(img=>img.decode().catch(()=>{}))).then(()=>{if(!win.closed)win.print();});
}
export default function MonthlyReports({department,member,people,initialMonth,scopeLabel,dailyOnly=false}:{department:Department;member:Member;people:ReportPerson[];initialMonth?:string;scopeLabel:string;dailyOnly?:boolean}){
 const [month,setMonth]=useState(initialMonth||currentMonth()),[busy,setBusy]=useState(false);
 const [mode,setMode]=useState<"month"|"range">("month");
 const [first,setFirst]=useState(()=>companyMonthRange(initialMonth||currentMonth()).first);
 const [last,setLast]=useState(()=>companyMonthRange(initialMonth||currentMonth()).last);
 let selected:ReturnType<typeof companyReportPeriod>|null=null;
 try{selected=mode==="month"?companyReportMonth(month):companyReportPeriod(first,last);}catch{}
 const menu=useRef<HTMLDetailsElement>(null),lock=useRef(false);
 useEffect(()=>{if(initialMonth){setMonth(initialMonth);const r=companyMonthRange(initialMonth);setFirst(r.first);setLast(r.last);}},[initialMonth]);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(e.target instanceof Node&&menu.current&&!menu.current.contains(e.target))menu.current.open=false;};document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close);},[]);
 async function run(format:"excel"|"pdf"){
  if(lock.current||!selected||!people.length)return;
  const period=selected;
  const win=format==="pdf"?window.open("","_blank"):null;
  if(format==="pdf"&&!win){showToast("اسمح بفتح النوافذ للتقرير ثم حاول تاني.","error");return;}
  if(win){win.opener=null;win.document.body.textContent="جاري تجهيز التقرير…";}
  lock.current=true;setBusy(true);
  try{
   // The supplied scope is additionally enforced by authenticated database RLS.
   const bytes=format==="excel"&&dailyOnly&&people.length===1?await (async()=>{const person=people[0];const {hours}=await loadSeoDaily(person,period);return buildSeoMonthlyWorkbook({profileName:person.name,brand:person.brand||"",monthKey:companyMonthKey(period.first),hours,done:[],period,hoursOnly:true});})():null;
   const data=bytes?[]:await monthlyReport(department,people,period,dailyOnly);
   if(format==="pdf"&&win){printable(win,data,period.label);}
   else{const blob=new Blob([new Uint8Array(bytes??buildDepartmentWorkbook(data))],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=("STC-"+department+(department==="seo"?(dailyOnly?"-daily":"-targets"):"")+"-"+(people.length===1?people[0].name:"Team")+"-"+period.fileKey+".xlsx").replace(/[\\/:*?"<>|]/g,"-");document.body.append(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
   if(menu.current)menu.current.open=false;showToast(format==="excel"?"تم تصدير التقرير بنجاح.":"التقرير جاهز للحفظ PDF.","success");
  }catch(e){win?.close();showToast(readableError(e),"error");}finally{lock.current=false;setBusy(false);}
 }
 return <details className="stc-report-menu" ref={menu}><summary><Download size={17}/>{scopeLabel}</summary><div className="stc-report-panel"><label>نوع الفترة<select value={mode} onChange={e=>setMode(e.target.value as "month"|"range")} disabled={busy}><option value="month">شهر كامل</option><option value="range">فترة محددة</option></select></label>{mode==="month"?<label>اختر الشهر<input type="month" value={month} onChange={e=>{setMonth(e.target.value);if(e.target.value){const r=companyMonthRange(e.target.value);setFirst(r.first);setLast(r.last);}}} disabled={busy}/></label>:<div className="stc-report-dates"><label>من تاريخ<input type="date" value={first} max={last||undefined} onChange={e=>setFirst(e.target.value)} disabled={busy}/></label><label>إلى تاريخ<input type="date" value={last} min={first||undefined} onChange={e=>setLast(e.target.value)} disabled={busy}/></label></div>}{selected&&mode==="month"&&<small dir="ltr">{selected.label}</small>}{!selected&&<small role="alert">اختار فترة صحيحة: تاريخ البداية قبل النهاية أو نفس اليوم.</small>}<div className="stc-report-buttons"><button type="button" disabled={busy||!selected||!people.length} onClick={()=>void run("excel")}><FileSpreadsheet size={17}/> Excel</button><button type="button" disabled={busy||!selected||!people.length} onClick={()=>void run("pdf")}><FileText size={17}/> PDF</button></div><small>{busy?"جاري تجهيز التقرير…":member.role==="manager"&&people.length>1?"ملف واحد، تاب لكل موظف.":"بيانات الفترة المسجلة في السيستم."}</small></div></details>;
}
