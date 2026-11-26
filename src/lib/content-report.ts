import {inReportPeriod,cairoDate,type ReportPeriod} from "./report-period";
export type ContentTask={id:string;title:string;description?:string|null;status:string;created_at:string;updated_at:string;due_date?:string|null;submission_note?:string|null;review_note?:string|null;text_deliverables?:string[]|null;report_brand?:string|null;report_category?:string|null;actual_quantity?:number|null;requested_quantity?:number|null};
type Activity={task_id:string;created_at:string};
type TaskEvent=Activity&{action:string;details?:{after?:Partial<ContentTask>|null}|null};
type Comment=Activity&{body:string};
type File=Activity&{filename:string};
export const CONTENT_HEADERS=["التاسك","التفاصيل","تاريخ التكليف","موعد التسليم","الحالة"];
const status:Record<string,string>={todo:"لم يبدأ",in_progress:"جاري التنفيذ",tomorrow:"مؤجل للغد",waiting_review:"بانتظار المراجعة",changes_requested:"مطلوب تعديل",approved:"تم الاعتماد"};
const category:Record<string,string>={design:"تصميم",video:"فيديو",ai_video:"فيديو AI",ai_image:"صور AI",caption:"كابشن",content:"كونتنت",datasheet:"نشرة فنية",photo:"تصوير",other:"أخرى"};
const clean=(v:unknown)=>typeof v==="string"?v.trim():"";
const date=(v:string)=>cairoDate(v).split("-").reverse().join("/");
const statusLabel=(v:string)=>status[v]||"غير محددة";
export function contentReportRows(tasks:ContentTask[],events:TaskEvent[],comments:Comment[],files:File[],period:ReportPeriod){
 const rows:string[][]=[];
 for(const task of tasks){
  const all=events.filter(e=>e.task_id===task.id).sort((a,b)=>a.created_at.localeCompare(b.created_at));
  const active=all.filter(e=>inReportPeriod(e.created_at,period));
  const notes=comments.filter(e=>e.task_id===task.id&&inReportPeriod(e.created_at,period));
  const attachments=files.filter(e=>e.task_id===task.id&&inReportPeriod(e.created_at,period));
  if(!inReportPeriod(task.created_at,period)&&!inReportPeriod(task.updated_at,period)&&!active.length&&!notes.length&&!attachments.length)continue;
  // Use the recorded snapshot at the end of the period. Do not silently substitute a later status.
  const later=cairoDate(task.updated_at)>period.last;
  const last=all.filter(e=>cairoDate(e.created_at)<=period.last).at(-1);
  const snapshot=last?.details?.after;
  const t=later?(snapshot||{}):task;
  const detail:string[]=[];
  if(t.report_brand)detail.push("الشركة: "+(t.report_brand==="stc"?"STC":t.report_brand==="ichem"?"iChem":t.report_brand));
  if(t.report_category)detail.push("نوع الشغل: "+(category[t.report_category]||t.report_category));
  if(clean(t.description))detail.push(clean(t.description));
  if(t.actual_quantity!=null)detail.push("العدد المنفذ: "+t.actual_quantity+(t.requested_quantity!=null?" / "+t.requested_quantity:""));
  else if(t.requested_quantity!=null)detail.push("العدد المطلوب: "+t.requested_quantity);
  if(Array.isArray(t.text_deliverables))t.text_deliverables.forEach((v,i)=>{if(clean(v))detail.push((t.report_category==="caption"?"كابشن ":"كونتنت ")+(i+1)+": "+v);});
  if(clean(t.submission_note)&&clean(t.submission_note)!==clean(t.description))detail.push("ملاحظة التسليم: "+clean(t.submission_note));
  if(clean(t.review_note))detail.push("ملاحظة المراجعة: "+clean(t.review_note));
  const seen=new Set(detail.map(clean));
  for(const n of notes){const body=clean(n.body);if(body&&!seen.has(body)){detail.push("ملاحظة: "+body);seen.add(body);}}
  if(attachments.length)detail.push("المرفقات: "+[...new Set(attachments.map(a=>a.filename))].join("، "));
  if(later&&!snapshot)detail.push("تفاصيل نهاية الفترة غير متاحة في السجل التاريخي.");
  rows.push([clean(t.title)||task.title,detail.join("\n")||"—",date(task.created_at),t.due_date?date(t.due_date):"—",t.status?statusLabel(t.status):"غير متاحة لنهاية الفترة"]);
 }
 return rows.sort((a,b)=>a[2].split("/").reverse().join("-").localeCompare(b[2].split("/").reverse().join("-"))||a[0].localeCompare(b[0]));
}
export function contentSummary(rows:readonly (readonly (string|number)[])[]){
 return {total:rows.length,approved:rows.filter(r=>r[4]==="تم الاعتماد").length,review:rows.filter(r=>r[4]==="بانتظار المراجعة").length,other:rows.filter(r=>r[4]!=="تم الاعتماد"&&r[4]!=="بانتظار المراجعة").length};
}
