"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Activity, ArrowRight, BarChart3, CalendarDays, CheckCircle2, ChevronLeft,
  Clock3, ExternalLink, Filter, LogOut, Megaphone, MousePointerClick, Pencil,
  Plus, RefreshCw, Send, Target, TrendingUp, Users, Wallet, X,
} from "lucide-react";
import type { Member } from "@/lib/domain";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/lib/toasts";
import BrandLockup from "./brand-lockup";
import "./media-buyer-workspace.css";

type Profile={id:string;slug:string;display_name:string;member_id:string|null};
type CampaignStatus="planned"|"active"|"paused"|"completed"|"cancelled";
type Campaign={
 id:string;profile_id:string;title:string;brand:string;platform:string;
 post_label:string;post_url:string;objective:string;goal_notes:string;
 target_results:number|null;daily_budget:number;currency:string;start_date:string;end_date:string;
 status:CampaignStatus;notes:string;created_at:string;
};
type ReportStatus="pending_review"|"approved"|"changes_requested";
type Report={
 id:string;campaign_id:string;report_date:string;amount_spent:number;
 impressions:number;reach:number;clicks:number;results_count:number;result_label:string;
 notes:string;review_note:string;status:ReportStatus;updated_at:string;
};
type FormDataState={
 title:string;brand:string;platform:string;post_label:string;post_url:string;objective:string;
 goal_notes:string;target_results:string;daily_budget:string;currency:string;start_date:string;
 end_date:string;status:CampaignStatus;notes:string;
};
const objectives=[
 ["awareness","Brand Awareness"],["engagement","Engagement"],["messages","Messages"],
 ["leads","Leads"],["traffic","Website Traffic"],["sales","Sales"],["other","Other"]
];
const campaignStatuses:Record<CampaignStatus,string>={
 planned:"مخطط لها",active:"شغالة",paused:"متوقفة مؤقتًا",
 completed:"انتهت",cancelled:"ملغية",
};
const reportStatuses:Record<ReportStatus,string>={
 pending_review:"مستنية مراجعة",approved:"اتعمدت",
 changes_requested:"مطلوب تعديل",
};
const money=(n:number,currency:string)=>new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(n)+" "+currency;
const qty=(n:number)=>new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(n);
const interval=(a:string,b:string)=>Math.max(1,Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/86400000)+1);
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const validLink=(v:string)=>{try{const u=new URL(v);return ["https:","http:"].includes(u.protocol)?u.href:null;}catch{return null;}};
const objectiveLabel=(v:string)=>objectives.find(o=>o[0]===v)?.[1]||v;
const resultLabel=(v:string)=>({
 messages:"Messages",leads:"Leads",sales:"Sales",traffic:"Conversions",
 engagement:"Engagements",awareness:"Results",other:"Results",
} as Record<string,string>)[v]||"Results";
const initialFields:FormDataState={
 title:"",brand:"STC",platform:"Meta",post_label:"",post_url:"",objective:"messages",
 goal_notes:"",target_results:"",daily_budget:"",currency:"EGP",start_date:"",
 end_date:"",status:"planned",notes:"",
};
function campaignFields(c:Campaign|null):FormDataState{
 if(!c)return {...initialFields};
 return {title:c.title,brand:c.brand,platform:c.platform,post_label:c.post_label,
 post_url:c.post_url,objective:c.objective,goal_notes:c.goal_notes,
 target_results:c.target_results===null?"":String(c.target_results),
 daily_budget:String(c.daily_budget),currency:c.currency,start_date:c.start_date,
 end_date:c.end_date,status:c.status,notes:c.notes};
}
type CampaignEditorProps={profile:Profile;memberId:string;existing:Campaign|null;
 hasReports:boolean;onClose:()=>void;onSaved:()=>Promise<void>};
function CampaignEditor({profile,memberId,existing,hasReports,onClose,onSaved}:CampaignEditorProps){
 const [fields,setFields]=useState<FormDataState>(()=>campaignFields(existing));
 const [saving,setSaving]=useState(false),[error,setError]=useState("");
 const set=(key:keyof FormDataState,value:string)=>setFields(old=>({...old,[key]:value}));
 const dayCount=fields.start_date&&fields.end_date&&fields.end_date>=fields.start_date
  ?interval(fields.start_date,fields.end_date):0;
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(saving)return;
  if(!fields.title.trim()||!fields.post_label.trim()||!fields.goal_notes.trim()){
   setError("اكتبي اسم الحملة والبوست والهدف بشكل واضح.");return;
  }
  if(fields.post_url.trim()&&!validLink(fields.post_url.trim())){
   setError("رابط البوست لازم يبدأ بـ https:// أو http://.");return;
  }
  const budget=Number(fields.daily_budget);
  if(!Number.isFinite(budget)||budget<=0){setError("الميزانية اليومية لازم تكون أكبر من صفر.");return;}
  if(dayCount<1||dayCount>366){setError("اختاري فترة صحيحة للحملة، بحد أقصى 366 يوم.");return;}
  if(fields.target_results.trim()&&(!Number.isSafeInteger(Number(fields.target_results))||Number(fields.target_results)<0)){
   setError("التارجت العددي لازم يكون رقم صحيح غير سالب.");return;
  }
  setSaving(true);setError("");
  try{
   const values={
    profile_id:profile.id,title:fields.title.trim(),brand:fields.brand,platform:fields.platform,
    post_label:fields.post_label.trim(),post_url:fields.post_url.trim(),objective:fields.objective,
    goal_notes:fields.goal_notes.trim(),target_results:fields.target_results?Number(fields.target_results):null,
    daily_budget:budget,currency:fields.currency,start_date:fields.start_date,
    end_date:fields.end_date,status:fields.status,notes:fields.notes.trim(),
   };
   const result=existing
    ?await supabase.from("stc_media_campaigns").update(values).eq("id",existing.id).select("id")
    :await supabase.from("stc_media_campaigns").insert({...values,created_by:memberId}).select("id");
   if(result.error)throw result.error;
   if(!result.data?.length)throw new Error("التغييرات ما اتحفظتش؛ جرّبي تعملي تحديث.");
   await onSaved();
   showToast(existing?"تعديلات الحملة اتحفظت بنجاح.":"الحملة اتضافت وظهرت لأحمد الخولي.");
   onClose();
  }catch(e){const message=e instanceof Error?e.message:"حصلت مشكلة في حفظ الحملة.";
   setError(message);showToast(message,"error");
  }finally{setSaving(false);}
 }
 return <div className="media-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)onClose();}}>
  <section className="media-modal" role="dialog" aria-modal="true" aria-labelledby="media-new-title">
   <header className="media-modal-top"><div><span className="media-eyebrow">CAMPAIGN BRIEF</span>
     <h2 id="media-new-title">{existing?"تعديل بيانات الحملة":"إنشاء Campaign جديدة"}</h2>
     <p>ناردين بتحدد البوست والهدف والميزانية والمدة، وأحمد بيسجّل النتايج.</p>
    </div><button type="button" aria-label="إغلاق" onClick={onClose}><X size={21}/></button></header>
   <form className="media-form" onSubmit={e=>void save(e)}>
    <div className="media-field-title">01 · معلومات الإعلان</div>
    <label className="media-span">اسم الحملة *
      <input required maxLength={180} value={fields.title} onChange={e=>set("title",e.target.value)}
       placeholder="مثلاً: Epoxy Flooring - Message Campaign"/></label>
    <label>البراند
     <select value={fields.brand} onChange={e=>set("brand",e.target.value)}>
      <option value="STC">STC</option><option value="iChem">iChem</option><option value="Other">Other</option>
     </select></label>
    <label>المنصة
     <select value={fields.platform} onChange={e=>set("platform",e.target.value)}>
      <option value="Meta">Facebook / Instagram (Meta)</option>
      <option value="Google">Google Ads</option><option value="TikTok">TikTok Ads</option>
      <option value="LinkedIn">LinkedIn Ads</option><option value="Other">Other</option>
     </select></label>
    <label className="media-span">الإعلان هيكون على أنهي بوست؟ *
      <input required maxLength={250} value={fields.post_label} onChange={e=>set("post_label",e.target.value)}
       placeholder="اسم البوست أو وصفه"/></label>
    <label className="media-span">رابط البوست
      <input type="url" dir="ltr" value={fields.post_url} onChange={e=>set("post_url",e.target.value)}
       maxLength={2000} placeholder="https://..."/></label>
    <label>هدف الحملة *
     <select value={fields.objective} onChange={e=>set("objective",e.target.value)}>
      {objectives.map(([id,label])=><option value={id} key={id}>{label}</option>)}
     </select></label>
    <label>التارجت العددي (اختياري)
     <input type="number" min={0} step={1} value={fields.target_results}
      onChange={e=>set("target_results",e.target.value)} placeholder="مثلاً: 50"/></label>
    <label className="media-span">وصف الهدف المطلوب *
     <textarea required rows={2} maxLength={3000} value={fields.goal_notes} onChange={e=>set("goal_notes",e.target.value)}
      placeholder="مثلاً: تحقيق رسائل مهتمة بعرض الإيبوكسي من عملاء القاهرة والجيزة"/></label>
    <div className="media-field-title">02 · الميزانية والمدة</div>
    <label>Budget / Day *
     <input required type="number" min="0.01" step="0.01" value={fields.daily_budget}
      onChange={e=>set("daily_budget",e.target.value)} placeholder="مثلاً: 300"/></label>
    <label>العملة
     <select value={fields.currency} onChange={e=>set("currency",e.target.value)}>
      {["EGP","USD","EUR","SAR","AED"].map(x=><option key={x} value={x}>{x}</option>)}
     </select></label>
    <label>From Date *
     <input type="date" required disabled={hasReports} value={fields.start_date}
      onChange={e=>set("start_date",e.target.value)}/></label>
    <label>To Date *
     <input type="date" required disabled={hasReports} min={fields.start_date||undefined}
      value={fields.end_date} onChange={e=>set("end_date",e.target.value)}/></label>
    {hasReports&&<p className="media-form-hint media-span">التواريخ مقفولة لأن فيه نتايج فعلية متسجلة للحملة بالفعل.</p>}
    <div className="media-budget-box media-span"><CalendarDays size={20}/><span><b>{dayCount} يوم</b> مدة الحملة</span>
      <Wallet size={20}/><span><b>{dayCount?money(dayCount*Number(fields.daily_budget||0),fields.currency):"—"}</b> الميزانية المتوقعة</span></div>
    <label>حالة الحملة
     <select value={fields.status} onChange={e=>set("status",e.target.value as CampaignStatus)}>
      {Object.entries(campaignStatuses).map(([id,label])=><option key={id} value={id}>{label}</option>)}
     </select></label>
    <label className="media-span">تعليمات إضافية (اختياري)
     <textarea rows={2} value={fields.notes} maxLength={4000}
      onChange={e=>set("notes",e.target.value)} placeholder="تفاصيل الجمهور أو أي ملاحظات لأحمد"/></label>
    {error&&<p className="media-error media-span" role="alert">{error}</p>}
    <div className="media-form-actions media-span"><button type="button" className="media-outline" onClick={onClose}>إلغاء</button>
     <button type="submit" className="media-primary" disabled={saving}><CheckCircle2 size={17}/>
      {saving?"بنحفظ…":existing?"احفظي التعديلات":"احفظي وابعتي لأحمد"}</button></div>
   </form>
  </section>
 </div>;
}
type ReportEditorProps={campaign:Campaign;existing:Report|null;memberId:string;
 onClose:()=>void;onSaved:()=>Promise<void>};
function ReportEditor({campaign,existing,memberId,onClose,onSaved}:ReportEditorProps){
 const dateNow=today();
 const defaultDay=dateNow>=campaign.start_date&&dateNow<=campaign.end_date
  ?dateNow:dateNow>campaign.end_date?campaign.end_date:campaign.start_date;
 const [day,setDay]=useState(existing?.report_date||defaultDay);
 const [spent,setSpent]=useState(existing?String(existing.amount_spent):"");
 const [impressions,setImpressions]=useState(existing?String(existing.impressions):"");
 const [reach,setReach]=useState(existing?String(existing.reach):"");
 const [clicks,setClicks]=useState(existing?String(existing.clicks):"");
 const [results,setResults]=useState(existing?String(existing.results_count):"");
 const [notes,setNotes]=useState(existing?.notes||"");
 const [error,setError]=useState(""),[saving,setSaving]=useState(false);
 const draftKey="stc:media:report:"+memberId+":"+campaign.id;
 useEffect(()=>{
  if(existing)return;
  try{const saved=sessionStorage.getItem(draftKey);if(!saved)return;
   const r=JSON.parse(saved) as Record<string,string>;
   if(r.day>=campaign.start_date&&r.day<=campaign.end_date)setDay(r.day);
   setSpent(r.spent||"");setImpressions(r.impressions||"");setReach(r.reach||"");
   setClicks(r.clicks||"");setResults(r.results||"");setNotes(r.notes||"");
  }catch{}
 },[existing,draftKey,campaign.start_date,campaign.end_date]);
 useEffect(()=>{
  if(existing)return;
  try{sessionStorage.setItem(draftKey,JSON.stringify({day,spent,impressions,reach,clicks,results,notes}));}catch{}
 },[existing,draftKey,day,spent,impressions,reach,clicks,results,notes]);
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(saving)return;
  if(day<campaign.start_date||day>campaign.end_date){setError("التقرير لازم يكون بتاريخ داخل مدة الحملة.");return;}
  const values=[spent,impressions,reach,clicks,results];
  if(values.some(v=>v.trim()===""||!Number.isFinite(Number(v))||Number(v)<0)
   ||values.slice(1).some(v=>!Number.isSafeInteger(Number(v)))){
   setError("كمّل كل الأرقام. الأعداد لازم تكون صحيحة، ولو مفيش نتائج اكتب صفر.");return;
  }
  setSaving(true);setError("");
  try{
   const values={
    amount_spent:Number(spent),impressions:Number(impressions),reach:Number(reach),
    clicks:Number(clicks),results_count:Number(results),result_label:resultLabel(campaign.objective),
    notes:notes.trim(),status:"pending_review",
   };
   const response=existing
    ?await supabase.from("stc_media_results").update(values)
      .eq("id",existing.id).eq("status","changes_requested").select("id")
    :await supabase.from("stc_media_results").insert({
      ...values,campaign_id:campaign.id,report_date:day,submitted_by:memberId,
    }).select("id");
   if(response.error)throw response.error;
   if(!response.data?.length)throw new Error("التقرير اتغير، اعمل تحديث وجرب تاني.");
   try{sessionStorage.removeItem(draftKey);}catch{}
   await onSaved();showToast("نتايج الحملة اتبعتت لناردين للمراجعة.");
   onClose();
  }catch(ex){const msg=ex instanceof Error?ex.message:"حصلت مشكلة في تسجيل النتايج.";
   setError(msg);showToast(msg,"error");
  }finally{setSaving(false);}
 }
 const ctr=Number(impressions)>0?Number(clicks)/Number(impressions)*100:null;
 const cpr=Number(results)>0?Number(spent)/Number(results):null;
 return <div className="media-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)onClose();}}>
  <section className="media-modal media-report-modal" role="dialog" aria-modal="true" aria-labelledby="media-results-title">
   <header className="media-modal-top"><div><span className="media-eyebrow">DAILY CAMPAIGN PERFORMANCE</span>
    <h2 id="media-results-title">{existing?"عدّل النتايج وابعتهـا تاني":"سجّل نتايج الحملة"}</h2>
    <p>{campaign.title} · {objectiveLabel(campaign.objective)}</p></div>
    <button type="button" aria-label="إغلاق" onClick={onClose}><X size={21}/></button></header>
   <form className="media-form" onSubmit={e=>void save(e)}>
    {existing?.review_note&&<div className="media-review-note media-span">
     <strong>ملاحظات ناردين</strong><p>{existing.review_note}</p></div>}
    <label className="media-span">يوم التقرير
     <input required type="date" disabled={!!existing}
      min={campaign.start_date} max={campaign.end_date}
      value={day} onChange={e=>setDay(e.target.value)}/></label>
    <label>Amount Spent ({campaign.currency}) *
     <input required type="number" min={0} step="0.01" value={spent}
      onChange={e=>setSpent(e.target.value)} placeholder="Actual spend"/></label>
    <label>Impressions *
     <input required type="number" min={0} step={1} value={impressions}
      onChange={e=>setImpressions(e.target.value)} placeholder="0"/></label>
    <label>Reach *
     <input required type="number" min={0} step={1} value={reach}
      onChange={e=>setReach(e.target.value)} placeholder="0"/></label>
    <label>Clicks *
     <input required type="number" min={0} step={1} value={clicks}
      onChange={e=>setClicks(e.target.value)} placeholder="0"/></label>
    <label className="media-span">Actual {resultLabel(campaign.objective)} *
     <input required type="number" min={0} step={1} value={results}
      onChange={e=>setResults(e.target.value)} placeholder="عدد النتايج اللي اتحققت"/></label>
    <label className="media-span">ملاحظات أحمد (اختياري)
     <textarea rows={3} maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)}
      placeholder="إيه اللي نجح وإيه اللي محتاج تحسين؟"/></label>
    <div className="media-result-preview media-span">
      <span>Cost / Result</span><b>{cpr!==null?money(cpr,campaign.currency):"—"}</b>
      <span>CTR</span><b>{ctr!==null?ctr.toFixed(2)+"%":"—"}</b>
    </div>
    {error&&<p className="media-error media-span" role="alert">{error}</p>}
    <div className="media-form-actions media-span">
     <button type="button" className="media-outline" onClick={onClose}>إلغاء</button>
     <button type="submit" className="media-primary" disabled={saving}>
      <Send size={17}/>{saving?"بنبعت…":"ابعت النتايج لناردين"}</button>
    </div>
   </form>
  </section>
 </div>;
}
type Totals={spent:number;impressions:number;reach:number;clicks:number;results:number};
function totalReports(reports:Report[]):Totals{
 return reports.reduce((a,r)=>({
  spent:a.spent+Number(r.amount_spent),impressions:a.impressions+Number(r.impressions),
  reach:a.reach+Number(r.reach),clicks:a.clicks+Number(r.clicks),
  results:a.results+Number(r.results_count),
 }),{spent:0,impressions:0,reach:0,clicks:0,results:0});
}
const mediaCache=new Map<string,{at:number;profile:Profile;campaigns:Campaign[];reports:Report[]}>();
export function clearMediaBuyerCache(){mediaCache.clear();}
export default function MediaBuyerWorkspace({member,onBack}:{member:Member;onBack:()=>void}){
 const manager=member.role==="manager";
 const warmCache=mediaCache.get(member.id);
 const warm=warmCache&&Date.now()-warmCache.at<90_000?warmCache:null;
 const [profile,setProfile]=useState<Profile|null>(warm?.profile||null);
 const [campaigns,setCampaigns]=useState<Campaign[]>(warm?.campaigns||[]);
 const [reports,setReports]=useState<Report[]>(warm?.reports||[]);
 const [selected,setSelected]=useState<string|null>(()=>{
  try{return localStorage.getItem("stc:media:selected:"+member.id);}catch{return null;}
 });
 const [filter,setFilter]=useState<"all"|"active"|"review"|"completed">("all");
 const [editing,setEditing]=useState<Campaign|null|"new">(null);
 const [reportEditing,setReportEditing]=useState<Report|null|"new">(null);
 const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
 const [reviewBusy,setReviewBusy]=useState<string|null>(null);
 const [loading,setLoading]=useState(!warm),[error,setError]=useState("");
 const serial=useRef(0);
 const load=useCallback(async()=>{
  const id=++serial.current;
  const p=await supabase.from("stc_media_profiles").select("id,slug,display_name,member_id")
   .eq("slug","ahmed-el-khouly").maybeSingle();
  if(id!==serial.current)return;
  if(p.error||!p.data){setError(p.error?.message||"مساحة أحمد الخولي مش متاحة.");setLoading(false);return;}
  const owner=p.data as Profile;
  if(!manager&&owner.member_id!==member.id){setError("الحساب ده مش مربوط بمساحة الميديا باينج.");setLoading(false);return;}
  const c=await supabase.from("stc_media_campaigns").select("*").eq("profile_id",owner.id)
   .order("created_at",{ascending:false});
  if(id!==serial.current)return;
  if(c.error){setError(c.error.message);setLoading(false);return;}
  const list=(c.data||[]) as Campaign[];
  let entries:Report[]=[];
  if(list.length){
   const r=await supabase.from("stc_media_results").select("*").in("campaign_id",list.map(x=>x.id))
    .order("report_date",{ascending:false});
   if(id!==serial.current)return;
   if(r.error){setError(r.error.message);setLoading(false);return;}
   entries=(r.data||[]) as Report[];
  }
  mediaCache.set(member.id,{at:Date.now(),profile:owner,campaigns:list,reports:entries});
  setProfile(owner);setCampaigns(list);setReports(entries);setLoading(false);setError("");
 },[member.id,manager]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  const live=supabase.channel("stc-media-"+member.id)
   .on("postgres_changes",{schema:"public",table:"stc_media_profiles",event:"*"},()=>void load())
   .on("postgres_changes",{schema:"public",table:"stc_media_campaigns",event:"*"},()=>void load())
   .on("postgres_changes",{schema:"public",table:"stc_media_results",event:"*"},()=>void load())
   .subscribe();
  const intervalId=window.setInterval(()=>{if(document.visibilityState==="visible")void load();},30000);
  const focus=()=>{if(document.visibilityState==="visible")void load();};
  window.addEventListener("focus",focus);document.addEventListener("visibilitychange",focus);
  return()=>{serial.current++;clearInterval(intervalId);window.removeEventListener("focus",focus);
   document.removeEventListener("visibilitychange",focus);void supabase.removeChannel(live);};
 },[member.id,load]);
 const selectedCampaign=campaigns.find(x=>x.id===selected)||campaigns[0]||null;
 const visible=campaigns.filter(c=>filter==="all"||
  filter==="active"&&["planned","active","paused"].includes(c.status)||
  filter==="completed"&&c.status==="completed"||
  filter==="review"&&reports.some(r=>r.campaign_id===c.id&&r.status==="pending_review"));
 const campaignReports=selectedCampaign?reports.filter(r=>r.campaign_id===selectedCampaign.id):[];
 const accepted=reports.filter(r=>r.status==="approved");
 const total=totalReports(accepted);
 const pending=reports.filter(r=>r.status==="pending_review");
 const hasCampaigns=campaigns.length>0;
 const expected=campaigns.filter(c=>c.status!=="cancelled").reduce((n,c)=>
  n+Number(c.daily_budget)*interval(c.start_date,c.end_date),0);
 const mixedCurrency=new Set(campaigns.filter(c=>c.status!=="cancelled").map(c=>c.currency)).size>1;
 const displayCurrency=campaigns.find(c=>c.status!=="cancelled")?.currency||"EGP";
 const setSelectedId=(id:string)=>{
  setSelected(id);
  try{localStorage.setItem("stc:media:selected:"+member.id,id);}catch{}
 };
 async function review(report:Report,next:"approved"|"changes_requested"){
  if(!manager||reviewBusy)return;
  const note=(reviewNotes[report.id]||"").trim();
  if(next==="changes_requested"&&!note){showToast("اكتبي سبب التعديل الأول عشان يوصل لأحمد.","error");return;}
  setReviewBusy(report.id);
  try{
   const res=await supabase.from("stc_media_results").update({
    status:next,review_note:note,reviewed_by:member.id,
   }).eq("id",report.id).eq("status","pending_review").select("id");
   if(res.error)throw res.error;
   if(!res.data?.length)throw new Error("التقرير اتراجع من حساب تاني. اعملي تحديث.");
   await load();showToast(next==="approved"?"النتيجة اتعمدت بنجاح.":"اترجّعت لأحمد مع الملاحظة.");
  }catch(e){showToast(e instanceof Error?e.message:"فيه مشكلة في المراجعة.","error");}
  finally{setReviewBusy(null);}
 }
 const resultInSelected=campaignReports.filter(r=>r.status==="approved");
 const summary=totalReports(resultInSelected);
 const plannedBudget=selectedCampaign
  ?Number(selectedCampaign.daily_budget)*interval(selectedCampaign.start_date,selectedCampaign.end_date):0;
 const targetPct=selectedCampaign?.target_results?Math.min(100,summary.results/selectedCampaign.target_results*100):0;
 const budgetPct=plannedBudget>0?Math.max(0,Math.min(100,summary.spent/plannedBudget*100)):0;
 const todayAlready=selectedCampaign?campaignReports.find(r=>r.report_date===today()):null;
 return <div className="media-workspace" dir="rtl">
  <header className="media-topbar"><BrandLockup size="compact"/>
   <div className="media-topbar-name"><strong>Media Buying</strong>
    <small>STC Marketing Flow · Ahmed El Kholy</small></div>
   <div className="media-topbar-actions">
    <span className="media-live"><span/> Live</span>
    <button type="button" className="media-outline" onClick={()=>void load()} aria-label="تحديث"><RefreshCw size={16}/><span>تحديث</span></button>
    <button type="button" className="media-outline" onClick={onBack}>
      {manager?<ArrowRight size={17}/>:<LogOut size={17}/>} {manager?"رجوع للتيم":"تسجيل خروج"}</button>
   </div>
  </header>
  <main className="media-container">
   <section className="media-hero">
    <div><span className="media-eyebrow">{manager?"NARDINE / MEDIA BUYING":"AHMED / MEDIA BUYING"}</span>
     <h1>{manager?"متابعة الحملات الإعلانية":"حملاتك الإعلانية"}</h1>
     <p>{manager?
      "كل حملة فيها البوست والهدف والميزانية والمدّة، ونتايج أحمد اليومية بتوصل لك للمراجعة.":
      "هنا الـCampaign Brief من ناردين، وتسجيل النتايج الفعلية وملاحظاتك لكل يوم."}</p>
    </div>
    {manager&&!!profile&&<button className="media-primary" type="button" onClick={()=>setEditing("new")}>
     <Plus size={18}/> Campaign جديدة</button>}
   </section>
   {error&&<p className="media-error" role="alert">{error}</p>}
   {loading&&!profile&&<div className="media-empty">بنحمّل بيانات الحملات…</div>}
   {profile&&<>
    <section className="media-overview">
     <article><span><Megaphone size={20}/></span><small>إجمالي الحملات</small><strong>{campaigns.length}</strong><p>حملات أحمد الخولي</p></article>
     <article><span><Wallet size={20}/></span><small>ميزانية الحملات المخططة</small>
      <strong>{mixedCurrency?"عملات مختلفة":money(expected,displayCurrency)}</strong>
      <p>{mixedCurrency?"تنبيه: حملات بعملات مختلفة — متجمعش المبالغ":"Budget / Day × عدد الأيام"}</p></article>
     <article><span><Target size={20}/></span><small>نتايج معتمدة</small><strong>{qty(total.results)}</strong><p>من تقارير ناردين وافقت عليها</p></article>
     <article><span><Clock3 size={20}/></span><small>مستنية المراجعة</small><strong>{pending.length}</strong><p>تحديثات أحمد اليومية</p></article>
    </section>
    {manager&&pending.length>0&&<section className="media-review-box"><div className="media-section-heading">
      <div><span className="media-eyebrow">REVIEW INBOX</span><h2>نتايج محتاجة مراجعة ناردين</h2></div>
      <span className="media-count">{pending.length} مستني</span></div>
     <div className="media-pending-list">{pending.map(r=>{
      const campaign=campaigns.find(c=>c.id===r.campaign_id);
      return <article key={r.id} className="media-review-item">
       <div className="media-review-item-head"><b>{campaign?.title||"Campaign"}</b><small>{r.report_date}</small></div>
       <div className="media-review-numbers">
        <span>Actual Spent <b>{money(Number(r.amount_spent),campaign?.currency||"EGP")}</b></span>
        <span>{r.result_label} <b>{qty(r.results_count)}</b></span>
        <span>Clicks <b>{qty(r.clicks)}</b></span>
       </div>
       {r.notes&&<p className="media-submitted-note">{r.notes}</p>}
       <textarea aria-label="ملاحظة ناردين" rows={2} placeholder="لو محتاجة تعديل، اكتبي لأحمد إيه المطلوب…"
        maxLength={3000} value={reviewNotes[r.id]??""} onChange={e=>setReviewNotes(v=>({...v,[r.id]:e.target.value}))}/>
       <div className="media-review-controls"><button type="button" className="media-outline"
        disabled={reviewBusy===r.id} onClick={()=>void review(r,"changes_requested")}>ارجّعي للتعديل</button>
        <button type="button" className="media-primary" disabled={reviewBusy===r.id}
        onClick={()=>void review(r,"approved")}><CheckCircle2 size={16}/> اعتمدي النتايج</button></div>
      </article>;
     })}</div>
    </section>}
    <section className="media-section">
     <div className="media-section-heading"><div><span className="media-eyebrow">CAMPAIGN OVERVIEW</span>
      <h2>الحملات الإعلانية</h2><p>اضغط على أي حملة عشان تفتح البريف والنتايج بالتفصيل.</p></div></div>
     <nav className="media-filterbar" aria-label="فلترة الحملات"><Filter size={17}/>
      {([
       ["all","الكل"],["active","شغالة ومخططة"],
       ["review","مستنية مراجعة"],["completed","انتهت"]
      ] as const).map(([id,label])=><button type="button" key={id} className={filter===id?"active":""}
       onClick={()=>setFilter(id)}>{label}</button>)}</nav>
     {!hasCampaigns&&<div className="media-empty"><Megaphone size={33}/>
       <strong>{manager?"لسه مفيش Campaigns":"ناردين لسه ماحطتش Campaigns ليك"}</strong>
       <p>{manager?"ابدئي بإضافة أول حملة، وأحمد هيشوف المطلوب عنده.":"أول ما ناردين تضيف حملة، هتظهر هنا بتفاصيلها والميزانية."}</p>
       {manager&&<button className="media-primary" onClick={()=>setEditing("new")}><Plus size={17}/> أضيفي أول Campaign</button>}
      </div>}
     {!!hasCampaigns&&!visible.length&&<div className="media-empty">مفيش حملات مطابقة للفلتر ده.</div>}
     <div className="media-campaign-grid">{visible.map(c=>{
      const approvedFor=totalReports(reports.filter(r=>r.campaign_id===c.id&&r.status==="approved"));
      const awaiting=reports.filter(r=>r.campaign_id===c.id&&r.status==="pending_review").length;
      const budget=Number(c.daily_budget)*interval(c.start_date,c.end_date);
      return <button key={c.id} type="button" onClick={()=>setSelectedId(c.id)}
       className={"media-campaign-card "+(selectedCampaign?.id===c.id?"selected":"")}>
       <div className="media-card-head"><span className={"media-status media-status-"+c.status}>{campaignStatuses[c.status]}</span>
        <small>{c.platform} · {c.brand}</small></div>
       <h3>{c.title}</h3><p className="media-post">{c.post_label}</p>
       <div className="media-card-meta"><span><Target size={14}/>{objectiveLabel(c.objective)}</span>
        <span><CalendarDays size={14}/>{c.start_date} — {c.end_date}</span></div>
       <div className="media-card-stats"><div><small>Budget / Day</small><b>{money(Number(c.daily_budget),c.currency)}</b></div>
        <div><small>إجمالي متوقع</small><b>{money(budget,c.currency)}</b></div></div>
       <div className="media-card-bottom"><span>{qty(approvedFor.results)} {resultLabel(c.objective)} معتمدة</span>
        {awaiting>0&&<b>{awaiting} للمراجعة</b>}<ChevronLeft size={18}/></div>
      </button>;
     })}</div>
    </section>
    {selectedCampaign&&<section className="media-detail">
      <div className="media-detail-title"><div><span className="media-eyebrow">CAMPAIGN DETAILS</span>
       <h2>{selectedCampaign.title}</h2><p>{selectedCampaign.post_label} · {selectedCampaign.brand} · {selectedCampaign.platform}</p></div>
       {manager&&<button className="media-outline" type="button" onClick={()=>setEditing(selectedCampaign)}>
        <Pencil size={16}/> تعديل البريف</button>}
      </div>
      <div className="media-detail-info">
       <div><small>هدف الإعلان</small><strong>{objectiveLabel(selectedCampaign.objective)}</strong>
        <p>{selectedCampaign.goal_notes}</p></div>
       <div><small>المدة</small><strong>{interval(selectedCampaign.start_date,selectedCampaign.end_date)} يوم</strong>
        <p>{selectedCampaign.start_date} — {selectedCampaign.end_date}</p></div>
       <div><small>الميزانية اليومية</small><strong>{money(Number(selectedCampaign.daily_budget),selectedCampaign.currency)}</strong>
        <p>الميزانية الكاملة: {money(plannedBudget,selectedCampaign.currency)}</p></div>
       <div><small>الهدف العددي</small><strong>{selectedCampaign.target_results===null?"مش محدد":qty(selectedCampaign.target_results)}</strong>
        <p>{resultLabel(selectedCampaign.objective)}</p></div>
      </div>
      {selectedCampaign.notes&&<div className="media-brief-note"><strong>تعليمات من ناردين:</strong> {selectedCampaign.notes}</div>}
      {validLink(selectedCampaign.post_url)&&<a className="media-post-link" target="_blank" rel="noopener noreferrer"
       href={validLink(selectedCampaign.post_url)||"#"}><ExternalLink size={17}/> افتح البوست الأصلي</a>}
      <div className="media-kpi-strip">
       <div><span><Wallet size={18}/> Actual Spent</span><strong>{money(summary.spent,selectedCampaign.currency)}</strong></div>
       <div><span><Activity size={18}/> {resultLabel(selectedCampaign.objective)}</span><strong>{qty(summary.results)}</strong></div>
       <div><span><MousePointerClick size={18}/> Clicks</span><strong>{qty(summary.clicks)}</strong></div>
       <div><span><BarChart3 size={18}/> Cost / Result</span>
         <strong>{summary.results>0?money(summary.spent/summary.results,selectedCampaign.currency):"—"}</strong></div>
       <div><span><TrendingUp size={18}/> CTR</span><strong>{summary.impressions>0?(summary.clicks/summary.impressions*100).toFixed(2)+"%":"—"}</strong></div>
      </div>
      <div className="media-target-progress">
       <div className="media-target-progress-label"><strong>الميزانية المعتمدة المصروفة</strong>
        <span>{money(summary.spent,selectedCampaign.currency)} / {money(plannedBudget,selectedCampaign.currency)}</span>
       </div><div className="media-progress-track media-budget-track">
        <span style={{width:budgetPct+"%"}}/></div>
       <small>الأرقام دي مجموع المصروف في التقارير اللي ناردين اعتمدتها، مش بيانات مباشرة من منصة الإعلانات.</small>
      </div>
      {selectedCampaign.target_results!==null&&selectedCampaign.target_results>0&&
        <div className="media-target-progress"><div className="media-target-progress-label">
         <strong>التقدم في الهدف</strong><span>{qty(summary.results)} / {qty(selectedCampaign.target_results)} · {targetPct.toFixed(0)}%</span>
        </div><div className="media-progress-track"><span style={{width:targetPct+"%"}}/></div>
        <small>التقدم بيتحسب من النتائج المعتمدة بس.</small></div>}
      <div className="media-results-heading"><h3><BarChart3 size={19}/> تقرير النتايج اليومية</h3>
       {!manager&&["active","paused","completed"].includes(selectedCampaign.status)&&
       <button type="button" className="media-primary" onClick={()=>{
        if(todayAlready){
         if(todayAlready.status==="changes_requested")setReportEditing(todayAlready);
         else showToast("نتايج النهارده متسجلة بالفعل. اختار يوم مختلف أو راجع حالة التقرير.","info");
        }else setReportEditing("new");
       }}><Plus size={17}/> سجّل نتايج يوم</button>}</div>
      {!campaignReports.length&&<p className="media-results-empty">
        {manager?"لسه أحمد ماقدّمش نتائج للحملة دي.":"لسه مفيش نتائج متسجلة. بعد تشغيل الإعلان سجّل أرقام كل يوم."}</p>}
      {!!campaignReports.length&&<div className="media-daily-list">
       {campaignReports.map(r=><article className="media-daily-row" key={r.id}>
        <div className="media-daily-date"><CalendarDays size={17}/><strong>{r.report_date}</strong>
         <span className={"media-review-status media-review-status-"+r.status}>{reportStatuses[r.status]}</span></div>
        <div className="media-daily-values">
         <span>Spent <b>{money(Number(r.amount_spent),selectedCampaign.currency)}</b></span>
         <span>Impressions <b>{qty(r.impressions)}</b></span>
         <span>Reach <b>{qty(r.reach)}</b></span>
         <span>Clicks <b>{qty(r.clicks)}</b></span>
         <span>{r.result_label} <b>{qty(r.results_count)}</b></span>
        </div>
        {r.notes&&<p>{r.notes}</p>}
        {r.review_note&&<p className="media-review-feedback"><b>ملاحظة ناردين:</b> {r.review_note}</p>}
        {!manager&&r.status==="changes_requested"&&<button type="button" className="media-outline"
         onClick={()=>setReportEditing(r)}><Pencil size={16}/> عدّل النتايج وابعتهـا تاني</button>}
       </article>)}
      </div>}
    </section>}
    {manager&&<p className="media-access-note">ناردين بتحدد تفاصيل الحملة وبتراجع النتايج. تسجيل الأرقام الفعلية متاح لأحمد فقط. مفيش حذف للحملات عشان نحافظ على سجل الإعلانات.</p>}
   </>}
  </main>
  {profile&&manager&&editing!==null&&<CampaignEditor profile={profile} memberId={member.id}
    existing={editing==="new"?null:editing}
    hasReports={editing!=="new"&&reports.some(r=>r.campaign_id===editing.id)}
    onSaved={load} onClose={()=>setEditing(null)}/>}
  {profile&&!manager&&selectedCampaign&&reportEditing!==null&&<ReportEditor
    campaign={selectedCampaign} existing={reportEditing==="new"?null:reportEditing}
    memberId={member.id} onSaved={load} onClose={()=>setReportEditing(null)}/>}
 </div>;
}
