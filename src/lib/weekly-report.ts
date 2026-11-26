import {supabase} from "./supabase";
import {inReportPeriod,campaignOverlaps,type ReportPeriod} from "./report-period";
export type Brand="stc"|"ichem";
export type Usage={id:string;task_id:string;quantity:number;state:string;activity_date:string;note:string};
export type WeeklyRow=(string|number)[];export type WeeklySection={title:string;headers:string[];rows:WeeklyRow[]};
export type WeeklyPayload={brand:Brand;first:string;last:string;sections:WeeklySection[];notes:string};
export const brandName=(brand:Brand)=>brand==="stc"?"STC":"iChem";
export const brandLogo=(brand:Brand)=>brand==="stc"?"/stc-logo.png":"/ichem-logo.png";
export const platforms=["Facebook","Instagram","LinkedIn","TikTok","YouTube"] as const;
export const states=[["published","Published"],["used","Used"],["scheduled","Scheduled"],["not_used","Not used yet"],["cancelled","Will not be used"]] as const;
const cats:Record<string,string>={design:"Graphic Design",ai_image:"AI Images",ai_video:"AI Videos",video:"Videos",caption:"Captions",datasheet:"Datasheets",photo:"Photography",other:"Other"};
async function pages(query:(a:number,b:number)=>PromiseLike<{data:any[]|null;error:unknown}>){const rows:any[]=[];for(let a=0;;a+=500){const r=await query(a,a+499);if(r.error)throw r.error;const d=r.data||[];rows.push(...d);if(d.length<500)return rows;}}
export async function loadWeeklySource(){
 const [tasks,events,team,usage,profiles,progress,briefs,submissions]=await Promise.all([
 pages((a,b)=>supabase.from("stc_tasks").select("*").is("deleted_at",null).order("id").range(a,b)),
 pages((a,b)=>supabase.from("stc_events").select("id,task_id,action,created_at,details").eq("action","approved").order("id").range(a,b)),
 pages((a,b)=>supabase.from("stc_members").select("id,display_name").order("id").range(a,b)),
 pages((a,b)=>supabase.from("stc_deliverable_usage").select("*").order("id").range(a,b)),
 pages((a,b)=>supabase.from("stc_seo_profiles").select("id,brand,display_name").order("id").range(a,b)),
 pages((a,b)=>supabase.from("stc_seo_progress").select("*,stc_seo_targets!inner(title,target_unit,profile_id)").order("id").range(a,b)),
 pages((a,b)=>supabase.from("stc_media_briefs").select("*").is("deleted_at",null).order("id").range(a,b)),
 pages((a,b)=>supabase.from("stc_media_submissions").select("*").order("id").range(a,b))]);
 return {tasks,events,team,usage:usage as Usage[],profiles,progress,briefs,submissions};
}
export type WeeklySource=Awaited<ReturnType<typeof loadWeeklySource>>;
export function makeWeeklyReport(source:WeeklySource,brand:Brand,period:ReportPeriod,posts:Record<string,string>,whatsapp:string,notes:string):WeeklyPayload{
 const name=(id:string)=>source.team.find(t=>t.id===id)?.display_name||"Team member";
 const approved=source.tasks.filter(t=>t.report_brand===brand&&t.status==="approved"&&source.events.some(e=>e.task_id===t.id&&inReportPeriod(e.created_at,period)));
 const achievements:WeeklyRow[]=approved.map(t=>[name(t.assignee_id),cats[t.report_category]||"Unclassified",t.title,t.actual_quantity??"Not recorded",source.events.find(e=>e.task_id===t.id&&inReportPeriod(e.created_at,period))?.created_at?.slice(0,10)||""]);
 const usageRows:WeeklyRow[]=[];
 for(const t of source.tasks.filter(t=>t.report_brand===brand&&t.status==="approved")){
  const all=source.usage.filter(u=>u.task_id===t.id);const within=all.filter(u=>inReportPeriod(u.activity_date,period));
  for(const u of within)usageRows.push([cats[t.report_category]||"Unclassified",t.title,states.find(s=>s[0]===u.state)?.[1]||u.state,u.quantity,u.activity_date,u.note]);
  if(approved.some(a=>a.id===t.id)&&t.actual_quantity!=null){const left=t.actual_quantity-all.reduce((n,u)=>n+u.quantity,0);if(left>0)usageRows.push([cats[t.report_category]||"Unclassified",t.title,"Not yet classified",left,"","Current unallocated quantity"]);}
 }
 const seoRows:WeeklyRow[]=[];
 for(const p of source.progress){const target=Array.isArray(p.stc_seo_targets)?p.stc_seo_targets[0]:p.stc_seo_targets;const profile=source.profiles.find(t=>t.id===target?.profile_id);if(profile?.brand?.toLowerCase()!==brand||!inReportPeriod(p.work_date,period))continue;seoRows.push([profile.display_name,target.title,p.done_count,target.target_unit,p.work_date,p.note||""]);}
 const mediaRows:WeeklyRow[]=[];
 for(const b of source.briefs.filter(x=>x.report_brand===brand)){const r=source.submissions.find(x=>x.brief_id===b.id);if(!inReportPeriod(b.created_at,period)&&!inReportPeriod(r?.updated_at,period)&&!campaignOverlaps(r?.start_date,r?.end_date,period))continue;mediaRows.push([b.post_url,r?.campaign_goal||b.instructions||"",r?.daily_budget??"Not recorded",r?.currency||"",r?.start_date||"",r?.end_date||"",r?.results||"",r?.status||"Assigned"]);}
 return {brand,first:period.first,last:period.last,notes,sections:[
 {title:"01 — Team Achievements",headers:["Team member","Work type","Completed work","Quantity","Approval date"],rows:achievements},
 {title:"02 — Deliverables Utilization",headers:["Category","Deliverable","Status","Quantity","Date","Notes"],rows:usageRows},
 {title:"03 — Social Media Posting",headers:["Platform","Published posts","Source"],rows:platforms.map(p=>[p,posts[p]?.trim()?Number(posts[p]):"Not recorded","Manager entry"])},
 {title:"04 — SEO Achievements",headers:["Specialist","Work","Quantity","Unit","Date","Notes"],rows:seoRows},
 {title:"05 — Paid Campaigns",headers:["Post","Goal","Daily budget","Currency","From","To","Results","Status"],rows:mediaRows},
 {title:"06 — WhatsApp",headers:["Metric","Count","Source"],rows:[["Messages",whatsapp.trim()?Number(whatsapp):"Not recorded","Manager entry"]]}]};
}
