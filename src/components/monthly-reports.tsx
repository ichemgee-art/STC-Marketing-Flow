"use client";
import {useEffect,useRef,useState} from "react";
import {Download,FileSpreadsheet,FileText} from "lucide-react";
import type {Member} from "@/lib/domain";
import {buildDepartmentWorkbook, type DepartmentSheet} from "@/lib/seo-monthly-export";
import {monthlyReport,type Department,type ReportPerson} from "@/lib/monthly-report-data";
import {showToast} from "@/lib/toasts";
import {readableError} from "@/lib/workspace-quality";
const currentMonth=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit"}).format(new Date());
function printable(win:Window,reports:DepartmentSheet[],month:string){
 const doc=win.document;doc.open();doc.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>STC Monthly report</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,Tahoma,sans-serif;color:#253a55;direction:rtl;margin:0;font-size:12px}h1{font-size:20px;border-bottom:3px solid #f3b820;padding:10px 0}h2{font-size:16px}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#253a55;color:white}td,th{border:1px solid #dfe6ee;padding:7px;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap;text-align:right}th:nth-child(4){width:36%}th:nth-child(3){width:19%}tr{break-inside:auto}thead{display:table-header-group}section+section{break-before:page}.print-action{padding:10px 18px;border:0;border-radius:8px;background:#253a55;color:white;cursor:pointer}@media print{.print-action{display:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body></body></html>');doc.close();
 const button=doc.createElement("button");button.className="print-action";button.textContent="حفظ PDF / طباعة";button.onclick=()=>win.print();doc.body.append(button);
 for(const report of reports){const section=doc.createElement("section");const title=doc.createElement("h1");title.textContent="STC | التقرير الشهري "+month;section.append(title);const sub=doc.createElement("h2");sub.textContent=report.subtitle;section.append(sub);const table=doc.createElement("table"),head=table.createTHead().insertRow();
 for(const text of ["التاريخ","النوع","العمل / العنوان","التفاصيل","الحالة","القيمة / المدة"]){const th=doc.createElement("th");th.textContent=text;head.append(th);}
 const body=table.createTBody();for(const row of report.rows){const tr=body.insertRow();for(const value of row){tr.insertCell().textContent=String(value);}}section.append(table);doc.body.append(section);}
 win.focus();
}
export default function MonthlyReports({department,member,people,initialMonth,scopeLabel}:{department:Department;member:Member;people:ReportPerson[];initialMonth?:string;scopeLabel:string}){
 const [month,setMonth]=useState(initialMonth||currentMonth()),[busy,setBusy]=useState(false);
 const menu=useRef<HTMLDetailsElement>(null),lock=useRef(false);
 useEffect(()=>{if(initialMonth)setMonth(initialMonth);},[initialMonth]);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(e.target instanceof Node&&menu.current&&!menu.current.contains(e.target))menu.current.open=false;};document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close);},[]);
 async function run(format:"excel"|"pdf"){
  if(lock.current||!month||!people.length)return;
  const win=format==="pdf"?window.open("","_blank"):null;
  if(format==="pdf"&&!win){showToast("اسمح بفتح النوافذ للتقرير ثم حاول تاني.","error");return;}
  if(win){win.opener=null;win.document.body.textContent="جاري تجهيز التقرير…";}
  lock.current=true;setBusy(true);
  try{
   // The supplied scope is additionally enforced by authenticated database RLS.
   const data=await monthlyReport(department,people,month);
   if(format==="pdf"&&win){printable(win,data,month);}
   else{const blob=new Blob([new Uint8Array(buildDepartmentWorkbook(data))],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=("STC-"+department+"-"+(people.length===1?people[0].name:"Team")+"-"+month+".xlsx").replace(/[\\/:*?"<>|]/g,"-");document.body.append(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
   if(menu.current)menu.current.open=false;showToast(format==="excel"?"تم تصدير التقرير الشهري بنجاح.":"التقرير جاهز للحفظ PDF.","success");
  }catch(e){win?.close();showToast(readableError(e),"error");}finally{lock.current=false;setBusy(false);}
 }
 return <details className="stc-report-menu" ref={menu}><summary><Download size={17}/>{scopeLabel}</summary><div className="stc-report-panel"><label>اختر الشهر<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><div className="stc-report-buttons"><button type="button" disabled={busy||!month||!people.length} onClick={()=>void run("excel")}><FileSpreadsheet size={17}/> Excel</button><button type="button" disabled={busy||!month||!people.length} onClick={()=>void run("pdf")}><FileText size={17}/> PDF</button></div><small>{busy?"جاري تجهيز التقرير…":member.role==="manager"&&people.length>1?"ملف واحد، تاب لكل موظف.":"بيانات الشهر المسجلة في السيستم."}</small></div></details>;
}
