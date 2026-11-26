"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BrandLockup from "./brand-lockup";
import type { Session } from "@supabase/supabase-js";
import { Bell, Check, CheckCheck, CheckCircle2, ChevronLeft, Clock3, FileUp, LogOut, MessageCircle, Pencil, Plus, Send, Trash2, X, CalendarDays, UserRound, AlertCircle, ListTodo, HardDrive, Sparkles, Filter, History, Megaphone } from "lucide-react";
import { supabase, configured } from "@/lib/supabase";
import { showToast } from "@/lib/toasts";
import MonthlyReports from "./monthly-reports";
import WeeklyReports from "./weekly-reports";
import TaskUsage from "./task-usage";
import {ReportTaskFields,reportTaskValues} from "./report-task-fields";
import {seoMetricLabel} from "@/lib/seo-metric-labels";
import { notifySound, unlockSound, type SoundKind } from "@/lib/notification-sound";
import { readableError, createRefreshScheduler } from "@/lib/workspace-quality";
import { confirmInCurrentLanguage } from "./app-language-provider";
import { clearFlowLocation, getFlowLocation, setFlowLocation } from "@/lib/flow-location";
import type { Task, Member, Notice, Attachment, Comment } from "@/lib/domain";
import SeoWorkspace, { clearSeoDataCache } from "./seo-workspace";
import MediaBuyerWorkspace, { clearMediaBuyerCache } from "./media-buyer-workspace";
import StorageDashboard, { clearStorageManagerCache } from "./storage-dashboard";

const cache = new Map<string, { tasks: Task[]; team: Member[]; notices: Notice[]; updatedAt: number }>();
const TASK_CACHE_TTL_MS = 90_000;
type FlowFilter="all"|"active"|"review"|"changes"|"approved"|"late";
type SeoReview={id:string;profile_id:string;metric_key:string;month_key:string;before_value:number|null;after_value:number|null;status:string};
const filterOptions:{id:FlowFilter;label:string}[]=[
 {id:"all",label:"الكل"},{id:"active",label:"شغالين عليها"},{id:"review",label:"مستني مراجعة"},
 {id:"changes",label:"مطلوب تعديل"},{id:"approved",label:"تم الاعتماد"},{id:"late",label:"متأخرة"}
];
const cairoDay=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const stage = (s: Task["status"]) => ({
  todo:"لسه متبدأتش",in_progress:"شغال عليها",tomorrow:"هتتعمل بكرة",
  waiting_review:"مستنية المراجعة",changes_requested:"مطلوب تعديلات",approved:"تم الاعتماد"
}[s]);
const date = (d: string|null) => d ? new Date(d+"T12:00:00Z").toLocaleDateString("ar-EG",{day:"numeric",month:"short",year:"numeric"}) : "من غير ميعاد";
const first = (name: string) => name.split(" ")[0] || name;

function Tile({task,who,manager,open}:{task:Task;who?:string;manager:boolean;open:()=>void}) {
  const late=!!task.due_date&&task.due_date<cairoDay()&&task.status!=="approved";
  return <button type="button" className={"easy-task easy-task--"+task.status} onClick={open}>
    <div className="easy-task-head"><span className={"easy-tag easy-tag--"+task.status}>{stage(task.status)}</span>{task.priority==="high"&&<span className="easy-priority">مستعجلة</span>}</div>
    <h3>{task.title}</h3>
    {task.description&&<p>{task.description}</p>}
    <div className="easy-task-meta">{manager&&<span><UserRound size={15}/>{who||"من التيم"}</span>}<span className={late?"easy-late":""}><CalendarDays size={15}/>{date(task.due_date)}</span></div>
    <div className="easy-task-footer">{task.status==="approved"?<strong className="easy-approved"><CheckCircle2 size={17}/> تم الاعتماد</strong>
    :task.status==="waiting_review"&&manager?<strong className="easy-review-action">مستني موافقتك · راجعيه <ChevronLeft size={17}/></strong>
    :task.status==="waiting_review"?<strong>اتسلّم ومستني ناردين تراجعه</strong>
    :<strong>افتح التاسك <ChevronLeft size={17}/></strong>}</div>
  </button>;
}

function TaskDialog({task,member,team,close,refresh,notify}:{task:Task;member:Member;team:Member[];close:()=>void;refresh:()=>Promise<void>;notify:(s:string)=>void}) {
  const manager=member.role==="manager";
  const noteKey="stc-flow2:task-note:"+member.id+":"+task.id;
  const [note,setNote]=useState(()=>{
    try{return sessionStorage.getItem(noteKey)||"";}catch{return "";}
  });
  const [edit,setEdit]=useState(false);
  const [actual,setActual]=useState(String(task.actual_quantity??task.requested_quantity??1));
  const editVersion=useRef(task.version);
  const [taskEvents,setTaskEvents]=useState<{id:string;actor_id:string|null;action:string;created_at:string}[]>([]);
  useEffect(()=>{
    try{if(note)sessionStorage.setItem(noteKey,note);else sessionStorage.removeItem(noteKey);}catch{}
  },[note,noteKey]);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const [oldNotes,setOldNotes]=useState<Comment[]>([]);
  const [files,setFiles]=useState<Attachment[]>([]);
  const getExtra=useCallback(async()=>{
    const [n,f,events]=await Promise.all([
      supabase.from("stc_comments").select("*").eq("task_id",task.id).order("created_at",{ascending:false}).limit(15),
      supabase.from("stc_attachments").select("*").eq("task_id",task.id).order("created_at",{ascending:false}).limit(15),
      supabase.from("stc_events").select("id,actor_id,action,created_at")
        .eq("task_id",task.id).order("created_at",{ascending:false}).limit(12),
    ]);
    if(!n.error)setOldNotes(n.data||[]);
    if(!f.error)setFiles(f.data||[]);
    if(!events.error)setTaskEvents(events.data||[]);
  },[task.id]);
  useEffect(()=>{void getExtra();},[getExtra]);
  async function run(fn:()=>Promise<void>,message:string,shouldClose=true){
    if(busy)return;
    setBusy(true);setErr("");
    try{if(!navigator.onLine)throw new Error("الإنترنت مقطوع. بياناتك لسه موجودة، حاول تاني لما يرجع.");await fn();notify(message);if(shouldClose)close();await refresh();if(!shouldClose)await getExtra();}
    catch(e){const message=readableError(e);setErr(message);showToast(message,"error");}
    finally{setBusy(false);}
  }
  async function change(status:Task["status"]){
    await run(async()=>{
      const values:Record<string,unknown>={status};
      if(status==="waiting_review"){values.submission_note=note.trim();if(task.report_brand&&task.report_category){const n=Number(actual);if(!Number.isInteger(n)||n<1||n>1000000)throw Error("اكتب العدد المنفذ بشكل صحيح.");values.actual_quantity=n;}}
      if(status==="approved"||status==="changes_requested")values.review_note=note.trim();
      const r=await supabase.from("stc_tasks").update(values).eq("id",task.id).eq("version",task.version).is("deleted_at",null).select("id");
      if(r.error)throw r.error;
      if(!r.data?.length)throw new Error("التاسك اتغيّر من حساب تاني. اقفله وافتحه تاني.");
    },status==="waiting_review"?"تمام! التاسك اتسلّم وناردين جالها إشعار.":status==="approved"?"تم الاعتماد! صاحب التاسك جاله إشعار بالموافقة.":status==="changes_requested"?"تمام، التعديلات وصلت لصاحب التاسك.":"تم تحديث التاسك بنجاح.");
  }
  async function saveNote(){
    if(!note.trim())return;
    await run(async()=>{
      const r=await supabase.from("stc_comments").insert({task_id:task.id,body:note.trim()});
      if(r.error)throw r.error;
      setNote("");
    },"الملاحظة اتحفظت.",false);
  }
  async function saveEdit(form:HTMLFormElement){
    const f=new FormData(form);
    await run(async()=>{
      const r=await supabase.from("stc_tasks").update({
        title:String(f.get("title")||"").trim(),description:String(f.get("description")||""),
        assignee_id:String(f.get("assignee")),due_date:f.get("due")||null,
        priority:String(f.get("priority")),...reportTaskValues(f),
      }).eq("id",task.id).eq("version",editVersion.current).is("deleted_at",null).select("id");
      if(r.error)throw r.error;
      if(!r.data?.length)throw new Error("حد عدّل التاسك أثناء التعديل. بياناتك لسه موجودة؛ راجعي أحدث نسخة قبل الحفظ.");
    },"التعديل اتحفظ وظهر عند صاحب التاسك.");
  }
  async function remove(){
    if(!(await confirmInCurrentLanguage("متأكدة إنك عايزة تمسحي التاسك من عند الكل؟ هيختفي من القوائم، بس سجل الحذف محفوظ.")))return;
    await run(async()=>{
      const r=await supabase.from("stc_tasks").update({deleted_at:new Date().toISOString(),deleted_by:member.id})
        .eq("id",task.id).eq("version",task.version).is("deleted_at",null).select("id");
      if(r.error)throw r.error;
      if(!r.data?.length)throw new Error("التاسك اتغيّر، افتحيه تاني.");
    },"التاسك اتمسح من قايمة التيم.");
  }
  async function upload(file:File){
    if(file.size>25*1024*1024){setErr("الملف لازم يكون أقل من 25 ميجا.");return;}
    await run(async()=>{
      const path=task.id+"/"+member.id+"/"+crypto.randomUUID();
      const a=await supabase.storage.from("stc-task-files").upload(path,file,{upsert:false,contentType:file.type||"application/octet-stream"});
      if(a.error)throw a.error;
      const b=await supabase.from("stc_attachments").insert({task_id:task.id,object_path:path,filename:file.name,size:file.size});
      if(b.error){await supabase.storage.from("stc-task-files").remove([path]);throw b.error;}
      window.dispatchEvent(new Event("stc:storage-changed"));
    },"الملف اترفع على التاسك.",false);
  }
  async function download(file:Attachment){
    const r=await supabase.storage.from("stc-task-files").createSignedUrl(file.object_path,60,{download:file.filename});
    if(r.error){setErr(r.error.message);return;}
    window.open(r.data.signedUrl,"_blank","noopener,noreferrer");
  }
  return <div className="easy-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)close();}}>
    <section className="easy-dialog" role="dialog" aria-modal="true" aria-labelledby="easy-task-title">
      <div className="easy-dialog-top"><span className={"easy-tag easy-tag--"+task.status}>{stage(task.status)}</span><button className="easy-icon" disabled={busy} onClick={close} aria-label="قفل"><X size={20}/></button></div>
      <h2 id="easy-task-title">{task.title}</h2>
      {task.description&&<p className="easy-description">{task.description}</p>}
      <div className="easy-dialog-meta"><span><UserRound size={17}/>{team.find(p=>p.id===task.assignee_id)?.display_name||"من التيم"}</span><span><CalendarDays size={17}/>{date(task.due_date)}</span></div>
      {task.submission_note&&<div className="easy-past-note"><b>ملاحظة مع التسليم</b><p>{task.submission_note}</p></div>}
      {task.review_note&&<div className="easy-past-note"><b>رد ناردين</b><p>{task.review_note}</p></div>}
      {task.status==="approved"&&<div className="easy-green-note"><CheckCircle2 size={22}/> ناردين وافقت على التاسك، عاش! 🎉</div>}
      {task.status==="waiting_review"&&<div className="easy-yellow-note"><Clock3 size={20}/>{manager?"التاسك ده مستني موافقتك.":"التاسك اتسلّم ومستني ناردين تراجعه."}</div>}
      {task.status==="changes_requested"&&!manager&&<div className="easy-yellow-note"><AlertCircle size={20}/> ناردين عايزة تعديلات. عدّل وابعت تاني.</div>}
      {!edit&&task.status!=="approved"&&<div className="easy-note-entry">
        <label htmlFor="easy-note">عندك ملاحظة؟ <small>(اختياري)</small></label>
        <textarea id="easy-note" value={note} onChange={e=>setNote(e.target.value)} rows={3} placeholder="اكتب ملاحظتك هنا لو حابب…"/>
        {!!note.trim()&&<button type="button" className="easy-link-btn" disabled={busy} onClick={()=>void saveNote()}><MessageCircle size={15}/> احفظ الملاحظة بس</button>}
      </div>}
      {!edit&&!manager&&task.report_brand&&task.report_category&&task.status!=="approved"&&task.status!=="waiting_review"&&<label className="wr-quantity">العدد المنفذ<input type="number" min={1} max={1000000} value={actual} onChange={e=>setActual(e.target.value)}/></label>}
      {task.report_brand&&<p className="wr-meta">{task.report_brand==="stc"?"STC":"iChem"} · {task.actual_quantity??"—"} / {task.requested_quantity??"—"}</p>}
      {!edit&&task.status!=="approved"&&<div className="easy-dialog-actions">
        {!manager&&task.status!=="waiting_review"&&<>
          {task.status!=="in_progress"&&<button className="easy-btn easy-btn--light" disabled={busy} onClick={()=>void change("in_progress")}>بدأت أشتغل عليها</button>}
          <button className="easy-btn easy-btn--gold" disabled={busy} onClick={()=>void change("waiting_review")}><Send size={17}/> خلصت، ابعتها لناردين</button>
          {task.status!=="tomorrow"&&<button className="easy-link-btn" disabled={busy} onClick={()=>void change("tomorrow")}>هعملها بكرة</button>}
        </>}
        {manager&&task.status==="waiting_review"&&<>
          <button className="easy-btn easy-btn--green" disabled={busy} onClick={()=>void change("approved")}><CheckCircle2 size={19}/> تمام، اعتمدي التاسك</button>
          <button className="easy-btn easy-btn--light" disabled={busy} onClick={()=>void change("changes_requested")}>رجّعيه للتعديل</button>
        </>}
      </div>}
      <details className="easy-details"><summary>ملفات التاسك {files.length?"("+files.length+")":""}</summary>
        {files.map(f=><button type="button" className="easy-file" key={f.id} onClick={()=>void download(f)}>{f.filename}</button>)}
        {task.status!=="approved"&&<label className="easy-upload">ارفع ملف لو حابب<input type="file" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.currentTarget.value="";}}/></label>}
      </details>
      {!!oldNotes.length&&<details className="easy-details"><summary>ملاحظات اتحفظت قبل كده ({oldNotes.length})</summary>{oldNotes.map(n=><p key={n.id} className="easy-past-note" data-no-translate>{n.body}</p>)}</details>}
      {!!taskEvents.length&&<details className="easy-details flow-task-history">
        <summary><History size={16}/> سجل حركة التاسك ({taskEvents.length})</summary>
        {taskEvents.map(event=><div key={event.id} className="flow-history-item">
          <strong>{event.action==="assigned"?"التاسك اتوزّع":
            event.action==="waiting_review"?"اتسلّم للمراجعة":event.action==="approved"?"ناردين وافقت":
            event.action==="changes_requested"?"ناردين طلبت تعديل":event.action==="in_progress"?"بدأ التنفيذ":
            "التاسك اتحدّث"}</strong>
          <small>{team.find(p=>p.id===event.actor_id)?.display_name||"من التيم"} · {new Date(event.created_at).toLocaleString("ar-EG",{timeZone:"Africa/Cairo",day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})}</small>
        </div>)}
      </details>}
      {manager&&task.status==="approved"&&<TaskUsage task={task} refresh={refresh}/>}
      {manager&&<div className="easy-manager-tools">
        <div className="easy-tool-buttons">
          {task.status!=="approved"&&<button type="button" className="easy-link-btn" disabled={busy} onClick={()=>{if(!edit)editVersion.current=task.version;setEdit(v=>!v);}}><Pencil size={16}/>{edit?"إلغاء التعديل":"عدّلي التاسك"}</button>}
          <button type="button" className="easy-link-btn easy-danger" disabled={busy} onClick={()=>void remove()}><Trash2 size={16}/> امسحي التاسك</button>
        </div>
        {edit&&task.status!=="approved"&&<form className="easy-form" onSubmit={e=>{e.preventDefault();void saveEdit(e.currentTarget);}}>
          <label>اسم التاسك<input name="title" required maxLength={300} defaultValue={task.title}/></label>
          <label>المطلوب<textarea name="description" rows={3} defaultValue={task.description}/></label>
          <label>مين هيعمله؟<select name="assignee" defaultValue={task.assignee_id}>{team.filter(p=>p.role==="member"&&p.active).map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
          <ReportTaskFields task={task}/>
          <label>الميعاد<input name="due" type="date" defaultValue={task.due_date||""}/></label>
          <label>الأولوية<select name="priority" defaultValue={task.priority}><option value="normal">عادية</option><option value="high">مستعجلة</option><option value="low">مش مستعجلة</option></select></label>
          <button type="submit" className="easy-btn easy-btn--navy" disabled={busy}>احفظي التعديل</button>
        </form>}
      </div>}
      {err&&<div className="easy-error" role="alert">{err}</div>}
    </section>
  </div>;
}

function CreateDialog({people,initial,memberId,close,refresh,notify}:{people:Member[];initial:string;memberId:string;close:()=>void;refresh:()=>Promise<void>;notify:(s:string)=>void}){
  const [busy,setBusy]=useState(false),[err,setErr]=useState("");
  const draftKey="stc-flow2:create-draft:"+memberId;
  const [draft]=useState<Record<string,string>>(()=>{
    try{
      const raw=sessionStorage.getItem(draftKey);
      if(!raw)return {};
      const value=JSON.parse(raw) as Record<string,string>;
      return value&&typeof value==="object"?value:{};
    }catch{return {};}
  });
  const keepDraft=(form:HTMLFormElement)=>{
    const data=new FormData(form);
    try{sessionStorage.setItem(draftKey,JSON.stringify(Object.fromEntries(
      ["title","description","assignee","due","priority","report_brand","report_category","requested_quantity"].map(key=>[key,String(data.get(key)||"")])
    )));}catch{}
  };
  return <div className="easy-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)close();}}>
    <section className="easy-dialog" role="dialog" aria-modal="true" aria-labelledby="easy-create-title">
      <div className="easy-dialog-top"><span className="easy-eyebrow">تاسك جديد</span><button className="easy-icon" disabled={busy} onClick={close} aria-label="قفل"><X size={20}/></button></div>
      <h2 id="easy-create-title">هتبعتي تاسك لمين؟</h2><p className="easy-description">اكتبي المطلوب واختاري مين هيعمله.</p>
      <form className="easy-form" onChange={e=>keepDraft(e.currentTarget)} onSubmit={e=>{
        e.preventDefault();if(busy)return;const f=new FormData(e.currentTarget);setBusy(true);setErr("");
        void(async()=>{try{
          if(!navigator.onLine)throw new Error("الإنترنت مش متصل. المسودة محفوظة.");
          const r=await supabase.from("stc_tasks").insert({
            title:String(f.get("title")||"").trim(),description:String(f.get("description")||""),
            assignee_id:String(f.get("assignee")),due_date:f.get("due")||null,priority:String(f.get("priority")),...reportTaskValues(f),
          });
          if(r.error)throw r.error;
          try{sessionStorage.removeItem(draftKey);}catch{}
          await refresh();notify("التاسك اتبعت لصاحبه بنجاح!");close();
        }catch(e){const message=readableError(e);setErr(message);showToast(message,"error");}finally{setBusy(false);}})();
      }}>
        <label>اسم التاسك<input name="title" required maxLength={300} defaultValue={draft.title||""} placeholder="مثلاً: بوست عن منتج جديد"/></label>
        <label>مين هيعمله؟<select name="assignee" defaultValue={people.some(p=>p.id===draft.assignee)?draft.assignee:people.some(p=>p.id===initial)?initial:people[0]?.id} required>{people.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
        <ReportTaskFields draft={draft} required/>
        <label>مطلوب منه إيه؟<textarea name="description" rows={3} defaultValue={draft.description||""} placeholder="التفاصيل والتعليمات…"/></label>
        <div className="easy-form-row"><label>ميعاد التسليم<input type="date" name="due" defaultValue={draft.due||""}/></label>
          <label>الأولوية<select name="priority" defaultValue={draft.priority||"normal"}><option value="normal">عادية</option><option value="high">مستعجلة</option><option value="low">مش مستعجلة</option></select></label>
        </div>
        <p className="flow-draft-hint"><CheckCircle2 size={15}/> مسودتك بتتحفظ تلقائيًا على الجهاز ده لحد ما تبعتي التاسك.</p>
        <button className="easy-btn easy-btn--navy" type="submit" disabled={busy}><Send size={17}/>{busy?"بنبعت…":"ابعتِ التاسك"}</button>
      </form>{err&&<p className="easy-error" role="alert">{err}</p>}
    </section>
  </div>;
}

export default function SimpleWorkspace(){
  const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false);
  const [member,setMember]=useState<Member|null>(null),[team,setTeam]=useState<Member[]>([]);
  const [tasks,setTasks]=useState<Task[]>([]),[notices,setNotices]=useState<Notice[]>([]);
  const [seoPeople,setSeoPeople]=useState<{id:string;slug:string;member_id:string|null;display_name:string;brand:string}[]>([]);
  const [mediaPeople,setMediaPeople]=useState<{id:string;slug:string;member_id:string|null;display_name:string}[]>([]);
  const [mediaView,setMediaView]=useState(false);
  const [mediaPending,setMediaPending]=useState(0);
  const [seoView,setSeoView]=useState<string|null>(null);
  const [storageView,setStorageView]=useState(false);
  const [weeklyView,setWeeklyView]=useState(false);
  const [storageAccess,setStorageAccess]=useState(false);
  const [seoPending,setSeoPending]=useState<Record<string,number>>({});
  const [seoReviews,setSeoReviews]=useState<SeoReview[]>([]);
  const [flowFilter,setFlowFilter]=useState<FlowFilter>("all");
  const [managerSection,setManagerSection]=useState<"content"|"seo"|"media">("content");
  const [tab,setCurrentTab]=useState("all"),[reviewOnly,setReviewOnly]=useState(false);
  const [selected,setSelected]=useState<Task|null>(null),[creating,setCreating]=useState(false);
  const [showNotices,setShowNotices]=useState(false),[online,setOnline]=useState(false);
  const [reviewExpanded,setReviewExpanded]=useState(false);
  const [taskLimit,setTaskLimit]=useState(24);
  const noticeRef=useRef<HTMLElement|null>(null);
  const bellRef=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{
    if(!showNotices)return;
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!noticeRef.current?.contains(event.target)&&!bellRef.current?.contains(event.target))setShowNotices(false);};
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape"){setShowNotices(false);bellRef.current?.focus();}};
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",key);
    return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",key);};
  },[showNotices]);
  const [err,setErr]=useState(""),[busy,setBusy]=useState(false);
  const activeUser=useRef<string|null>(null);
  const refreshSerial=useRef(0);
  const pendingTaskId=useRef<string|null>(null);
  const userId=session?.user.id||null;
  const soundRole=useRef<Member["role"]|undefined>(undefined);
  soundRole.current=member?.role;
  const announce=useCallback((message:string)=>showToast(message,/اتمسح|اتمسحت|مسح|حذف/.test(message)?"delete":"success"),[]);
  useEffect(()=>{
    // INITIAL_SESSION is emitted after Supabase restores and checks the saved session.
    // Use one source of auth state so a stale getSession result cannot override a newer event.
    const {data}=supabase.auth.onAuthStateChange((event,s)=>{
      activeUser.current=s?.user.id||null;
      setSession(s);setReady(true);
      if(event==="SIGNED_IN"||event==="TOKEN_REFRESHED")setErr("");
    });
    return ()=>data.subscription.unsubscribe();
  },[]);
  useEffect(()=>{
    if(!userId){
      refreshSerial.current++;
      cache.clear();
      clearStorageManagerCache();clearSeoDataCache();clearMediaBuyerCache();
      setMember(null);setTeam([]);setTasks([]);setNotices([]);
      setSeoPeople([]);setMediaPeople([]);setSeoView(null);setMediaView(false);setStorageView(false);setStorageAccess(false);
      setSeoPending({});setSeoReviews([]);setMediaPending(0);setFlowFilter("all");setReviewExpanded(false);setShowNotices(false);setTaskLimit(24);
      pendingTaskId.current=null;setSelected(null);return;
    }
    const prev=cache.get(userId);
    if(prev && Date.now()-prev.updatedAt<TASK_CACHE_TTL_MS){
      setTasks(prev.tasks);setTeam(prev.team);setNotices(prev.notices);
    } else {
      setTasks([]);setNotices([]);setTeam([]);
      if(prev)cache.delete(userId);
    }
    try{const saved=sessionStorage.getItem("stc-flow-2:filter:"+userId);
      setFlowFilter(filterOptions.some(f=>f.id===saved)?saved as FlowFilter:"all");
    }catch{setFlowFilter("all");}
    const last=getFlowLocation(userId);
    setCurrentTab(last.view==="tasks"?(last.tab||"all"):"all");
    setReviewOnly(last.view==="tasks"&&!!last.review);
    pendingTaskId.current=last.view==="tasks"?last.task||null:null;
    setSeoView(last.view==="seo"?last.person||null:null);
    setMediaView(last.view==="media");
    setStorageView(last.view==="storage");
  },[userId]);
  const refresh=useCallback(async()=>{
    if(!userId)return;
    const serial=++refreshSerial.current;
    const m=await supabase.from("stc_members").select("*").eq("id",userId).maybeSingle();
    if(activeUser.current!==userId||serial!==refreshSerial.current)return;
    if(m.error){setErr(m.error.message);return;}
    if(!m.data?.active){setMember(null);setErr("الحساب مش متفعل. كلم ناردين.");return;}
    const [t,p,n,sp,mp,storagePerm]=await Promise.all([
      supabase.from("stc_tasks").select("*").is("deleted_at",null).order("updated_at",{ascending:false}).limit(1000),
      supabase.from("stc_members").select("*").eq("active",true),
      supabase.from("stc_notifications").select("*").order("created_at",{ascending:false}).limit(80),
      supabase.from("stc_seo_profiles").select("id,slug,member_id,display_name,brand"),
      supabase.from("stc_media_profiles").select("id,slug,member_id,display_name"),
      supabase.rpc("stc_can_view_storage"),
    ]);
    if(activeUser.current!==userId||serial!==refreshSerial.current)return;
    const error=t.error||p.error||n.error||sp.error||mp.error;
    if(error){setErr(error.message);return;}
    const list=t.data as Task[];
    // Keep only actionable alerts. Deleted task history is in stc_events.
    // Deleted tasks never have a visible notification.
    const taskStates = new Map(list.map(task => [task.id, task.status]));
    const visibleNotices = (n.data as Notice[]).filter(notice => {
      if (notice.kind === "deleted") return false;
      if (notice.kind === "unassigned") return true;
      const status = taskStates.get(notice.task_id);
      if (!status) return false;
      return notice.kind !== "waiting_review" || status === "waiting_review";
    });
    setMember(m.data);setTeam(p.data);setTasks(list);setNotices(visibleNotices);
    setSeoPeople(sp.data||[]);setMediaPeople(mp.data||[]);
    // Permission is resolved from the database, not the person's display name.
    setStorageAccess(storagePerm.error===null&&storagePerm.data===true);
    setErr("");
    if(m.data.role==="manager"){
      const [pending,mediaQueue]=await Promise.all([
        supabase.from("stc_seo_metrics").select("id,profile_id,metric_key,month_key,before_value,after_value,status").eq("status","pending_review"),
        supabase.from("stc_media_submissions").select("id,stc_media_briefs!inner(id,deleted_at)").eq("status","pending_review").is("stc_media_briefs.deleted_at",null),
      ]);
      if(activeUser.current===userId&&serial===refreshSerial.current&&!mediaQueue.error)
        setMediaPending(mediaQueue.data?.length||0);
      if(activeUser.current===userId&&serial===refreshSerial.current&&!pending.error){
        const count:Record<string,number>={};
        for(const item of pending.data||[])count[item.profile_id]=(count[item.profile_id]||0)+1;
        setSeoPending(count);setSeoReviews(pending.data as SeoReview[]);
      }
    }
    if(activeUser.current!==userId||serial!==refreshSerial.current)return;
    setSelected(prev=>{
      const id=prev?.id||pendingTaskId.current;
      pendingTaskId.current=null;
      return id?list.find(x=>x.id===id)||null:null;
    });
    cache.set(userId,{tasks:list,team:p.data,notices:visibleNotices,updatedAt:Date.now()});
  },[userId]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    if(!userId)return;
    const scheduled=createRefreshScheduler(()=>void refresh(),200);
    const ch=supabase.channel("simple-"+userId)
      .on("postgres_changes",{event:"*",schema:"public",table:"stc_tasks"},scheduled.request)
      .on("postgres_changes",{event:"*",schema:"public",table:"stc_seo_metrics"},payload=>{
        scheduled.request();
        if(payload.eventType!=="UPDATE")return;
        const n=payload.new;
        if(soundRole.current==="manager"&&n.status==="pending_review"&&n.updated_by!==userId)notifySound(userId,"review","seo:"+n.id+":"+n.updated_at,n.updated_at);
        if(soundRole.current==="member"&&n.status==="approved"&&n.reviewed_by!==userId)notifySound(userId,"approved","seo:"+n.id+":"+n.updated_at,n.updated_at);
      })
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"stc_seo_targets"},payload=>{
        if(soundRole.current==="member"&&payload.new.created_by!==userId)notifySound(userId,"assigned","target:"+payload.new.id,payload.new.created_at);
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"stc_media_briefs"},payload=>{
        scheduled.request();
        if(payload.eventType==="INSERT"&&soundRole.current==="member"&&payload.new.created_by!==userId)notifySound(userId,"assigned","brief:"+payload.new.id,payload.new.created_at);
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"stc_media_submissions"},payload=>{
        scheduled.request();
        if(payload.eventType==="DELETE")return;
        const n=payload.new;
        if(soundRole.current==="manager"&&n.status==="pending_review"&&n.submitted_by!==userId)notifySound(userId,"review","media:"+n.id+":"+n.updated_at,n.updated_at);
        if(soundRole.current==="member"&&n.status==="approved"&&n.submitted_by===userId)notifySound(userId,"approved","media:"+n.id+":"+n.updated_at,n.updated_at);
      })
      .on("postgres_changes",{event:"DELETE",schema:"public",table:"stc_notifications"},scheduled.request)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"stc_notifications",filter:"recipient_id=eq."+userId},payload=>{
        const n=payload.new as Notice;
        if(n.kind==="deleted"){scheduled.request();return;}
        const sound:SoundKind|undefined=n.kind==="assigned"||n.kind==="reassigned"?"assigned":n.kind==="waiting_review"?"review":n.kind==="approved"?"approved":undefined;
        if(sound)notifySound(userId,sound,n.id,n.created_at);
        const message=n.kind==="waiting_review"?"سلّم التاسك ومستني مراجعتك"
          :n.kind==="approved"?"تم الاعتماد"
          :n.kind==="changes_requested"?"ناردين طلبت تعديل"
          :n.kind==="updated"?"ناردين عدّلت التاسك"
          :n.kind==="assigned"||n.kind==="reassigned"?"جالك تاسك جديد":"جالك تحديث";
        announce((n.actor_name?n.actor_name+": ":"")+message+(n.task_title?" — "+n.task_title:""));
        scheduled.request();
      }).subscribe(state=>{
        setOnline(state==="SUBSCRIBED");
        if(state==="SUBSCRIBED")scheduled.request();
      });
    const poll=setInterval(()=>{
      if(document.visibilityState==="visible")scheduled.request();
    },45000);
    // Let the SDK restore/refresh its persisted session under its own auth lock
    // before refreshing workspace data after sleep, backgrounding or reconnecting.
    let resuming=false;
    let disposed=false;
    const recover=async()=>{
      if(resuming||disposed||!navigator.onLine)return;
      resuming=true;
      try{
        const {data,error}=await supabase.auth.getSession();
        if(!disposed&&activeUser.current===userId&&!error&&data.session?.user.id===userId)await refresh();
      }catch{/* The SDK retries transient auth/network failures. */}
      finally{resuming=false;}
    };
    const resume=()=>{if(document.visibilityState==="visible")void recover();};
    const onlineAgain=()=>void recover();
    window.addEventListener("focus",resume);
    window.addEventListener("online",onlineAgain);
    document.addEventListener("visibilitychange",resume);
    return()=>{
      disposed=true;scheduled.cancel();
      void supabase.removeChannel(ch);clearInterval(poll);
      window.removeEventListener("focus",resume);
      window.removeEventListener("online",onlineAgain);
      document.removeEventListener("visibilitychange",resume);
      setOnline(false);
    };
  },[userId,refresh,announce]);
  const manager=member?.role==="manager";
  const canOpenStorage=!!manager||storageAccess;
  const people=useMemo(()=>team.filter(p=>p.role==="member"&&p.active
    && !seoPeople.some(sp=>sp.member_id===p.id) && !mediaPeople.some(mp=>mp.member_id===p.id)
  ),[team,seoPeople,mediaPeople]);
  const reviewTasks=tasks.filter(t=>t.status==="waiting_review");
  const today=cairoDay();
  const scoped=tasks.filter(t=>(!manager||tab==="all"||t.assignee_id===tab)&&(!reviewOnly||t.status==="waiting_review"));
  const matches=(t:Task,f:FlowFilter)=>f==="all"||
    f==="active"&&["todo","in_progress","tomorrow"].includes(t.status)||
    f==="review"&&t.status==="waiting_review"||
    f==="changes"&&t.status==="changes_requested"||
    f==="approved"&&t.status==="approved"||
    f==="late"&&!!t.due_date&&t.due_date<today&&t.status!=="approved";
  // Staff see their next action first, without a duplicated "focus" card list.
  const priorityOf=(t:Task)=>t.status==="changes_requested"?0:
    t.due_date&&t.due_date<today&&t.status!=="approved"?1:
    t.priority==="high"&&t.status!=="approved"?2:
    t.status==="in_progress"?3:t.status==="todo"?4:t.status==="tomorrow"?5:
    t.status==="waiting_review"?6:7;
  const visible=scoped.filter(t=>matches(t,flowFilter));
  if(!manager)visible.sort((a,b)=>priorityOf(a)-priorityOf(b)||
    (a.due_date||"9999").localeCompare(b.due_date||"9999"));
  const unread=notices.filter(n=>!n.read_at).length;
  const reviewCount=reviewTasks.length+seoReviews.length+mediaPending;
  useEffect(()=>{setTaskLimit(24);},[userId,tab,flowFilter,reviewOnly]);
  const seoReviewCount=Object.values(seoPending).reduce((sum,n)=>sum+n,0);
  useEffect(()=>{
    if(!userId)return;
    try{
      const saved=sessionStorage.getItem("stc:ux:manager-section:"+userId);
      if(saved==="content"||saved==="seo"||saved==="media")setManagerSection(saved);
    }catch{}
  },[userId]);
  function selectManagerSection(section:"content"|"seo"|"media"){
    setManagerSection(section);
    try{if(userId)sessionStorage.setItem("stc:ux:manager-section:"+userId,section);}catch{}
  }
  function changeFilter(value:FlowFilter){
    setFlowFilter(value);
    if(userId)try{sessionStorage.setItem("stc-flow-2:filter:"+userId,value);}catch{}
  }
  function choose(id:string,review=false){
    changeFilter("all");
    setCurrentTab(id);setReviewOnly(review);
    if(userId){
      setFlowLocation(userId,{view:"tasks",tab:id,review}, "push");
      try{sessionStorage.setItem("stc-simple-tab-"+userId,id);}catch{}
    }
  }
  function openTask(task:Task){
    setSelected(task);
    if(userId)setFlowLocation(userId,{view:"tasks",tab,review:reviewOnly,task:task.id},"push");
  }
  function closeTask(){
    setSelected(null);pendingTaskId.current=null;
    if(userId)setFlowLocation(userId,{view:"tasks",tab,review:reviewOnly});
  }
  function enterSeo(slug:string,section?:"metrics",month?:string){
    if(manager)selectManagerSection("seo");
    setSeoView(slug);setMediaView(false);setStorageView(false);
    if(userId)setFlowLocation(userId,{view:"seo",person:slug,section,month},"push");
  }
  function enterMedia(){
    if(manager)selectManagerSection("media");
    setMediaView(true);setSeoView(null);setStorageView(false);
    if(userId)setFlowLocation(userId,{view:"media"},"push");
  }
  function enterStorage(){
    setStorageView(true);setMediaView(false);setSeoView(null);
    if(userId)setFlowLocation(userId,{view:"storage"},"push");
  }
  function returnToTasks(){
    setSeoView(null);setMediaView(false);setStorageView(false);
    if(userId)setFlowLocation(userId,{view:"tasks",tab,review:reviewOnly},"push");
    void refresh();
  }
  async function logout(){
    const id=userId;const r=await supabase.auth.signOut({scope:"local"});
    if(r.error){setErr(r.error.message);return;}
    refreshSerial.current++;
    clearFlowLocation(id);
    cache.clear();clearStorageManagerCache();clearSeoDataCache();clearMediaBuyerCache();
    setStorageView(false);setSeoView(null);setMediaView(false);
    if(id)cache.delete(id);setMember(null);setTasks([]);setTeam([]);setNotices([]);
  }
  async function clickNotice(n:Notice){
    const r=await supabase.from("stc_notifications").update({read_at:new Date().toISOString()}).eq("id",n.id);
    if(r.error){setErr(r.error.message);showToast(r.error.message,"error");return;}
    const task=tasks.find(x=>x.id===n.task_id);
    if(task){openTask(task);setShowNotices(false);}
    await refresh();
  }
  useEffect(()=>{
    if(!userId)return;
    const pop=()=>{
      const saved=getFlowLocation(userId);
      setStorageView(saved.view==="storage");
      setMediaView(saved.view==="media");
      setSeoView(saved.view==="seo"?saved.person||null:null);
      setCurrentTab(saved.view==="tasks"?saved.tab||"all":"all");
      setReviewOnly(saved.view==="tasks"&&!!saved.review);
      const id=saved.view==="tasks"?saved.task:null;
      setSelected(id?tasks.find(t=>t.id===id)||null:null);
      if(id&&!tasks.some(t=>t.id===id))pendingTaskId.current=id;
    };
    window.addEventListener("popstate",pop);
    return()=>window.removeEventListener("popstate",pop);
  },[userId,tasks]);
  const assignedSeo=seoPeople.find(p=>p.member_id===member?.id)?.slug||null;
  const assignedMedia=mediaPeople.some(p=>p.member_id===member?.id);
  if(!ready)return <div className="easy-loading">بنفتح مساحة الشغل…</div>;
  if(!session)return <main className="easy-login" dir="rtl">
    <div className="easy-login-brand"><BrandLockup size="large"/><h1>شغلنا كله في مكان واحد.</h1><p>ناردين تبعت التاسك، تخلصه، وهي تراجعه وتوافق عليه.</p></div>
    <section className="easy-login-form"><span className="easy-eyebrow">STC MARKETING FLOW</span><h2>أهلاً بيك 👋</h2><p>سجّل دخول عشان تشوف التاسكات بتاعتك.</p>
      <form className="easy-form" onSubmit={e=>{
        e.preventDefault();void unlockSound();const f=new FormData(e.currentTarget);
        if(!configured){setErr("إعدادات السيستم ناقصة.");return;}setBusy(true);setErr("");
        void supabase.auth.signInWithPassword({email:String(f.get("email")),password:String(f.get("password"))}).then(r=>{if(r.error)setErr(r.error.message);setBusy(false);});
      }}>
        <label>الإيميل<input name="email" type="email" required dir="ltr" autoComplete="username"/></label>
        <label>الباسورد<input name="password" type="password" required autoComplete="current-password"/></label>
        <button className="easy-btn easy-btn--navy" disabled={busy}>دخول</button>
      </form>{err&&<p className="easy-error" role="alert">{err}</p>}
    </section>
  </main>;
  if(!member||member.id!==session.user.id)return <div className="easy-loading">{err?<><p role="alert">{err}</p><button className="easy-btn easy-btn--light" onClick={()=>void refresh()}>حاول تاني</button><button className="easy-btn easy-btn--light" onClick={()=>void logout()}>خروج</button></>:"بنحمّل مساحة شغلك…"}</div>;
  if(manager&&weeklyView)return <WeeklyReports member={member} onBack={()=>setWeeklyView(false)}/>;
  if(member&&canOpenStorage&&storageView)return <StorageDashboard userId={member.id}
    readOnly={!manager} onBack={returnToTasks}/>;
  if(member&&((manager&&mediaView)||assignedMedia))return <MediaBuyerWorkspace
    key={member.id+"-media"} member={member}
    onBack={()=>{if(manager)returnToTasks();else void logout();}}/>;
  if(member&&((manager&&seoView)||assignedSeo))return <SeoWorkspace
    key={(manager?seoView:assignedSeo)||""} slug={(manager?seoView:assignedSeo)||""} member={member}
    onBack={() => {if(manager)returnToTasks();else void logout();}}
  />;
  return <div className="easy-shell" dir="rtl">
    <header className="easy-header"><div className="easy-brand"><BrandLockup/><div><strong>Marketing Flow</strong><small>{manager?"متابعة شغل التيم":"تاسكاتي"}</small></div></div>
      <div className="easy-header-buttons"><span className={online?"easy-online":"easy-offline"}>{online?"متصل":"بيوصل…"}</span>
        {canOpenStorage&&<button type="button" className="easy-storage-entry" onClick={enterStorage}
          title="متابعة استهلاك Supabase Storage"><HardDrive size={18}/><span>التخزين والملفات</span></button>}
        <button ref={bellRef} className="easy-icon easy-bell" aria-expanded={showNotices} aria-controls="stc-notices-panel" onClick={()=>setShowNotices(v=>!v)} aria-label="الإشعارات" title="الإشعارات"><Bell size={21}/>{unread>0&&<i>{unread}</i>}</button>
        <button className="easy-icon easy-logout" onClick={()=>void logout()} title="خروج"><LogOut size={19}/><span>خروج</span></button>
      </div>
    </header>
    <main className="easy-content">
      <section className="easy-intro"><div><h1>{manager?"إدارة شغل الفريق":"شغلك النهارده"}</h1>
        <p>{manager?"راجعي التسليمات، أو اختاري القسم اللي عايزة تتابعيه.":"ابدأ بالأولوية الأولى، وباقي التاسكات تحت."}</p></div>
        <div className="stc-report-actions">{manager&&<button type="button" className="easy-btn easy-btn--light" onClick={()=>setWeeklyView(true)}>تقارير الماركتنج الرسمية</button>}<MonthlyReports key={manager?managerSection:"personal"} department={manager?managerSection:"content"} member={member} people={manager?(managerSection==="content"?people.map(p=>({id:p.id,name:p.display_name})):managerSection==="seo"?seoPeople.map(p=>({id:p.id,name:p.display_name,brand:p.brand})):mediaPeople.map(p=>({id:p.id,name:p.display_name}))):[{id:member.id,name:member.display_name}]} scopeLabel={manager?"تقرير القسم":"تقريري الشهري"}/>
        {manager&&managerSection==="content"&&<button className="easy-btn easy-btn--navy easy-create-button" onClick={()=>setCreating(true)}><Plus size={19}/> تاسك جديد</button>}</div>
      </section>
      {err&&<div className="easy-error" role="alert">{err}<button onClick={()=>void refresh()}>جرّب تاني</button></div>}
      {manager&&<>
        <section className="flow-review-inbox">
          <div className="flow-inbox-title"><div><h2><CheckCircle2 size={19}/> المراجعات <span className="stc-review-count">{reviewCount}</span></h2><p>{reviewCount?"تسليمات محتاجة قرار منك":"كل التسليمات متراجعة"}</p></div>
            {reviewCount>0&&<button className="stc-review-toggle" type="button" aria-expanded={reviewExpanded} aria-controls="stc-review-list" onClick={()=>setReviewExpanded(v=>!v)}>{reviewExpanded?"إخفاء التفاصيل":"عرض المراجعات"}<ChevronLeft size={16}/></button>}
          </div>
          {reviewExpanded&&reviewCount>0&&<div className="flow-inbox-list" id="stc-review-list">
            {reviewTasks.map(t=><button type="button" key={t.id} onClick={()=>openTask(t)}>
              <span className="flow-kind">Task</span><span><b>{t.title}</b>
                <small>{team.find(p=>p.id===t.assignee_id)?.display_name||"من التيم"}</small></span>
              <ChevronLeft size={17}/></button>)}
            {mediaPending>0&&<button type="button" onClick={enterMedia}>
              <span className="flow-kind seo">ADS</span><span><b>نتايج حملات أحمد الخولي</b>
                <small>{mediaPending} تقرير مستني مراجعتك</small></span><ChevronLeft size={17}/>
            </button>}
            {seoReviews.map(k=>{
              const person=seoPeople.find(p=>p.id===k.profile_id);
              return <button type="button" key={k.id} onClick={()=>person&&enterSeo(person.slug,"metrics",k.month_key)}>
                <span className="flow-kind seo">SEO</span><span><b>{seoMetricLabel(k.metric_key)}</b>
                  <small>{person?.display_name||"فريق SEO"} · {k.month_key} · قبل: {k.before_value??"—"} · بعد: {k.after_value??"—"}</small></span>
                <ChevronLeft size={17}/></button>;
            })}
          </div>}
        </section>
        <nav className="flow-department-switch" aria-label="اختاري القسم">
          <button type="button" className={managerSection==="content"?"active":""}
            aria-current={managerSection==="content"?"page":undefined} onClick={()=>selectManagerSection("content")}>
            <ListTodo size={20}/><span><strong>المحتوى والتصميم</strong><small>التاسكات والتسليم</small></span>
            {reviewTasks.length>0&&<b className="flow-switch-count">{reviewTasks.length}</b>}
          </button>
          <button type="button" className={managerSection==="seo"?"active":""}
            aria-current={managerSection==="seo"?"page":undefined} onClick={()=>selectManagerSection("seo")}>
            <Sparkles size={20}/><span><strong>SEO والمواقع</strong><small>محمد عمر وساندرا</small></span>
            {seoReviewCount>0&&<b className="flow-switch-count">{seoReviewCount}</b>}
          </button>
          <button type="button" className={managerSection==="media"?"active":""}
            aria-current={managerSection==="media"?"page":undefined} onClick={()=>selectManagerSection("media")}>
            <Megaphone size={20}/><span><strong>الإعلانات</strong><small>أحمد الخولي</small></span>
            {mediaPending>0&&<b className="flow-switch-count">{mediaPending}</b>}
          </button>
        </nav>
        {managerSection==="seo"&&<section className="flow-department-panel">
          <div className="flow-department-title"><h2>متابعة SEO</h2><p>اختاري الموقع لعرض التارجت والنتائج.</p></div>
          <div className="easy-seo-links flow-department-links" aria-label="فريق السيو">
            <div>{seoPeople.map(p=><button type="button" key={p.slug} onClick={()=>enterSeo(p.slug)}>
              <span>{p.display_name}</span><small>{p.brand} · متابعة الموقع</small>
              {seoPending[p.id]>0&&<b className="easy-seo-pending">{seoPending[p.id]} للمراجعة</b>}
              <ChevronLeft size={18}/>
            </button>)}</div>
          </div>
        </section>}
        {managerSection==="media"&&<section className="flow-department-panel">
          <div className="flow-department-title"><h2>الحملات الإعلانية</h2><p>تكليفات أحمد وتقاريره.</p></div>
          <div className="easy-seo-links easy-media-entry flow-department-links">
            <div><button type="button" onClick={enterMedia}>
              <span><Megaphone size={18}/> أحمد الخولي</span>
              <small>تكليفات الكامبين · النتائج · المراجعة</small>
              {mediaPending>0&&<b className="easy-seo-pending">{mediaPending} تقرير للمراجعة</b>}
              <ChevronLeft size={18}/>
            </button></div>
          </div>
        </section>}
        {managerSection==="content"&&<section className="flow-department-panel">
          <div className="flow-department-title"><h2>فريق المحتوى</h2></div>
          <nav className="easy-tabs" aria-label="فريق المحتوى والتصميم">
            <button className={"easy-tab "+(tab==="all"&&!reviewOnly?"active":"")} onClick={()=>choose("all")}>
              <ListTodo size={18}/> كل التيم <b>{tasks.length}</b>
            </button>
            {people.map((p,i)=><button key={p.id}
              className={"easy-tab easy-tab--"+i+" "+(tab===p.id&&!reviewOnly?"active":"")}
              onClick={()=>choose(p.id)}>
              {p.display_name}<b>{tasks.filter(t=>t.assignee_id===p.id).length}</b>
            </button>)}
            {reviewTasks.length>0&&<button type="button" className={"easy-tab flow-review-tab "+(reviewOnly?"active":"")}
              onClick={()=>choose("all",true)}><Clock3 size={17}/> للمراجعة <b>{reviewTasks.length}</b></button>}
          </nav>
        </section>}
      </>}
      {(!manager||managerSection==="content")&&<section className="flow-task-area">
      <div className="easy-section-heading"><h2>{reviewOnly?"مستنية مراجعتك":manager?(tab==="all"?"كل التاسكات":"تاسكات "+(people.find(p=>p.id===tab)?.display_name||"التيم")):"التاسكات بتاعتك"} <span>{visible.length}</span></h2>

        {manager&&tab!=="all"&&people.some(p=>p.id===tab)&&<MonthlyReports key={tab} department="content" member={member} people={people.filter(p=>p.id===tab).map(p=>({id:p.id,name:p.display_name}))} scopeLabel="تقرير الموظف"/>}
      </div>
      <nav className="flow-filters" aria-label="فلترة التاسكات حسب الحالة"><Filter size={17}/>
        {filterOptions.map(f=><button key={f.id} type="button" className={flowFilter===f.id?"active":""}
          aria-pressed={flowFilter===f.id} onClick={()=>changeFilter(f.id)}>{f.label}{(f.id==="all"||scoped.some(t=>matches(t,f.id)))&&<small>{scoped.filter(t=>matches(t,f.id)).length}</small>}</button>)}
      </nav>
      <div className="easy-grid">{visible.slice(0,taskLimit).map(task=><Tile key={task.id} task={task} manager={!!manager} who={people.find(p=>p.id===task.assignee_id)?.display_name} open={()=>openTask(task)}/>)}</div>
      {visible.length>taskLimit&&<button className="stc-show-more" type="button" onClick={()=>setTaskLimit(n=>n+24)}>عرض المزيد ({visible.length-taskLimit})</button>}
      {!visible.length&&<div className="easy-empty"><ListTodo size={34}/><h3>{flowFilter!=="all"?"مفيش تاسكات في الحالة دي":reviewOnly?"مفيش تاسكات مستنية مراجعتك":manager?"لسه مفيش تاسكات هنا":"لسه مفيش تاسكات عندك"}</h3><p>{flowFilter!=="all"?"اختار حالة تانية أو اعرض الكل.":reviewOnly?"كل التسليمات متراجعة دلوقتي.":manager?"ابعتِ تاسك جديد وهيظهر هنا.":"أول ما ناردين تبعتلك تاسك هتلاقيه هنا."}</p></div>}
      </section>}
    </main>
    {showNotices&&<aside ref={noticeRef} id="stc-notices-panel" aria-label="الإشعارات" className="easy-notifications"><div className="easy-notification-top"><strong>الإشعارات {unread>0?"("+unread+" جديد)":""}</strong><button className="easy-icon" aria-label="إغلاق الإشعارات" onClick={()=>{setShowNotices(false);bellRef.current?.focus();}}><X size={18}/></button></div>
      {!notices.length&&<p>مفيش إشعارات لسه.</p>}
      {notices.map(n=><button key={n.id} className={"easy-notification "+(!n.read_at?"unread":"")} onClick={()=>void clickNotice(n)}><b>{n.kind==="waiting_review"?"تاسك مستني مراجعتك":n.kind==="approved"?"تم الاعتماد":n.kind==="changes_requested"?"مطلوب تعديل":n.kind==="deleted"?"التاسك اتمسح":n.kind==="updated"?"التاسك اتعدل":"تحديث جديد"}</b><span>{n.actor_name?n.actor_name+" · ":""}{n.task_title||tasks.find(t=>t.id===n.task_id)?.title||"تاسك"}</span><small>{new Date(n.created_at).toLocaleString("ar-EG",{timeZone:"Africa/Cairo"})}</small></button>)}
      {unread>0&&<button className="easy-read-all" onClick={()=>void(async()=>{const r=await supabase.from("stc_notifications").update({read_at:new Date().toISOString()}).is("read_at",null);if(r.error)setErr(r.error.message);else await refresh();})()}><CheckCheck size={17}/> علّمي الكل مقروء</button>}
    </aside>}
    {selected&&member&&<TaskDialog key={selected.id} task={selected} member={member} team={team} close={closeTask} refresh={refresh} notify={announce}/>}
    {creating&&member&&<CreateDialog people={people} initial={tab} memberId={member.id} close={()=>setCreating(false)} refresh={refresh} notify={announce}/>}
  </div>;
}
