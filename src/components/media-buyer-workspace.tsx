"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import type {FormEvent} from "react";
import {
  ArrowRight,CalendarDays,CheckCircle2,ChevronDown,ChevronUp,ClipboardCheck,Clock3,
  ExternalLink,Link2,LogOut,Megaphone,MessageSquareText,
  Pencil,Plus,RefreshCw,Send,Trash2,MoreHorizontal,X,
} from "lucide-react";
import type {Member} from "@/lib/domain";
import {supabase} from "@/lib/supabase";
import {showToast} from "@/lib/toasts";
import {readableError,createRefreshScheduler} from "@/lib/workspace-quality";
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
 approved:"تم الاعتماد",
 changes_requested:"مطلوب تعديل",
};
const formatNumber=(n:number)=>new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(n);
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
   if(!navigator.onLine)throw new Error("الإنترنت مش متصل. بياناتك لسه موجودة.");
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
  }catch(e){const message=readableError(e);
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
   if(!navigator.onLine)throw new Error("الإنترنت مش متصل. المسودة محفوظة.");
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
  }catch(e){const message=readableError(e);
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
   <label className="mb2-field"><span className="mb2-question-index">01</span> الإعلان على أنهي بوست؟
    <input type="text" maxLength={2000} dir="auto" value={fields.campaign_post}
     onChange={e=>set("campaign_post",e.target.value)} placeholder="لينك البوست أو وصف البوست"/>
    <small>ممكن تستخدم نفس لينك ناردين أو تكتب بوست مختلف لو اتغير</small>
   </label>
   <label className="mb2-field"><span className="mb2-question-index">02</span> هدف الإعلان؟
    <textarea rows={2} maxLength={2500} value={fields.campaign_goal}
     onChange={e=>set("campaign_goal",e.target.value)}
     placeholder="إيه الهدف اللي اتعمل عليه الإعلان؟"/>
   </label>
   <section className="mb2-budget-group" aria-label="الميزانية اليومية والعملة">
    <div className="mb2-budget-heading"><span className="mb2-question-index">03</span>
     <strong>الميزانية اليومية كام؟</strong>
    </div>
    <div className="mb2-budget-inline" dir="rtl">
     <input type="number" min="0" max="100000000" step="0.01" inputMode="decimal"
      aria-label="الميزانية في اليوم" value={fields.daily_budget}
      onChange={e=>set("daily_budget",e.target.value)} placeholder="المبلغ"/>
     <select value={fields.currency} aria-label="العملة" title="العملة"
      onChange={e=>set("currency",e.target.value)}>
      {allowedCurrencies.map(currency=><option value={currency} key={currency}>{currency}</option>)}
     </select>
    </div>
   </section>
   <div className="mb2-range-fields">
    <span className="mb2-range-title"><span className="mb2-question-index">04</span> مدة الإعلان من إمتى لإمتى؟</span>
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
   <label className="mb2-field"><span className="mb2-question-index">05</span> إيه النتائج؟
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

function AnswerCard({index,question,answer,emphasis=false,link=false,money=false}:{
 index:number;question:string;answer:string;emphasis?:boolean;link?:boolean;money?:boolean;
}){
 const text=answer.trim();
 return <article className={"mb2-qa-card "+(emphasis?"mb2-qa-card--emphasis":"")}>
  <span className="mb2-qa-index">{String(index).padStart(2,"0")}</span>
  <span className="mb2-qa-question">{question}</span>
  {link&&validUrl(text)?
   <a dir="ltr" target="_blank" rel="noopener noreferrer" href={text} className="mb2-qa-answer mb2-qa-link">
    {shortLink(text)} <ExternalLink size={16}/></a>:
   <strong className={"mb2-qa-answer "+(money?"mb2-qa-answer--money ":"")+(!text?"mb2-qa-unanswered":"")} dir={money?"ltr":"auto"}>
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
   <AnswerCard index={1} question="الإعلان على أنهي بوست؟" answer={submission.campaign_post} link/>
   <AnswerCard index={2} question="هدف الإعلان؟" answer={submission.campaign_goal}/>
   <AnswerCard index={3} question="الميزانية اليومية كام؟" answer={budgetLabel} emphasis money/>
   <article className="mb2-qa-card mb2-qa-card--schedule">
    <span className="mb2-qa-index">04</span>
    <span className="mb2-qa-question">مدة الإعلان من إمتى لإمتى؟</span>
    <div className="mb2-qa-dates">
     <span>من <strong>{submission.start_date||"—"}</strong></span>
     <span>إلى <strong>{submission.end_date||"—"}</strong></span>
    </div>
    {duration!==null&&<p>{duration} يوم{total!==null&&<> · <b>ميزانية تقديرية: {formatNumber(total)} {submission.currency}</b></>}</p>}
    {!submission.start_date&&!submission.end_date&&<small>{emptyValue}</small>}
   </article>
   <AnswerCard index={5} question="إيه النتائج؟" answer={submission.results} emphasis/>
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
 const [refreshing,setRefreshing]=useState(false);
 const manualRefreshBusy=useRef(false);
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
 async function refreshNow(){
  if(manualRefreshBusy.current)return;
  manualRefreshBusy.current=true;setRefreshing(true);
  try{await load();}finally{manualRefreshBusy.current=false;setRefreshing(false);}
 }
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  const scheduled=createRefreshScheduler(()=>void load());
  const channel=supabase.channel("stc-media-v2-"+member.id)
   .on("postgres_changes",{event:"*",schema:"public",table:"stc_media_briefs"},scheduled.request)
   .on("postgres_changes",{event:"*",schema:"public",table:"stc_media_submissions"},scheduled.request)
   .subscribe();
  const poll=window.setInterval(()=>{
   if(document.visibilityState==="visible")void load();
  },30000);
  const refreshOnFocus=()=>{if(document.visibilityState==="visible")void load();};
  window.addEventListener("focus",refreshOnFocus);
  return()=>{
   scheduled.cancel();serial.current++;window.clearInterval(poll);
   window.removeEventListener("focus",refreshOnFocus);void supabase.removeChannel(channel);
  };
 },[member.id,load]);
 useEffect(()=>{
  const close=(event:PointerEvent)=>{if(event.target instanceof Node)document.querySelectorAll<HTMLDetailsElement>(".mb2-card-menu[open]").forEach(menu=>{if(!menu.contains(event.target as Node))menu.open=false;});};
  const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")document.querySelectorAll<HTMLDetailsElement>(".mb2-card-menu[open]").forEach(menu=>{menu.open=false;});};
  document.addEventListener("pointerdown",close);document.addEventListener("keydown",escape);
  return()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",escape);};
 },[]);
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
 function choose(id:string){
  const next=activeId===id?null:id;
  setActiveId(next);
  try{
   const key="stc:media:v2:selected:"+member.id;
   if(next)localStorage.setItem(key,next);
   else localStorage.removeItem(key);
  }catch{}
 }
 async function remove(brief:Brief){
  if(!manager||busy)return;
  if(!(await confirmInCurrentLanguage("متأكدة إنك عايزة تمسحي تكليف الكامبين دي؟ هتختفي من عند أحمد لكن التقرير هيفضل محفوظ.")))return;
  setBusy(true);
  try{
   const r=await supabase.from("stc_media_briefs").update({
    deleted_at:new Date().toISOString(),deleted_by:member.id,
   }).eq("id",brief.id).eq("version",brief.version).is("deleted_at",null).select("id");
   if(r.error)throw r.error;
   if(!r.data?.length)throw new Error("التكليف اتغير. حدّثي الصفحة وجربي تاني.");
   if(activeId===brief.id){setActiveId(null);try{localStorage.removeItem("stc:media:v2:selected:"+member.id);}catch{}}
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
   <div className="mb2-header-brand"><BrandLockup size="compact"/>
    <div className="mb2-topbar-title"><b>Media Buying</b><small>STC Marketing Flow</small></div>
   </div>
   <div className="mb2-header-actions">
    <button type="button" className="mb2-icon-button" title="تحديث" aria-label="تحديث" aria-busy={refreshing} disabled={refreshing||loading} onClick={()=>void refreshNow()}>
     <RefreshCw size={18} className={refreshing?"mb2-refreshing":undefined}/></button>
    <button type="button" className="mb2-secondary mb2-back" aria-label={manager?"رجوع للتيم":"تسجيل خروج"} title={manager?"رجوع للتيم":"تسجيل خروج"} onClick={onBack}>
     {manager?<ArrowRight size={18}/>:<LogOut size={18}/>}
     <span>{manager?"رجوع للتيم":"تسجيل خروج"}</span>
    </button>
   </div>
  </header>
  <main className="mb2-container">
   <section className="mb2-hero">
    <div>
     <h1>{manager?"حملات أحمد الخولي":"حملاتك الإعلانية"}</h1>
     <p>{manager?"ابعتي التكليف، وراجعي تقارير أحمد من نفس الكروت.":"افتح البوست، نفّذ الإعلان، وبعدها سجّل تقريرك."}</p></div>
    {manager&&!!profile&&<button type="button" className="mb2-primary"
      disabled={busy||!!editing} onClick={()=>setEditing("new")}><Plus size={18}/> تكليف جديد</button>}
   </section>
   {error&&<div className="mb2-error" role="alert">{error}
    <button type="button" disabled={refreshing} onClick={()=>void refreshNow()}>حاول تاني</button></div>}
   {loading&&!profile&&<div className="mb2-empty"><RefreshCw size={22}/> بنحمّل الحملات…</div>}
   {profile&&<>
    {briefs.length>0&&<nav className="mb2-filters" aria-label="فلترة الحملات">
     {([
      ["all","الكل",briefs.length],["todo","مطلوب شغل",waiting.length],
      ["review","مستني مراجعة",pending.length],["finished","تم الاعتماد",completed.length],
     ] as const).map(([key,title,count])=><button key={key} type="button"
      className={filter===key?"active":""} aria-pressed={filter===key} onClick={()=>setFilter(key)}>
      {title}<small>{count}</small>
     </button>)}
    </nav>}
    {!briefs.length&&<div className="mb2-empty"><Megaphone size={35}/>
     <strong>{manager?"لسه مفيش تكليفات حملات":"ناردين لسه ما بعتتش كامبين"}</strong>
     <p>{manager?"اضغطي «تكليف جديد» وابعتي لينك البوست وملاحظة لو حابة.":"أول تكليف من ناردين هيظهر هنا بكارت واضح."}</p>
    </div>}
    {!!briefs.length&&!visible.length&&<div className="mb2-empty">مفيش حملات في الحالة دي.</div>}
    <div className="mb2-cards">{visible.map(brief=>{
     const submission=byBrief.get(brief.id);
     const expanded=activeId===brief.id;
     return <article id={"mb2-card-"+brief.id} key={brief.id}
      className={"mb2-card "+(expanded?"is-open":"")}>
      <div className="mb2-card-top">
       <div className="mb2-card-identity"><div className="mb2-card-icon"><Megaphone size={20}/></div>
        <div><small className="mb2-card-label">{dateTime(brief.created_at)}</small>
         <h3>إعلان على بوست</h3></div>
       </div>
       <span className={"mb2-status "+(submission?"mb2-status--"+submission.status:"mb2-status--todo")}>
        {submission?statusCopy[submission.status]:"مستني تنفيذ أحمد"}
       </span>
      </div>
      <div className="mb2-card-summary">
       <div className="mb2-card-summary-field"><span className="mb2-card-summary-label">رابط البوست</span>
        <a href={brief.post_url} target="_blank" rel="noopener noreferrer" dir="ltr" className="mb2-card-link">
         <Link2 size={16}/>{shortLink(brief.post_url)}<ExternalLink size={14}/>
        </a>
       </div>
       {briefNote(brief)&&<div className="mb2-card-summary-field">
        <span className="mb2-card-summary-label">ملاحظة ناردين</span>
        <p className="mb2-card-note" dir="auto">{briefNote(brief)}</p>
        {briefNote(brief).length>100&&<details className="mb2-note-more"><summary>عرض الملاحظة كاملة</summary><p dir="auto">{briefNote(brief)}</p></details>}
       </div>}
      </div>
      <div className="mb2-card-actions">
       {!manager&&(!submission||submission.status==="changes_requested")?
        <button type="button" className="mb2-card-open mb2-card-open--primary"
          onClick={()=>setAnswering(brief)}>
          <Send size={17}/>{submission?"عدّل التقرير وأرسله":"املأ التقرير وأرسله"}
        </button>:
        submission?
         <button type="button" className="mb2-card-open"
           aria-expanded={expanded} aria-controls={"mb2-card-details-"+brief.id}
           onClick={()=>choose(brief.id)}>
           <ClipboardCheck size={17}/>{expanded?"قفل التقرير":"عرض التقرير"}
           {expanded?<ChevronUp size={17}/>:<ChevronDown size={17}/>}
         </button>:
         <span className="mb2-card-waiting"><Clock3 size={16}/> مستني تقرير أحمد</span>
       }
       {manager&&<details className="mb2-card-menu">
         <summary aria-label="إجراءات التكليف" title="إجراءات التكليف"><MoreHorizontal size={20}/></summary>
         <div className="mb2-card-menu__items">
           <button type="button" onClick={()=>setEditing(brief)}><Pencil size={16}/> تعديل التكليف</button>
           <button type="button" disabled={busy} onClick={()=>void remove(brief)}>
             <Trash2 size={16}/> حذف التكليف
           </button>
         </div>
       </details>}
      </div>
      <div id={"mb2-card-details-"+brief.id} className="mb2-inline-details"
       role="region" aria-label="تفاصيل وتقرير الحملة" hidden={!expanded}>
       {expanded&&<>
        {submission?<AnswerReport brief={brief} submission={submission}
         manager={manager} busy={busy}
         onApproved={()=>void review(submission,"approved")}
         onRequestChanges={note=>void review(submission,"changes_requested",note)}/>:
         <div className="mb2-no-report"><Clock3 size={20}/>
          {manager?"مستنيين أحمد ينفّذ الإعلان ويبعت إجابات الأسئلة.":
           "خلصت تنفيذ الإعلان؟ سجّل إجابات الأسئلة الخمسة وابعتها لناردين."}
         </div>}
        </>}
      </div>
     </article>;
    })}</div>
       </>}
  </main>
  {profile&&manager&&editing!==null&&<BriefEditor profile={profile} member={member}
   existing={editing==="new"?null:editing} onClose={()=>setEditing(null)} onSaved={load}/>}
  {profile&&!manager&&answering&&<AnswerEditor brief={answering} member={member}
   existing={byBrief.get(answering.id)||null} onClose={()=>setAnswering(null)} onSaved={load}/>}
 </div>;
}
