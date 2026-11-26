import {supabase} from "./supabase";
import {seoMetricLabel} from "./seo-metric-labels";
import {type DepartmentSheet,type ReportAchievement,type ReportHour} from "./seo-monthly-export";
import {inReportPeriod,campaignOverlaps,inCompanyMonth,type ReportPeriod} from "./report-period";
export type Department="content"|"seo"|"media";
export type ReportPerson={id:string;name:string;brand?:string};
type Row=(string|number)[];
type RecordRow=Record<string,any>;
const status:Record<string,string>={todo:"لم يبدأ",in_progress:"جاري التنفيذ",tomorrow:"غدًا",waiting_review:"بانتظار المراجعة",pending_review:"بانتظار المراجعة",changes_requested:"مطلوب تعديل",approved:"تم الاعتماد",draft:"مسودة",assigned:"توزيع",reassigned:"إعادة توزيع",updated:"تحديث",deleted:"محذوف"};
const label=(v:unknown)=>status[String(v)]||String(v??"");
const str=(v:unknown)=>v==null?"":String(v);
const lines=(...s:(string|false|undefined)[])=>s.filter(Boolean).join("\n");
const stamp=(v:string)=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(v));
const mins=(v:number)=>String(Math.floor(v/60)).padStart(2,"0")+":"+String(v%60).padStart(2,"0");
async function pages(query:(from:number,to:number)=>PromiseLike<{data:RecordRow[]|null;error:unknown}>){
 const all:RecordRow[]=[];for(let from=0;;from+=500){const r=await query(from,from+499);if(r.error)throw r.error;const data=r.data||[];all.push(...data);if(data.length<500)return all;}
}
function chunks<T>(items:T[],size=100){const out:T[][]=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out;}
async function content(person:ReportPerson,period:ReportPeriod):Promise<Row[]>{
 const tasks=await pages((a,b)=>supabase.from("stc_tasks").select("*").eq("assignee_id",person.id).is("deleted_at",null).order("id").range(a,b));
 const events:RecordRow[]=[],comments:RecordRow[]=[],attachments:RecordRow[]=[];
 const {first,next}=period;
 // Widen UTC range, then use Cairo calendar dates; no DST assumption.
 const start=new Date(Date.parse(first+"T00:00:00Z")-86400000).toISOString(),end=new Date(Date.parse(next+"T00:00:00Z")+86400000).toISOString();
 for(const ids of chunks(tasks.map(t=>t.id))){
  const [e,c,f]=await Promise.all([
   pages((a,b)=>supabase.from("stc_events").select("id,task_id,action,created_at").in("task_id",ids).gte("created_at",start).lt("created_at",end).order("id").range(a,b)),
   pages((a,b)=>supabase.from("stc_comments").select("id,task_id,body,created_at").in("task_id",ids).gte("created_at",start).lt("created_at",end).order("id").range(a,b)),
   pages((a,b)=>supabase.from("stc_attachments").select("id,task_id,filename,size,created_at").in("task_id",ids).gte("created_at",start).lt("created_at",end).order("id").range(a,b))
  ]);events.push(...e.filter(x=>inReportPeriod(x.created_at,period)));comments.push(...c.filter(x=>inReportPeriod(x.created_at,period)));attachments.push(...f.filter(x=>inReportPeriod(x.created_at,period)));
 }
 const rows:Row[]=[];
 for(const t of tasks){
  const e=events.filter(x=>x.task_id===t.id),c=comments.filter(x=>x.task_id===t.id),f=attachments.filter(x=>x.task_id===t.id);
  if(!inReportPeriod(t.created_at,period)&&!inReportPeriod(t.updated_at,period)&&!e.length&&!c.length&&!f.length)continue;
  const relevant=[...e,...c,...f].map(x=>x.created_at).sort();
  const date=inReportPeriod(t.created_at,period)?stamp(t.created_at):relevant.length?stamp(relevant[0]):stamp(t.updated_at);
  rows.push([date,"تاسك",t.title,lines(t.description,"تاريخ الإنشاء: "+stamp(t.created_at),t.due_date&&"ميعاد التسليم: "+t.due_date,t.submission_note&&"ملاحظة التسليم: "+t.submission_note,t.review_note&&"ملاحظة المراجعة: "+t.review_note,"آخر تحديث: "+stamp(t.updated_at)),label(t.status),t.priority]);
  for(const x of e)rows.push([stamp(x.created_at),"حركة التاسك",t.title,"",label(x.action),""]);
  for(const x of c)rows.push([stamp(x.created_at),"ملاحظة",t.title,x.body,"",""]);
  for(const x of f)rows.push([stamp(x.created_at),"مرفق",t.title,x.filename,"",x.size+" bytes"]);
 }
 return rows.sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
}
export async function loadSeoDaily(person:ReportPerson,period:ReportPeriod){
 const {first,next}=period;
 const [hours,progress]=await Promise.all([
  pages((a,b)=>supabase.from("stc_seo_hours").select("*").eq("profile_id",person.id).gte("work_date",first).lt("work_date",next).order("id").range(a,b)),
  pages((a,b)=>supabase.from("stc_seo_progress").select("*,stc_seo_targets!inner(title,target_count,profile_id)").eq("stc_seo_targets.profile_id",person.id).gte("work_date",first).lt("work_date",next).order("id").range(a,b))
 ]);
 const work:ReportHour[]=hours.map(h=>({work_date:h.work_date,start_minutes:h.start_minutes,end_minutes:h.end_minutes,activities:h.activities}));
 const done:ReportAchievement[]=progress.map(x=>{const t=Array.isArray(x.stc_seo_targets)?x.stc_seo_targets[0]:x.stc_seo_targets;return {work_date:x.work_date,title:t?.title||"تارجت",unit:"",qualitative:t?.target_count===null,done_count:x.done_count,note:x.note||""};});
 return {hours:work,done,progress};
}
async function seo(person:ReportPerson,period:ReportPeriod,dailyOnly=false):Promise<Row[]>{
 const {hours,done,progress}=await loadSeoDaily(person,period);
 const rows:Row[]=[["","إجمالي الساعات","ساعات الفترة","","",mins(hours.reduce((n,x)=>n+x.end_minutes-x.start_minutes,0))]];
 for(const h of hours.sort((a,b)=>a.work_date.localeCompare(b.work_date)||a.start_minutes-b.start_minutes))rows.push([h.work_date,"فترة عمل",mins(h.start_minutes)+" – "+mins(h.end_minutes),h.activities,"",mins(h.end_minutes-h.start_minutes)]);
 for(const x of done)rows.push([x.work_date,"إنجاز Done",x.title,x.note,x.qualitative?(x.done_count>0?"تم التنفيذ":"لم يتم التنفيذ"):"",x.qualitative?"":x.done_count]);
 if(dailyOnly)return rows;
 // Monthly snapshots are not weekly data. Include them only for fully selected company reporting months.
 if(!period.fullMonths.length){rows.push(["","ملاحظة","المؤشرات والتارجت الشهري","تظهر البيانات الشهرية عند اختيار شهر كامل؛ التقرير الحالي يشمل الساعات والإنجازات الفعلية للفترة.","",""]);return rows;}
 for(const month of period.fullMonths){
  const [targets,metrics,periods]=await Promise.all([
   pages((a,b)=>supabase.from("stc_seo_targets").select("*").eq("profile_id",person.id).eq("month_key",month).order("id").range(a,b)),
   pages((a,b)=>supabase.from("stc_seo_metrics").select("*").eq("profile_id",person.id).eq("month_key",month).order("id").range(a,b)),
   pages((a,b)=>supabase.from("stc_seo_periods").select("label,cells,links,comments,source_sheet,image_count,id").eq("profile_id",person.id).eq("month_key",month).order("id").range(a,b))
  ]);
  for(const t of targets){const completed=progress.filter(x=>x.target_id===t.id&&inCompanyMonth(String(x.work_date),month)).reduce((n,x)=>n+x.done_count,0);rows.push([month,"تارجت شهري",t.title,lines(t.details,t.target_count==null?"مهمة بدون عدد":"المطلوب: "+t.target_count,"الدورية: "+t.cadence),t.target_count==null?(completed>0?"تم التنفيذ":"لم يتم التنفيذ"):"المنفذ",t.target_count==null?"":completed]);}
  for(const x of metrics)rows.push([month,"مؤشر SEO شهري",seoMetricLabel(x.metric_key),lines("قبل: "+str(x.before_value),"بعد: "+str(x.after_value),x.note,x.review_note),label(x.status),""]);
  for(const x of periods)for(const [addr,value] of Object.entries(x.cells||{}))rows.push([month,"بيانات تاريخية شهرية",x.source_sheet+" / "+addr,lines(str(value),x.comments?.[addr],x.links?.[addr]),"",""]);
 }
 return rows;
}
async function media(person:ReportPerson,period:ReportPeriod):Promise<Row[]>{
 const briefs=await pages((a,b)=>supabase.from("stc_media_briefs").select("*").eq("profile_id",person.id).is("deleted_at",null).order("id").range(a,b));
 const reports:RecordRow[]=[];
 for(const ids of chunks(briefs.map(x=>x.id)))reports.push(...await pages((a,b)=>supabase.from("stc_media_submissions").select("*").in("brief_id",ids).order("id").range(a,b)));
 const {first}=period,rows:Row[]=[];
 for(const x of briefs){const r=reports.find(t=>t.brief_id===x.id);
  const overlap=campaignOverlaps(r?.start_date,r?.end_date,period);
  if(!inReportPeriod(x.created_at,period)&&!inReportPeriod(x.updated_at,period)&&!inReportPeriod(r?.created_at,period)&&!inReportPeriod(r?.updated_at,period)&&!overlap)continue;
  const date=inReportPeriod(x.created_at,period)?stamp(x.created_at):overlap?(r!.start_date<first?first:r!.start_date):inReportPeriod(r?.created_at,period)?stamp(r!.created_at):inReportPeriod(r?.updated_at,period)?stamp(r!.updated_at):stamp(x.updated_at);
  rows.push([date,"حملة إعلانية",x.post_url,lines("التكليف: "+stamp(x.created_at),x.goal,x.instructions,r&&"رابط التقرير: "+r.campaign_post,r&&"الهدف: "+r.campaign_goal,r&&"الفترة: "+str(r.start_date)+" – "+str(r.end_date),r&&"العملة: "+r.currency,r&&"النتائج: "+r.results,r?.note,r?.review_note,r&&"آخر تحديث للتقرير: "+stamp(r.updated_at)),label(r?.status||"todo"),r?.daily_budget??""]);
 }
 return rows.sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
}
export async function monthlyReport(department:Department,people:ReportPerson[],period:ReportPeriod,dailyOnly=false):Promise<DepartmentSheet[]>{
 if(!people.length)throw Error("مفيش موظفين متاحين للتقرير.");
 const title={content:"المحتوى والتصميم",seo:"SEO",media:"Media Buying"}[department];
 const result:DepartmentSheet[]=[];
 for(const person of people){const rows=await (department==="content"?content(person,period):department==="seo"?seo(person,period,dailyOnly):media(person,period));
  result.push({name:person.name,subtitle:person.name+" | "+(person.brand||title)+" | "+period.label,rows:rows.length?rows:[["","لا توجد بيانات مسجلة","","","",""]]});}
 return result;
}
