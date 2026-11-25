"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import type {FormEvent} from "react";
import {
  ArrowRight,CalendarDays,CheckCircle2,ChevronLeft,ClipboardCheck,Clock3,
  ExternalLink,FileCheck2,Link2,LogOut,Megaphone,MessageSquareText,
  Pencil,Plus,RefreshCw,Send,Trash2,Wallet,X,
} from "lucide-react";
import type {Member} from "@/lib/domain";
import {supabase} from "@/lib/supabase";
import {showToast} from "@/lib/toasts";
import {confirmInCurrentLanguage} from "./app-language-provider";
import BrandLockup from "./brand-lockup";
import "./media-buyer-workspace.css";

type Profile={id:string;slug:string;display_name:string;member_id:string|null};
type Brief={
 id:string;profile_id:string;post_url:string;goal:string;instructions:string;
 version:number;created_at:string;updated_at:string;deleted_at:string|null;
};
type ReviewStatus="pending_review"|"approved"|"changes_requested";
type Submission={
 id:string;brief_id:string;campaign_post:string;campaign_goal:string;
 daily_budget:number|null;currency:string;start_date:string|null;end_date:string|null;
 results:string;note:string;status:ReviewStatus;review_note:string;
 submitted_by:string;reviewed_by:string|null;created_at:string;updated_at:string;
};
type AnswerForm={
 campaign_post:string;campaign_goal:string;daily_budget:string;currency:string;
 start_date:string;end_date:string;results:string;note:string;
};
const initialAnswers:AnswerForm={
 campaign_post:"",campaign_goal:"",daily_budget:"",currency:"EGP",
 start_date:"",end_date:"",results:"",note:"",
};
const allowedCurrencies=["EGP","USD","EUR","SAR","AED","OTHER"];
const statusCopy:Record<ReviewStatus,string>={
 pending_review:"مستني مراجعة ناردين",
 approved:"معتمد",
 changes_requested:"مطلوب تعديل",
};
const formatNumber=(n:number)=>new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(n);
const formatDay=(day:string|null)=>day||"—";
const shortLink=(url:string)=>{
 try{const value=new URL(url);return value.hostname.replace(/^www\./,"")+value.pathname.slice(0,40);}
 catch{return url;}
};
const validUrl=(value:string)=>{try{const url=new URL(value);return ["https:","http:"].includes(url.protocol)&&!/\s/.test(value);}catch{return false;}};
const daysBetween=(start:string,end:string)=>Math.floor(
 (Date.parse(end+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/86400000
)+1;
const dateTime=(value:string)=>new Date(value).toLocaleString("ar-EG",{
 timeZone:"Africa/Cairo",day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit",
});
const emptyValue="لم يحدد";
const briefNote=(brief:Brief)=>[brief.goal,brief.instructions].filter(Boolean).join("\n");
const briefDraftKey="stc:media:v2:brief-draft:";
const answerDraftKey="stc:media:v2:answer-draft:";
let cache=new Map<string,{at:number;profile:Profile;briefs:Brief[];submissions:Submission[]}>();
export function clearMediaBuyerCache(){cache.clear();}

function Modal({title,description,onClose,children}:{
 title:string;description:string;onClose:()=>void;children:React.ReactNode;
}){
 return <div className="mb2-overlay" onMouseDown={event=>{
   if(event.target===event.currentTarget)onClose();
 }}>
  <section role="dialog" aria-modal="true" aria-label={title} className="mb2-modal">
   <header className="mb2-modal-head"><div>
    <span className="mb2-eyebrow">STC / MEDIA BUYING</span>
    <h2>{title}</h2><p>{description}</p>
   </div><button type="button" aria-label="إغلاق" onClick={onClose}><X size={21}/></button></header>
   {children}
  </section>
 </div>;
}

function BriefEditor({profile,member,existing,onClose,onSaved}:{
 profile:Profile;member:Member;existing:Brief|null;
 onClose:()=>void;onSaved:()=>Promise<void>;
}){
 const draftKey=briefDraftKey+member.id;
 const [fields,setFields]=useState(()=>{
  if(existing)return {post_url:existing.post_url,instructions:briefNote(existing)};
  try{
   const stored=sessionStorage.getItem(draftKey);
   if(stored){
    const parsed=JSON.parse(stored) as Partial<{post_url:string;instructions:string}>;
    return {post_url:parsed.post_url||"",instructions:parsed.instructions||""};
   }
  }catch{}
  return {post_url:"",instructions:""};
 });
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  if(existing)return;
  try{sessionStorage.setItem(draftKey,JSON.stringify(fields));}catch{}
 },[fields,existing,draftKey]);
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  if(!validUrl(fields.post_url.trim())){setError("اكتبي رابط بوست صحيح يبدأ بـ https://");return;}
  setBusy(true);setError("");
  try{
   const values={post_url:fields.post_url.trim(),goal:"",instructions:fields.instructions.trim()};
   const result=existing?
    await supabase.from("stc_media_briefs").update(values).eq("id",existing.id)
      .eq("version",existing.version).is("deleted_at",null).select("id"):
    await supabase.from("stc_media_briefs").insert({
     ...values,profile_id:profile.id,created_by:member.id,
    }).select("id");
   if(result.error)throw result.error;
   if(!result.data?.length)throw new Error("التكليف اتعدل من مكان تاني. حدّثي الصفحة وجربي تاني.");
   try{sessionStorage.removeItem(draftKey);}catch{}
   await onSaved();
   showToast(existing?"تم حفظ تعديل التكليف.":"اتبعَت كامبين جديدة لأحمد الخولي.");
   onClose();
  }catch(e){const message=e instanceof Error?e.message:"مقدرناش نحفظ التكليف.";
   setError(message);showToast(message,"error");
  }finally{setBusy(false);}
 }
 return <Modal title={existing?"تعديل تكليف الحملة":"تكليف Campaign جديدة"}
  description="خانتين بس: لينك البوست إجباري، والهدف والتعليمات في ملاحظة واحدة اختيارية." onClose={onClose}>
  <form className="mb2-form" onSubmit={event=>void save(event)}>
   <label className="mb2-field">01 · لينك البوست <span className="mb2-required">*</span>
    <input required type="url" dir="ltr" maxLength={2000} value={fields.post_url}
     onChange={e=>setFields(v=>({...v,post_url:e.target.value}))}
     placeholder="https://www.facebook.com/..." autoComplete="off"/>
    <small>البوست اللي أحمد هيعمل عليه الإعلان</small>
   </label>
   <label className="mb2-field">02 · الهدف والملاحظات <span className="mb2-optional">اختياري</span>
    <textarea rows={4} maxLength={4000} value={fields.instructions}
     onChange={e=>setFields(v=>({...v,instructions:e.target.value}))}
     placeholder="مثلاً: الهدف رسائل أو Leads — شغّل الإعلان على Meta Ads — وأي تعليمات لأحمد"/>
    <small>اكتبي الهدف، التطبيق اللي هيتعمل عليه الإعلان، أو أي تعليمات في مكان واحد. ممكن تسيبيها فاضية.</small>
   </label>
   {error&&<p className="mb2-error" role="alert">{error}</p>}
   <div className="mb2-form-actions"><button type="button" className="mb2-secondary" onClick={onClose}>إلغاء</button>
    <button type="submit" className="mb2-primary" disabled={busy}>
     <Send size={17}/>{busy?"بنحفظ…":existing?"احفظي التعديل":"ابعتي الكامبين لأحمد"}
    </button>
   </div>
  </form>
 </Modal>;
}

function AnswerEditor({brief,member,existing,onClose,onSaved}:{
 brief:Brief;member:Member;existing:Submission|null;
 onClose:()=>void;onSaved:()=>Promise<void>;
}){
 const draftKey=answerDraftKey+member.id+":"+brief.id;
 const [fields,setFields]=useState<AnswerForm>(()=>{
  const fromRecord=existing?{
   campaign_post:existing.campaign_post,campaign_goal:existing.campaign_goal,
   daily_budget:existing.daily_budget===null?"":String(existing.daily_budget),
   currency:existing.currency,start_date:existing.start_date||"",end_date:existing.end_date||"",
   results:existing.results,note:existing.note,
  }:initialAnswers;
  try{
   const raw=sessionStorage.getItem(draftKey);
   if(raw){
    const parsed=JSON.parse(raw) as Partial<AnswerForm>;
    return {...fromRecord,...parsed};
   }
  }catch{}
  return {...fromRecord};
 });
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{try{sessionStorage.setItem(draftKey,JSON.stringify(fields));}catch{}},[draftKey,fields]);
 const set=(key:keyof AnswerForm,value:string)=>setFields(old=>({...old,[key]:value}));
 const duration=fields.start_date&&fields.end_date&&fields.end_date>=fields.start_date?
  daysBetween(fields.start_date,fields.end_date):null;
 const estimate=fields.daily_budget.trim()!==""&&duration!==null?
  Number(fields.daily_budget)*duration:null;
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  const amount=fields.daily_budget.trim()===""?null:Number(fields.daily_budget);
  if(amount!==null&&(!Number.isFinite(amount)||amount<0||amount>100000000)){
   setError("الميزانية اليومية لازم تكون رقم صحيح أو عشري غير سالب.");return;
  }
  if(fields.start_date&&fields.end_date&&fields.end_date<fields.start_date){
   setError("تاريخ النهاية مينفعش يكون قبل البداية.");return;
  }
  setBusy(true);setError("");
  try{
   const values={
    campaign_post:fields.campaign_post.trim(),campaign_goal:fields.campaign_goal.trim(),
    daily_budget:amount,currency:fields.currency,
    start_date:fields.start_date||null,end_date:fields.end_date||null,
    results:fields.results.trim(),note:fields.note.trim(),status:"pending_review",
   };
   const response=existing?
    await supabase.from("stc_media_submissions")
     .update({...values,review_note:"",reviewed_by:null})
     .eq("id",existing.id).eq("status","changes_requested").select("id"):
    await supabase.from("stc_media_submissions")
     .insert({...values,brief_id:brief.id,submitted_by:member.id}).select("id");
   if(response.error)throw response.error;
   if(!response.data?.length)throw new Error("التقرير اتغير من مكان تاني. حدّث الصفحة.");
   try{sessionStorage.removeItem(draftKey);}catch{}
   await onSaved();showToast("التقرير اتبعت لناردين بنجاح، ومستني مراجعتها.");
   onClose();
  }catch(e){const message=e instanceof Error?e.message:"مقدرناش نبعت التقرير.";
   setError(message);showToast(message,"error");
  }finally{setBusy(false);}
 }
 return <Modal title={existing?"عدّل إجاباتك وابعتهـا تاني":"تقرير الكامبين — 5 أسئلة"}
  description="جاوب عن اللي تعرفه فقط؛ كل الإجابات والملاحظة اختيارية." onClose={onClose}>
  <form className="mb2-form mb2-answer-form" onSubmit={event=>void submit(event)}>
   <div className="mb2-brief-reminder"><span>التكليف الأصلي من ناردين</span>
    <a dir="ltr" href={brief.post_url} target="_blank" rel="noopener noreferrer">
     {shortLink(brief.post_url)} <ExternalLink size={14}/></a>
    {briefNote(brief)&&<p className="mb2-brief-reminder-note">{briefNote(brief)}</p>}
   </div>
   {existing?.review_note&&<p className="mb2-feedback"><strong>ملاحظة ناردين:</strong> {existing.review_note}</p>}
   <label className="mb2-field"><span className="mb2-question-index">01</span> Campaign on which post?
    <input type="text" maxLength={2000} dir="auto" value={fields.campaign_post}
     onChange={e=>set("campaign_post",e.target.value)} placeholder="لينك البوست أو وصف البوست"/>
    <small>ممكن تستخدم نفس لينك ناردين أو تكتب بوست مختلف لو اتغير</small>
   </label>
   <label className="mb2-field"><span className="mb2-question-index">02</span> Goal?
    <textarea rows={2} maxLength={2500} value={fields.campaign_goal}
     onChange={e=>set("campaign_goal",e.target.value)}
     placeholder="إيه الهدف اللي اتعمل عليه الإعلان؟"/>
   </label>
   <div className="mb2-budget-fields">
    <label className="mb2-field"><span className="mb2-question-index">03</span> How much per day?
     <input type="number" min="0" max="100000000" step="0.01" value={fields.daily_budget}
      onChange={e=>set("daily_budget",e.target.value)} placeholder="الميزانية في اليوم"/>
    </label>
    <label className="mb2-field">العملة
     <select value={fields.currency} onChange={e=>set("currency",e.target.value)}>
      {allowedCurrencies.map(currency=><option value={currency} key={currency}>{currency}</option>)}
     </select>
    </label>
   </div>
   <div className="mb2-range-fields">
    <span className="mb2-range-title"><span className="mb2-question-index">04</span> How long? From / To?</span>
    <label className="mb2-field">من يوم
     <input type="date" value={fields.start_date} onChange={e=>set("start_date",e.target.value)}/>
    </label>
    <label className="mb2-field">ليوم
     <input type="date" min={fields.start_date||undefined} value={fields.end_date}
      onChange={e=>set("end_date",e.target.value)}/>
    </label>
    {duration!==null&&<small className="mb2-duration-hint">{duration} يوم
      {estimate!==null&&<> · إجمالي الميزانية المتوقعة: {formatNumber(estimate)} {fields.currency}</>}
    </small>}
   </div>
   <label className="mb2-field"><span className="mb2-question-index">05</span> Results?
    <textarea rows={3} maxLength={4000} value={fields.results}
     onChange={e=>set("results",e.target.value)}
     placeholder="اكتب النتايج: رسائل / Leads / Clicks / مبيعات أو أي أرقام متاحة"/>
   </label>
   <label className="mb2-field">ملاحظة إضافية <span className="mb2-optional">اختياري</span>
    <textarea rows={2} maxLength={4000} value={fields.note}
     onChange={e=>set("note",e.target.value)} placeholder="أي تفاصيل أو ملاحظات لأستاذة ناردين"/>
   </label>
   <p className="mb2-draft-notice"><CheckCircle2 size={16}/> إجاباتك بتتحفظ مؤقتًا لحد ما تبعتها.</p>
   {error&&<p className="mb2-error" role="alert">{error}</p>}
   <div className="mb2-form-actions"><button type="button" className="mb2-secondary" onClick={onClose}>إلغاء</button>
    <button type="submit" className="mb2-primary" disabled={busy}><Send size={17}/>
     {busy?"بنبعت…":"ابعت التقرير لناردين"}</button>
   </div>
  </form>
 </Modal>;
}

function AnswerCard({index,question,answer,emphasis=false,link=false}:{
 index:number;question:string;answer:string;emphasis?:boolean;link?:boolean;
}){
 const text=answer.trim();
 return <article className={"mb2-qa-card "+(emphasis?"mb2-qa-card--emphasis":"")}>
  <span className="mb2-qa-index">{String(index).padStart(2,"0")}</span>
  <span className="mb2-qa-question">{question}</span>
  {link&&validUrl(text)?
   <a dir="ltr" target="_blank" rel="noopener noreferrer" href={text} className="mb2-qa-answer mb2-qa-link">
    {shortLink(text)} <ExternalLink size={16}/></a>:
   <strong className={"mb2-qa-answer "+(!text?"mb2-qa-unanswered":"")} dir="auto">
    {text||emptyValue}</strong>}
 </article>;
}

function AnswerReport({brief,submission,manager,onRequestChanges,onApproved,busy}:{
 brief:Brief;submission:Submission;manager:boolean;busy:boolean;
 onRequestChanges:(note:string)=>void;onApproved:()=>void;
}){
 const [feedback,setFeedback]=useState("");
 const duration=submission.start_date&&submission.end_date?
  daysBetween(submission.start_date,submission.end_date):null;
 const amount=submission.daily_budget;
 const total=amount!==null&&duration!==null?amount*duration:null;
 const budgetLabel=amount===null?"":formatNumber(Number(amount))+" "+submission.currency;
 const schedule=[submission.start_date?formatDay(submission.start_date):"—",
  submission.end_date?formatDay(submission.end_date):"—"].join("   →   ");
 return <section className="mb2-report" aria-label="تقرير إجابات أحمد">
  <div className="mb2-report-head">
   <div><span className="mb2-eyebrow">CAMPAIGN PERFORMANCE REPORT</span>
    <h3>تقرير أحمد الخولي</h3>
    <p>الأسئلة الخمسة وإجابات أحمد عن الكامبين</p>
   </div>
   <span className={"mb2-status mb2-status--"+submission.status}>{statusCopy[submission.status]}</span>
  </div>
  <div className="mb2-report-meta"><span><CalendarDays size={15}/> اتبعت: {dateTime(submission.created_at)}</span>
   <span><Clock3 size={15}/> آخر تحديث: {dateTime(submission.updated_at)}</span></div>
  <div className="mb2-report-grid">
   <AnswerCard index={1} question="Campaign on which post?" answer={submission.campaign_post} link/>
   <AnswerCard index={2} question="Goal?" answer={submission.campaign_goal}/>
   <AnswerCard index={3} question="How much per day?" answer={budgetLabel} emphasis/>
   <article className="mb2-qa-card mb2-qa-card--schedule">
    <span className="mb2-qa-index">04</span>
    <span className="mb2-qa-question">How long? From / To?</span>
    <div className="mb2-qa-dates">
     <span>From <strong>{submission.start_date||"—"}</strong></span>
     <span>To <strong>{submission.end_date||"—"}</strong></span>
    </div>
    {duration!==null&&<p>{duration} يوم{total!==null&&<> · <b>ميزانية تقديرية: {formatNumber(total)} {submission.currency}</b></>}</p>}
    {!submission.start_date&&!submission.end_date&&<small>{emptyValue}</small>}
   </article>
   <AnswerCard index={5} question="Results?" answer={submission.results} emphasis/>
  </div>
  {submission.note&&<div className="mb2-reporter-note"><MessageSquareText size={18}/>
   <div><strong>ملاحظة أحمد</strong><p dir="auto">{submission.note}</p></div></div>}
  {submission.review_note&&<div className="mb2-feedback"><strong>ملاحظة ناردين:</strong> {submission.review_note}</div>}
  {manager&&submission.status==="pending_review"&&<div className="mb2-review-panel">
   <h4><ClipboardCheck size={18}/> مراجعة التقرير</h4>
   <label>ملاحظتك لأحمد (اختياري للموافقة، ضروري لو هترجّعيه)
    <textarea rows={2} value={feedback} onChange={e=>setFeedback(e.target.value)}
     maxLength={3000} placeholder="اكتبي التعديل المطلوب من أحمد…"/>
   </label>
   <div className="mb2-form-actions">
    <button className="mb2-secondary" type="button" disabled={busy} onClick={()=>{
     if(!feedback.trim()){showToast("اكتبي سبب التعديل قبل ما ترجعي التقرير.","error");return;}
     onRequestChanges(feedback.trim());
    }}>ارجّعي للتعديل</button>
    <button className="mb2-primary" type="button" disabled={busy} onClick={onApproved}>
     <CheckCircle2 size={16}/> اعتمدي التقرير</button>
   </div>
  </div>}
  {!manager&&submission.status==="pending_review"&&<p className="mb2-waiting-note">
   <Clock3 size={18}/> التقرير وصل لناردين ومستني مراجعتها.
  </p>}
  {brief.deleted_at&&<p className="mb2-waiting-note">التكليف ده محفوظ في سجل الحذف.</p>}
 </section>;
}

export default function MediaBuyerWorkspace({member,onBack}:{member:Member;onBack:()=>void}){
 const manager=member.role==="manager";
 const warm=cache.get(member.id);
 const initial=warm&&Date.now()-warm.at<90000?warm:null;
 const [profile,setProfile]=useState<Profile|null>(initial?.profile||null);
 const [briefs,setBriefs]=useState<Brief[]>(initial?.briefs||[]);
 const [submissions,setSubmissions]=useState<Submission[]>(initial?.submissions||[]);
 const [activeId,setActiveId]=useState<string|null>(()=>{
  try{return localStorage.getItem("stc:media:v2:selected:"+member.id);}catch{return null;}
 });
 const [filter,setFilter]=useState<"all"|"todo"|"review"|"finished">("all");
 const [editing,setEditing]=useState<Brief|null|"new">(null);
 const [answering,setAnswering]=useState<Brief|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(!initial);
 const serial=useRef(0);
 const load=useCallback(async()=>{
  const seq=++serial.current;
  const p=await supabase.from("stc_media_profiles").select("id,slug,display_name,member_id")
   .eq("slug","ahmed-el-khouly").maybeSingle();
  if(seq!==serial.current)return;
  if(p.error||!p.data){setError(p.error?.message||"حساب أحمد مش مربوط بقسم الميديا باينج.");
   setLoading(false);return;}
  const owner=p.data as Profile;
  if(!manager&&owner.member_id!==member.id){setError("الحساب ده مش مصرح له بفتح Media Buying.");
   setLoading(false);return;}
  const [b,s]=await Promise.all([
   supabase.from("stc_media_briefs").select("*").eq("profile_id",owner.id)
    .is("deleted_at",null).order("created_at",{ascending:false}),
   supabase.from("stc_media_submissions").select("*").order("created_at",{ascending:false}),
  ]);
  if(seq!==serial.current)return;
  if(b.error||s.error){setError(b.error?.message||s.error?.message||"مقدرناش نحمّل الحملات.");
   setLoading(false);return;}
  const list=(b.data||[]) as Brief[];
  const activeIds=new Set(list.map(brief=>brief.id));
  const reportList=((s.data||[]) as Submission[]).filter(report=>activeIds.has(report.brief_id));
  cache.set(member.id,{at:Date.now(),profile:owner,briefs:list,submissions:reportList});
  setProfile(owner);setBriefs(list);setSubmissions(reportList);
  setLoading(false);setError("");
 },[manager,member.id]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  const channel=supabase.channel("stc-media-v2-"+member.id)
   .on("postgres_changes",{event:"*",schema:"public",table:"stc_media_briefs"},()=>void load())
   .on("postgres_changes",{event:"*",schema:"public",table:"stc_media_submissions"},()=>void load())
   .subscribe();
  const poll=window.setInterval(()=>{
   if(document.visibilityState==="visible")void load();
  },30000);
  const refreshOnFocus=()=>{if(document.visibilityState==="visible")void load();};
  window.addEventListener("focus",refreshOnFocus);
  return()=>{
   serial.current++;window.clearInterval(poll);
   window.removeEventListener("focus",refreshOnFocus);void supabase.removeChannel(channel);
  };
 },[member.id,load]);
 const byBrief=useMemo(()=>new Map(submissions.map(s=>[s.brief_id,s])),[submissions]);
 const pending=briefs.filter(b=>byBrief.get(b.id)?.status==="pending_review");
 const completed=briefs.filter(b=>byBrief.get(b.id)?.status==="approved");
 const waiting=briefs.filter(b=>!byBrief.has(b.id)||byBrief.get(b.id)?.status==="changes_requested");
 const visible=briefs.filter(brief=>{
  const status=byBrief.get(brief.id)?.status;
  return filter==="all"||
   filter==="todo"&&(!status||status==="changes_requested")||
   filter==="review"&&status==="pending_review"||
   filter==="finished"&&status==="approved";
 });
 const active=briefs.find(b=>b.id===activeId)||null;
 function choose(id:string){
  setActiveId(id);
  try{localStorage.setItem("stc:media:v2:selected:"+member.id,id);}catch{}
 }
 async function remove(brief:Brief){
  if(!manager||busy)return;
  if(!confirmInCurrentLanguage("متأكدة إنك عايزة تمسحي تكليف الكامبين دي؟ هتختفي من عند أحمد لكن التقرير هيفضل محفوظ."))return;
  setBusy(true);
  try{
   const r=await supabase.from("stc_media_briefs").update({
    deleted_at:new Date().toISOString(),deleted_by:member.id,
   }).eq("id",brief.id).eq("version",brief.version).is("deleted_at",null).select("id");
   if(r.error)throw r.error;
   if(!r.data?.length)throw new Error("التكليف اتغير. حدّثي الصفحة وجربي تاني.");
   if(activeId===brief.id)choose("");
   await load();showToast("التكليف اتمسح من عند أحمد، والتقرير محفوظ في السجل.","delete");
  }catch(e){showToast(e instanceof Error?e.message:"مقدرناش نمسح التكليف.","error");}
  finally{setBusy(false);}
 }
 async function review(item:Submission,status:"approved"|"changes_requested",note=""){
  if(!manager||busy)return;
  setBusy(true);
  try{
   const response=await supabase.from("stc_media_submissions").update({
    status,review_note:note,reviewed_by:member.id,
   }).eq("id",item.id).eq("status","pending_review").select("id");
   if(response.error)throw response.error;
   if(!response.data?.length)throw new Error("التقرير اتحرك من حساب تاني. حدّثي الصفحة.");
   await load();showToast(status==="approved"?"تم اعتماد تقرير أحمد بنجاح.":"التقرير رجع لأحمد مع الملاحظة.");
  }catch(e){showToast(e instanceof Error?e.message:"مقدرناش نراجع التقرير.","error");}
  finally{setBusy(false);}
 }
 return <div className="mb2-page" dir="rtl">
  <header className="mb2-topbar">
   <BrandLockup size="compact"/>
   <div className="mb2-topbar-title"><b>Media Buying</b>
    <small>STC Marketing Flow · Ahmed El Kholy</small></div>
   <span className="mb2-live"><i/> Live</span>
   <button type="button" className="mb2-icon-button" title="تحديث" aria-label="تحديث" onClick={()=>void load()}>
    <RefreshCw size={18}/></button>
   <button type="button" className="mb2-secondary mb2-back" onClick={onBack}>
    {manager?<ArrowRight size={17}/>:<LogOut size={17}/>}
    {manager?"رجوع للتيم":"تسجيل خروج"}
   </button>
  </header>
  <main className="mb2-container">
   <section className="mb2-hero">
    <div><span className="mb2-eyebrow">MEDIA BUYING / CAMPAIGN FLOW</span>
     <h1>{manager?"حملات أحمد الخولي":"الـCampaigns اللي اتبعتتلك"}</h1>
     <p>{manager?
      "ابعتي لينك البوست فقط، ولو حابة اكتبي الهدف والتعليمات في ملاحظة واحدة. أحمد هيجاوب على الأسئلة الخمسة.":
      "كل تكليف من ناردين موجود في كارت فيه لينك البوست وملاحظتها الاختيارية. نفّذ الإعلان وبعدها ابعت تقريرك."}</p>
    </div>
    {manager&&!!profile&&<button type="button" className="mb2-primary"
     onClick={()=>setEditing("new")}><Plus size={18}/> تكليف كامبين جديد</button>}
   </section>
   {error&&<div className="mb2-error" role="alert">{error}
    <button type="button" onClick={()=>void load()}>حاول تاني</button></div>}
   {loading&&!profile&&<div className="mb2-empty"><RefreshCw size={22}/> بنحمّل الحملات…</div>}
   {profile&&<>
    <section className="mb2-stats">
     <article><span className="mb2-stat-icon"><Megaphone size={20}/></span>
      <small>إجمالي التكليفات</small><strong>{briefs.length}</strong></article>
     <article><span className="mb2-stat-icon"><ClipboardCheck size={20}/></span>
      <small>مطلوب تنفيذ أو تعديل</small><strong>{waiting.length}</strong></article>
     <article><span className="mb2-stat-icon"><Clock3 size={20}/></span>
      <small>تقارير للمراجعة</small><strong>{pending.length}</strong></article>
     <article><span className="mb2-stat-icon"><FileCheck2 size={20}/></span>
      <small>تقارير معتمدة</small><strong>{completed.length}</strong></article>
    </section>
    {manager&&pending.length>0&&<section className="mb2-inbox">
     <div className="mb2-inbox-heading"><div><span className="mb2-eyebrow">REVIEW INBOX</span>
      <h2>تقارير أحمد اللي مستنية مراجعتك</h2>
      <p>كل تقرير فيه الأسئلة الخمسة والإجابات بشكل واضح، من غير ما تفتحي ملفات خارجية.</p>
     </div><span className="mb2-counter">{pending.length} للمراجعة</span></div>
     <div className="mb2-inbox-list">{pending.map(brief=>{
      const submission=byBrief.get(brief.id);
      return submission?<div key={brief.id} className="mb2-inbox-entry">
       <div className="mb2-inbox-brief"><Link2 size={17}/>
        <a href={brief.post_url} target="_blank" rel="noopener noreferrer" dir="ltr">
         {shortLink(brief.post_url)} <ExternalLink size={14}/></a>
        {briefNote(brief)&&<p>{briefNote(brief)}</p>}
       </div>
       <AnswerReport brief={brief} submission={submission} manager busy={busy}
        onApproved={()=>void review(submission,"approved")}
        onRequestChanges={note=>void review(submission,"changes_requested",note)}/>
      </div>:null;
     })}</div>
    </section>}
    <section className="mb2-section-head"><div><span className="mb2-eyebrow">ASSIGNED CAMPAIGNS</span>
     <h2>كروت الحملات</h2><p>لينك البوست وملاحظة اختيارية من ناردين، وتقرير أحمد مربوط بنفس الكارت.</p>
    </div></section>
    <nav className="mb2-filters" aria-label="فلترة الحملات">
     {([
      ["all","الكل",briefs.length],["todo","مطلوب شغل",waiting.length],
      ["review","مستني مراجعة",pending.length],["finished","معتمد",completed.length],
     ] as const).map(([key,title,count])=><button key={key} type="button"
      className={filter===key?"active":""} onClick={()=>setFilter(key)}>
      {title}<small>{count}</small>
     </button>)}
    </nav>
    {!briefs.length&&<div className="mb2-empty"><Megaphone size={35}/>
     <strong>{manager?"لسه مفيش تكليفات حملات":"ناردين لسه ما بعتتش كامبين"}</strong>
     <p>{manager?"اضغطي «تكليف كامبين جديد» وابعتي لينك البوست وملاحظة لو حابة.":"أول تكليف من ناردين هيظهر هنا بكارت واضح."}</p>
     {manager&&<button className="mb2-primary" type="button" onClick={()=>setEditing("new")}>
      <Plus size={17}/> ابعتي أول كامبين</button>}
    </div>}
    {!!briefs.length&&!visible.length&&<div className="mb2-empty">مفيش حملات في الحالة دي.</div>}
    <div className="mb2-cards">{visible.map(brief=>{
     const submission=byBrief.get(brief.id);
     return <article key={brief.id} className={"mb2-card "+(activeId===brief.id?"is-open":"")}>
      <div className="mb2-card-top"><div className="mb2-card-icon"><Megaphone size={21}/></div>
       <span className={"mb2-status "+(submission?"mb2-status--"+submission.status:"mb2-status--todo")}>
        {submission?statusCopy[submission.status]:"مستني تنفيذ أحمد"}
       </span></div>
      <small className="mb2-card-label">CAMPAIGN BRIEF · {dateTime(brief.created_at)}</small>
      <h3>إعلان على بوست</h3>
      <a href={brief.post_url} target="_blank" rel="noopener noreferrer" dir="ltr" className="mb2-card-link">
       <Link2 size={16}/>{shortLink(brief.post_url)}<ExternalLink size={14}/>
      </a>
      {briefNote(brief)&&<div className="mb2-card-instructions"><MessageSquareText size={15}/>
       <p dir="auto">{briefNote(brief)}</p></div>}
      <div className="mb2-card-actions">
       <button type="button" className="mb2-card-open" onClick={()=>choose(brief.id)}>
        <ClipboardCheck size={16}/>{submission?"شوف التقرير والتفاصيل":"افتح الكارت والتفاصيل"}
        <ChevronLeft size={17}/>
       </button>
       {manager&&<div className="mb2-card-manager">
        <button type="button" title="تعديل التكليف" aria-label="تعديل التكليف" onClick={()=>setEditing(brief)}>
         <Pencil size={17}/></button>
        <button type="button" title="حذف التكليف" aria-label="حذف التكليف" disabled={busy}
         onClick={()=>void remove(brief)}><Trash2 size={17}/></button>
       </div>}
      </div>
     </article>;
    })}</div>
    {active&&<section className="mb2-detail" key={active.id}>
     <div className="mb2-detail-head"><div><span className="mb2-eyebrow">CAMPAIGN / DETAIL</span>
      <h2>تفاصيل الكامبين</h2><p>{briefNote(active)||"تكليف من ناردين"}</p></div>
      <button type="button" className="mb2-icon-button" aria-label="قفل التفاصيل"
       onClick={()=>choose("")}><X size={18}/></button>
     </div>
     <div className="mb2-brief-detail">
      <div><small>البوست المطلوب</small>
       <a href={active.post_url} target="_blank" rel="noopener noreferrer" dir="ltr">
        {shortLink(active.post_url)} <ExternalLink size={15}/></a></div>
      <div><small>الهدف والملاحظة (اختياري)</small><strong dir="auto">{briefNote(active)||"مفيش ملاحظة"}</strong></div>
     </div>
     {byBrief.get(active.id)?<AnswerReport brief={active} submission={byBrief.get(active.id)!}
      manager={manager} busy={busy}
      onApproved={()=>void review(byBrief.get(active.id)!,"approved")}
      onRequestChanges={note=>void review(byBrief.get(active.id)!,"changes_requested",note)}/>:
      <div className="mb2-no-report"><Clock3 size={20}/>
       {manager?"مستنيين أحمد ينفّذ الإعلان ويبعت إجابات الأسئلة.":"خلصت عمل الكامبين؟ افتح نموذج الأسئلة الخمسة وابعته لناردين."}
      </div>}
     {!manager&&(!byBrief.get(active.id)||byBrief.get(active.id)?.status==="changes_requested")&&
      <button type="button" className="mb2-primary mb2-answer-button"
       onClick={()=>setAnswering(active)}><Send size={18}/>
       {byBrief.get(active.id)?"عدّل الإجابات وابعتها تاني":"جاوب على الأسئلة الخمسة وابعتها"}
      </button>}
    </section>}
    {manager&&<p className="mb2-security-note">
     <CheckCircle2 size={16}/> ناردين تقدر تعدّل أو تمسح التكليف. أحمد يكتب التقرير ويرسله؛
     الحذف بيخفي التكليف من الكروت وبيحافظ على السجل بدل حذف بياناته نهائيًا.
    </p>}
   </>}
  </main>
  {profile&&manager&&editing!==null&&<BriefEditor profile={profile} member={member}
   existing={editing==="new"?null:editing} onClose={()=>setEditing(null)} onSaved={load}/>}
  {profile&&!manager&&answering&&<AnswerEditor brief={answering} member={member}
   existing={byBrief.get(answering.id)||null} onClose={()=>setAnswering(null)} onSaved={load}/>}
 </div>;
}
