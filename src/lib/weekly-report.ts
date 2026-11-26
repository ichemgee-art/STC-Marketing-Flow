import {supabase} from "./supabase";
import {cairoDate,inReportPeriod,campaignOverlaps,companyMonthRange,inCompanyMonth,type ReportPeriod} from "./report-period";
export type Brand="stc"|"ichem";
export type WeeklyDepartment="all"|"content"|"seo"|"media";
export type Usage={id:string;task_id:string;quantity:number;state:string;activity_date:string;note:string};
export type WeeklyRow=(string|number)[];export type WeeklySection={title:string;headers:string[];rows:WeeklyRow[];chart?:"seo-target"};
export type WeeklyPayload={brand:Brand;first:string;last:string;sections:WeeklySection[];notes:string;department?:WeeklyDepartment;formatVersion?:2};
export const brandName=(brand:Brand)=>brand==="stc"?"STC":"iChem";
export const brandLogo=(brand:Brand)=>brand==="stc"?"/stc-logo.png":"/ichem-logo.png";
export const platforms=["Facebook","Instagram","LinkedIn","TikTok","YouTube"] as const;
export const states=[["published","Published"],["used","Used"],["scheduled","Scheduled"],["not_used","Not used yet"],["cancelled","Will not be used"]] as const;
export const cats:Record<string,string>={design:"Graphic Design",ai_image:"AI Images",ai_video:"AI Videos",video:"Videos",caption:"Captions",content:"Content",datasheet:"Datasheets",photo:"Photography",other:"Other"};
async function pages(query:(a:number,b:number)=>PromiseLike<{data:any[]|null;error:unknown}>){const rows:any[]=[];for(let a=0;;a+=500){const r=await query(a,a+499);if(r.error)throw r.error;const d=r.data||[];rows.push(...d);if(d.length<500)return rows;}}
export async function loadWeeklySource(){
 const [tasks,events,team,usage,profiles,hours,briefs,submissions,seoTargets,seoProgress]=await Promise.all([
 pages((a,b)=>supabase.from("stc_tasks").select("*").is("deleted_at",null).order("id").range(a,b)),
 pages((a,b)=>supabase.from("stc_events").select("id,task_id,action,created_at,details").in("action",["assigned","reassigned","in_progress","waiting_review","changes_requested","approved","tomorrow"]).order("id").range(a,b)),
 pages((a,b)=>supabase.from("stc_members").select("id,display_name").order("id").range(a,b)),
 pages((a,b)=>supabase.from("stc_deliverable_usage").select("*").order("id").range(a,b)),
 pages((a,b)=>supabase.from("stc_seo_profiles").select("id,brand,display_name").order("id").range(a,b)),
 pages((a,b)=>supabase.from("stc_seo_hours").select("id,profile_id,work_date,start_minutes,end_minutes,activities").order("id").range(a,b)),
 pages((a,b)=>supabase.from("stc_media_briefs").select("*").is("deleted_at",null).order("id").range(a,b)),
 pages((a,b)=>supabase.from("stc_media_submissions").select("*").order("id").range(a,b)),
 pages((a,b)=>supabase.from("stc_seo_targets").select("id,profile_id,month_key,title,target_count,cadence").order("id").range(a,b)),
 pages((a,b)=>supabase.from("stc_seo_progress").select("id,target_id,work_date,done_count").order("id").range(a,b))]);
 return {tasks,events,team,usage:usage as Usage[],profiles,hours,briefs,submissions,seoTargets,seoProgress};
}
export type WeeklySource=Awaited<ReturnType<typeof loadWeeklySource>>;
export type Allocation={published:string;next:string;unused:string};
export type Allocations=Record<string,Allocation>;
export const emptyAllocation:Allocation={published:"",next:"",unused:""};
export function weeklyTotals(source:WeeklySource,brand:Brand,period:ReportPeriod){
 const totals:Record<string,number>={};let missing=0;let unknown=0;
 for(const t of source.tasks){
  const approved=source.events.find(e=>e.task_id===t.id&&e.action==="approved"&&inReportPeriod(e.created_at,period));
  if(!approved)continue;
  if(!t.report_brand){missing++;continue;}
  if(t.report_brand!==brand)continue;
  if(!t.report_category||t.actual_quantity==null||!Number.isInteger(Number(t.actual_quantity))||Number(t.actual_quantity)<0){unknown++;continue;}
  const category=t.report_category;
  totals[category]=(totals[category]||0)+Number(t.actual_quantity);
 }
 return {rows:Object.entries(totals).map(([key,total])=>({key,label:cats[key]||"Other",total})),missing,unknown};
}
export function allocationValues(total:number,entry:Allocation=emptyAllocation){
 const values=[entry.published,entry.next,entry.unused].map(v=>v.trim()===""?0:Number(v));
 const valid=values.every(v=>Number.isSafeInteger(v)&&v>=0)&&values.reduce((a,b)=>a+b,0)<=total;
 const entered=[entry.published,entry.next,entry.unused].some(v=>v.trim()!=="");
 return {values,valid,entered,remaining:valid?total-values.reduce((a,b)=>a+b,0):0};
}
export function weeklyCampaigns(source:WeeklySource,brand:Brand,period:ReportPeriod){
 return source.briefs.filter(b=>b.report_brand===brand).map(b=>({brief:b,result:source.submissions.find(x=>x.brief_id===b.id)})).filter(({brief:b,result:r})=>inReportPeriod(b.created_at,period)||inReportPeriod(r?.created_at,period)||inReportPeriod(r?.updated_at,period)||campaignOverlaps(r?.start_date,r?.end_date,period));
}
/** Official weekly SEO work comes exclusively from the daily work log, not target progress. */
export function weeklySeo(source:WeeklySource,brand:Brand,period:ReportPeriod){
 const ids=new Set(source.profiles.filter(p=>String(p.brand).toLowerCase()===brand).map(p=>p.id));
 const entries=source.hours.filter(h=>ids.has(h.profile_id)&&inReportPeriod(h.work_date,period))
  .sort((a,b)=>String(a.work_date).localeCompare(String(b.work_date))||Number(a.start_minutes)-Number(b.start_minutes));
 const days=new Map<string,{date:string;activities:string[];minutes:number}>();
 for(const h of entries){
  const item: {date:string;activities:string[];minutes:number}=days.get(h.work_date)??{date:String(h.work_date),activities:[],minutes:0};
  if(typeof h.activities==="string"&&h.activities.trim())item.activities.push(h.activities.trim());
  const from=Number(h.start_minutes),to=Number(h.end_minutes);
  if(Number.isInteger(from)&&Number.isInteger(to)&&from>=0&&to<=1440&&to>from)item.minutes+=to-from;
  days.set(h.work_date,item);
 }
 return [...days.values()];
}
/** Weekly quantity / full monthly quota, never inferred from daily work descriptions. */
export function weeklySeoTargets(source:WeeklySource,brand:Brand,period:ReportPeriod){
 const ids=new Set(source.profiles.filter(p=>String(p.brand).toLowerCase()===brand).map(p=>p.id));
 const result:{id:string;month:string;title:string;required:number|null;done:number;percent:number|null;status:string}[]=[];
 for(const t of source.seoTargets||[]){
  if(!ids.has(t.profile_id)||t.cadence!=="monthly")continue;
  const bounds=companyMonthRange(t.month_key);if(bounds.first>period.last||bounds.last<period.first)continue;
  const done=(source.seoProgress||[]).filter(p=>p.target_id===t.id&&inCompanyMonth(p.work_date,t.month_key)&&inReportPeriod(p.work_date,period)).reduce((sum,p)=>sum+Number(p.done_count),0);
  const required=t.target_count==null?null:Number(t.target_count);
  const percent=required!==null&&required>0?Math.round(done/required*10000)/100:null;
  result.push({id:t.id,month:t.month_key,title:t.title,required,done,percent,status:done>0?"Work recorded":"No work recorded"});
 }
 return result.sort((a,b)=>a.month.localeCompare(b.month)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
}
export const formatSeoDuration=(minutes:number)=>Math.floor(minutes/60)+":"+String(minutes%60).padStart(2,"0");
export function makeWeeklyReport(source:WeeklySource,brand:Brand,period:ReportPeriod,posts:Record<string,string>,whatsapp:string,notes:string,department:WeeklyDepartment="all",allocations:Allocations={},selectedCampaigns:string[]=[]):WeeklyPayload{
 const {rows}=weeklyTotals(source,brand,period);
 const achievements:WeeklyRow[]=rows.map(r=>[r.label,r.total]);
 const usageRows:WeeklyRow[]=rows.map(r=>{const a=allocationValues(r.total,allocations[r.key]);if(!a.valid)throw Error("Invalid allocation");return [r.label,r.total,...a.values,a.remaining];});
 const seoRows:WeeklyRow[]=weeklySeo(source,brand,period).map(r=>[r.date,r.activities.join("\n"),formatSeoDuration(r.minutes)]);
 const mediaRows:WeeklyRow[]=weeklyCampaigns(source,brand,period).filter(({brief})=>selectedCampaigns.includes(brief.id)).map(({brief:b,result:r})=>[r?.campaign_post||b.post_url,r?.campaign_goal||b.instructions||"",r?.daily_budget??"Not recorded",r?.currency||"",r?.start_date||"",r?.end_date||"",r?.results||"Not recorded",r?.status||"Assigned"]);
 const sections:WeeklySection[]=[
 {title:"01 — Team Achievements",headers:["Work type","Completed quantity"],rows:achievements},
 {title:"02 — Deliverables Utilization",headers:["Work type","Completed quantity","Published / used","Next week","Unused","Not classified"],rows:usageRows},
 {title:"03 — Social Media Posting",headers:["Platform","Published posts","Source"],rows:platforms.map(p=>[p,posts[p]?.trim()?Number(posts[p]):"Not recorded","Manager entry"])},
 {title:"04 — SEO Achievements",headers:["Date","Work performed","Hours worked (h:mm)"],rows:seoRows},
 {title:"05 — Paid Campaigns",headers:["Post","Goal","Daily budget","Currency","From","To","Results","Status"],rows:mediaRows},
 {title:"06 — WhatsApp",headers:["Metric","Count","Source"],rows:[["Messages",whatsapp.trim()?Number(whatsapp):"Not recorded","Manager entry"]]}];
 sections.push({title:"07 — SEO Monthly Target Performance",headers:["Reporting month","Target","Monthly target","Completed in period","Monthly target achieved (%)","Status"],rows:weeklySeoTargets(source,brand,period).map(r=>[r.month,r.title,r.required??"—",r.required===null?"—":r.done,r.percent??"—",r.status]),chart:"seo-target"});
 const indices=department==="content"?[0,1,2]:department==="seo"?[3,6]:department==="media"?[4,5]:[0,1,2,3,6,4,5];
 return {brand,first:period.first,last:period.last,notes,department,formatVersion:2,sections:indices.map(i=>sections[i])};
}
