"use client";
import {useEffect,useRef,useState} from "react";
import {Download,FileSpreadsheet,FileText} from "lucide-react";
import type {Member} from "@/lib/domain";
import {buildDepartmentWorkbook,buildSeoMonthlyWorkbook, type DepartmentSheet} from "@/lib/seo-monthly-export";
import {monthlyReport,loadSeoDaily,type Department,type ReportPerson} from "@/lib/monthly-report-data";
import {showToast} from "@/lib/toasts";
import {readableError} from "@/lib/workspace-quality";
import {companyReportPeriod,companyReportMonth,companyMonthRange,companyMonthKey,cairoDate} from "@/lib/report-period";
const today=()=>cairoDate(new Date().toISOString());
const currentMonth=()=>companyMonthKey(today());
function printable(win:Window,reports:DepartmentSheet[],periodLabel:string){
 const doc=win.document;doc.open();doc.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>STC Monthly report</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,Tahoma,sans-serif;color:#253a55;direction:rtl;margin:0;font-size:12px}h1{font-size:20px;border-bottom:3px solid #f3b820;padding:10px 0}h2{font-size:16px}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#253a55;color:white}td,th{border:1px solid #dfe6ee;padding:7px;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap;text-align:right}th:nth-child(4){width:36%}th:nth-child(3){width:19%}tr{break-inside:auto}thead{display:table-header-group}section+section{break-before:page}.print-action{padding:10px 18px;border:0;border-radius:8px;background:#253a55;color:white;cursor:pointer}@media print{.print-action{display:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body></body></html>');doc.close();
 const button=doc.createElement("button");button.className="print-action";button.textContent="حفظ PDF / طباعة";button.onclick=()=>win.print();doc.body.append(button);
 for(const report of reports){const section=doc.createElement("section");const title=doc.createElement("h1");title.textContent="STC | تقرير الفترة "+periodLabel;section.append(title);const sub=doc.createElement("h2");sub.textContent=report.subtitle;section.append(sub);const table=doc.createElement("table"),head=table.createTHead().insertRow();
 for(const text of ["التاريخ","النوع","العمل / العنوان","التفاصيل","الحالة","القيمة / المدة"]){const th=doc.createElement("th");th.textContent=text;head.append(th);}
 const body=table.createTBody();for(const row of report.rows){const tr=body.insertRow();for(const value of row){tr.insertCell().textContent=String(value);}}section.append(table);doc.body.append(section);}
 win.focus();
 win.setTimeout(()=>{if(!win.closed)win.print();},250);
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
   const bytes=format==="excel"&&dailyOnly&&people.length===1?await (async()=>{const person=people[0];const {hours,done}=await loadSeoDaily(person,period);return buildSeoMonthlyWorkbook({profileName:person.name,brand:person.brand||"",monthKey:companyMonthKey(period.first),hours,done,period});})():null;
   const data=bytes?[]:await monthlyReport(department,people,period,dailyOnly);
   if(format==="pdf"&&win){printable(win,data,period.label);}
   else{const blob=new Blob([new Uint8Array(bytes??buildDepartmentWorkbook(data))],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=("STC-"+department+"-"+(people.length===1?people[0].name:"Team")+"-"+period.fileKey+".xlsx").replace(/[\\/:*?"<>|]/g,"-");document.body.append(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
   if(menu.current)menu.current.open=false;showToast(format==="excel"?"تم تصدير التقرير بنجاح.":"التقرير جاهز للحفظ PDF.","success");
  }catch(e){win?.close();showToast(readableError(e),"error");}finally{lock.current=false;setBusy(false);}
 }
 return <details className="stc-report-menu" ref={menu}><summary><Download size={17}/>{scopeLabel}</summary><div className="stc-report-panel"><label>نوع الفترة<select value={mode} onChange={e=>setMode(e.target.value as "month"|"range")} disabled={busy}><option value="month">شهر كامل</option><option value="range">فترة محددة</option></select></label>{mode==="month"?<label>اختر الشهر<input type="month" value={month} onChange={e=>{setMonth(e.target.value);if(e.target.value){const r=companyMonthRange(e.target.value);setFirst(r.first);setLast(r.last);}}} disabled={busy}/></label>:<div className="stc-report-dates"><label>من تاريخ<input type="date" value={first} max={last||undefined} onChange={e=>setFirst(e.target.value)} disabled={busy}/></label><label>إلى تاريخ<input type="date" value={last} min={first||undefined} onChange={e=>setLast(e.target.value)} disabled={busy}/></label></div>}{selected&&mode==="month"&&<small dir="ltr">{selected.label}</small>}{!selected&&<small role="alert">اختار فترة صحيحة: تاريخ البداية قبل النهاية أو نفس اليوم.</small>}<div className="stc-report-buttons"><button type="button" disabled={busy||!selected||!people.length} onClick={()=>void run("excel")}><FileSpreadsheet size={17}/> Excel</button><button type="button" disabled={busy||!selected||!people.length} onClick={()=>void run("pdf")}><FileText size={17}/> PDF</button></div><small>{busy?"جاري تجهيز التقرير…":member.role==="manager"&&people.length>1?"ملف واحد، تاب لكل موظف.":"بيانات الفترة المسجلة في السيستم."}</small></div></details>;
}
