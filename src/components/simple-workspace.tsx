"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { Session } from "@supabase/supabase-js";
import { Bell, Check, CheckCheck, CheckCircle2, ChevronLeft, Clock3, FileUp, LogOut, MessageCircle, Pencil, Plus, Send, Trash2, X, CalendarDays, UserRound, AlertCircle, ListTodo } from "lucide-react";
import { supabase, configured } from "@/lib/supabase";
import type { Task, Member, Notice, Attachment, Comment } from "@/lib/domain";

const cache = new Map<string, { tasks: Task[]; team: Member[]; notices: Notice[] }>();
const stage = (s: Task["status"]) => ({
  todo:"لسه متبدأتش",in_progress:"شغال عليها",tomorrow:"هتتعمل بكرة",
  waiting_review:"مستنية المراجعة",changes_requested:"مطلوب تعديلات",approved:"اتعتمدت ✓"
}[s]);
const date = (d: string|null) => d ? new Date(d+"T12:00:00Z").toLocaleDateString("ar-EG",{day:"numeric",month:"short",year:"numeric"}) : "من غير ميعاد";
const first = (name: string) => name.split(" ")[0] || name;

function Tile({task,who,manager,open}:{task:Task;who?:string;manager:boolean;open:()=>void}) {
  const late=!!task.due_date&&task.due_date<new Date().toISOString().slice(0,10)&&task.status!=="approved";
  return <button type="button" className={"easy-task easy-task--"+task.status} onClick={open}>
    <div className="easy-task-head"><span className={"easy-tag easy-tag--"+task.status}>{stage(task.status)}</span>{task.priority==="high"&&<span className="easy-priority">مستعجلة</span>}</div>
    <h3>{task.title}</h3>
    <p>{task.description || "افتح التاسك عشان تشوف تفاصيله"}</p>
    <div className="easy-task-meta">{manager&&<span><UserRound size={15}/>{who||"من التيم"}</span>}<span className={late?"easy-late":""}><CalendarDays size={15}/>{date(task.due_date)}</span></div>
    <div className="easy-task-footer">{task.status==="approved"?<strong className="easy-approved"><CheckCircle2 size={17}/> ناردين وافقت، عاش!</strong>
    :task.status==="waiting_review"&&manager?<strong className="easy-review-action">مستني موافقتك · راجعيه <ChevronLeft size={17}/></strong>
    :task.status==="waiting_review"?<strong>اتسلّم ومستني ناردين تراجعه</strong>
    :<strong>افتح التاسك <ChevronLeft size={17}/></strong>}</div>
  </button>;
}

function TaskDialog({task,member,team,close,refresh,notify}:{task:Task;member:Member;team:Member[];close:()=>void;refresh:()=>Promise<void>;notify:(s:string)=>void}) {
  const manager=member.role==="manager";
  const [note,setNote]=useState("");
  const [edit,setEdit]=useState(false);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const [oldNotes,setOldNotes]=useState<Comment[]>([]);
  const [files,setFiles]=useState<Attachment[]>([]);
  const getExtra=useCallback(async()=>{
    const [n,f]=await Promise.all([
      supabase.from("stc_comments").select("*").eq("task_id",task.id).order("created_at",{ascending:false}).limit(15),
      supabase.from("stc_attachments").select("*").eq("task_id",task.id).order("created_at",{ascending:false}).limit(15),
    ]);
    if(!n.error)setOldNotes(n.data||[]);
    if(!f.error)setFiles(f.data||[]);
  },[task.id]);
  useEffect(()=>{void getExtra();},[getExtra]);
  async function run(fn:()=>Promise<void>,message:string,shouldClose=true){
    setBusy(true);setErr("");
    try{await fn();await refresh();notify(message);if(shouldClose)close();else await getExtra();}
    catch(e){setErr(e instanceof Error?e.message:"حصلت مشكلة، جرّب تاني.");}
    finally{setBusy(false);}
  }
  async function change(status:Task["status"]){
    await run(async()=>{
      const values:Record<string,unknown>={status};
      if(status==="waiting_review")values.submission_note=note.trim();
      if(status==="approved"||status==="changes_requested")values.review_note=note.trim();
      const r=await supabase.from("stc_tasks").update(values).eq("id",task.id).eq("version",task.version).is("deleted_at",null).select("id");
      if(r.error)throw r.error;
      if(!r.data?.length)throw new Error("التاسك اتغيّر من حساب تاني. اقفله وافتحه تاني.");
    },status==="waiting_review"?"تمام! التاسك اتسلّم وناردين جالها إشعار.":status==="approved"?"اتعمد! صاحب التاسك جاله إشعار بالموافقة.":status==="changes_requested"?"تمام، التعديلات وصلت لصاحب التاسك.":"تم تحديث التاسك بنجاح.");
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
        priority:String(f.get("priority")),
      }).eq("id",task.id).eq("version",task.version).is("deleted_at",null).select("id");
      if(r.error)throw r.error;
      if(!r.data?.length)throw new Error("التاسك اتغيّر، افتحيه تاني.");
    },"التعديل اتحفظ وظهر عند صاحب التاسك.");
  }
  async function remove(){
    if(!window.confirm("متأكدة إنك عايزة تمسحي التاسك من عند الكل؟ هيختفي من القوائم، بس سجل الحذف محفوظ."))return;
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
    },"الملف اترفع على التاسك.",false);
  }
  async function download(file:Attachment){
    const r=await supabase.storage.from("stc-task-files").createSignedUrl(file.object_path,60,{download:file.filename});
    if(r.error){setErr(r.error.message);return;}
    window.open(r.data.signedUrl,"_blank","noopener,noreferrer");
  }
  return <div className="easy-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)close();}}>
    <section className="easy-dialog" role="dialog" aria-modal="true" aria-labelledby="easy-task-title">
      <div className="easy-dialog-top"><span className={"easy-tag easy-tag--"+task.status}>{stage(task.status)}</span><button className="easy-icon" onClick={close} aria-label="قفل"><X size={20}/></button></div>
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
      {!!oldNotes.length&&<details className="easy-details"><summary>ملاحظات اتحفظت قبل كده ({oldNotes.length})</summary>{oldNotes.map(n=><p key={n.id} className="easy-past-note">{n.body}</p>)}</details>}
      {manager&&<div className="easy-manager-tools">
        <div className="easy-tool-buttons">
          {task.status!=="approved"&&<button type="button" className="easy-link-btn" disabled={busy} onClick={()=>setEdit(v=>!v)}><Pencil size={16}/>{edit?"إلغاء التعديل":"عدّلي التاسك"}</button>}
          <button type="button" className="easy-link-btn easy-danger" disabled={busy} onClick={()=>void remove()}><Trash2 size={16}/> امسحي التاسك</button>
        </div>
        {edit&&task.status!=="approved"&&<form className="easy-form" onSubmit={e=>{e.preventDefault();void saveEdit(e.currentTarget);}}>
          <label>اسم التاسك<input name="title" required maxLength={300} defaultValue={task.title}/></label>
          <label>المطلوب<textarea name="description" rows={3} defaultValue={task.description}/></label>
          <label>مين هيعمله؟<select name="assignee" defaultValue={task.assignee_id}>{team.filter(p=>p.role==="member"&&p.active).map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
          <label>الميعاد<input name="due" type="date" defaultValue={task.due_date||""}/></label>
          <label>الأولوية<select name="priority" defaultValue={task.priority}><option value="normal">عادية</option><option value="high">مستعجلة</option><option value="low">مش مستعجلة</option></select></label>
          <button type="submit" className="easy-btn easy-btn--navy" disabled={busy}>احفظي التعديل</button>
        </form>}
      </div>}
      {err&&<div className="easy-error" role="alert">{err}</div>}
    </section>
  </div>;
}

function CreateDialog({people,initial,close,refresh,notify}:{people:Member[];initial:string;close:()=>void;refresh:()=>Promise<void>;notify:(s:string)=>void}){
  const [busy,setBusy]=useState(false),[err,setErr]=useState("");
  return <div className="easy-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
    <section className="easy-dialog" role="dialog" aria-modal="true" aria-labelledby="easy-create-title">
      <div className="easy-dialog-top"><span className="easy-eyebrow">تاسك جديد</span><button className="easy-icon" onClick={close} aria-label="قفل"><X size={20}/></button></div>
      <h2 id="easy-create-title">هتبعتي تاسك لمين؟</h2><p className="easy-description">اكتبي المطلوب واختاري مين هيعمله.</p>
      <form className="easy-form" onSubmit={e=>{
        e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setErr("");
        void(async()=>{try{
          const r=await supabase.from("stc_tasks").insert({
            title:String(f.get("title")||"").trim(),description:String(f.get("description")||""),
            assignee_id:String(f.get("assignee")),due_date:f.get("due")||null,priority:String(f.get("priority")),
          });
          if(r.error)throw r.error;
          await refresh();notify("التاسك اتبعت لصاحبه بنجاح!");close();
        }catch(e){setErr(e instanceof Error?e.message:"حصلت مشكلة، جرّبي تاني.");}finally{setBusy(false);}})();
      }}>
        <label>اسم التاسك<input name="title" required maxLength={300} placeholder="مثلاً: بوست عن منتج جديد"/></label>
        <label>مين هيعمله؟<select name="assignee" defaultValue={people.some(p=>p.id===initial)?initial:people[0]?.id} required>{people.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
        <label>مطلوب منه إيه؟<textarea name="description" rows={3} placeholder="التفاصيل والتعليمات…"/></label>
        <div className="easy-form-row"><label>ميعاد التسليم<input type="date" name="due"/></label>
          <label>الأولوية<select name="priority" defaultValue="normal"><option value="normal">عادية</option><option value="high">مستعجلة</option><option value="low">مش مستعجلة</option></select></label>
        </div>
        <button className="easy-btn easy-btn--navy" type="submit" disabled={busy}><Send size={17}/>{busy?"بنبعت…":"ابعتِ التاسك"}</button>
      </form>{err&&<p className="easy-error" role="alert">{err}</p>}
    </section>
  </div>;
}

export default function SimpleWorkspace(){
  const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false);
  const [member,setMember]=useState<Member|null>(null),[team,setTeam]=useState<Member[]>([]);
  const [tasks,setTasks]=useState<Task[]>([]),[notices,setNotices]=useState<Notice[]>([]);
  const [tab,setCurrentTab]=useState("all"),[reviewOnly,setReviewOnly]=useState(false);
  const [selected,setSelected]=useState<Task|null>(null),[creating,setCreating]=useState(false);
  const [showNotices,setShowNotices]=useState(false),[online,setOnline]=useState(false);
  const [err,setErr]=useState(""),[busy,setBusy]=useState(false),[toast,setToast]=useState("");
  const toastSerial=useRef(0);
  const userId=session?.user.id||null;
  const announce=useCallback((message:string)=>{setToast(message);toastSerial.current++;},[]);
  useEffect(()=>{
    void supabase.auth.getSession().then(({data,error})=>{if(error)setErr(error.message);setSession(data.session);setReady(true);});
    const {data}=supabase.auth.onAuthStateChange((_ev,s)=>{setSession(s);setReady(true);});
    return ()=>data.subscription.unsubscribe();
  },[]);
  useEffect(()=>{if(!toast)return;const id=toastSerial.current;const timer=setTimeout(()=>{if(id===toastSerial.current)setToast("");},5500);return()=>clearTimeout(timer);},[toast]);
  useEffect(()=>{
    if(!userId){setMember(null);setTeam([]);setTasks([]);setNotices([]);setSelected(null);return;}
    const prev=cache.get(userId);
    if(prev){setTasks(prev.tasks);setTeam(prev.team);setNotices(prev.notices);}
    try{setCurrentTab(sessionStorage.getItem("stc-simple-tab-"+userId)||"all");}catch{setCurrentTab("all");}
    setReviewOnly(false);
  },[userId]);
  const refresh=useCallback(async()=>{
    if(!userId)return;
    const m=await supabase.from("stc_members").select("*").eq("id",userId).maybeSingle();
    if(m.error){setErr(m.error.message);return;}
    if(!m.data?.active){setMember(null);setErr("الحساب مش متفعل. كلم ناردين.");return;}
    const [t,p,n]=await Promise.all([
      supabase.from("stc_tasks").select("*").is("deleted_at",null).order("updated_at",{ascending:false}).limit(1000),
      supabase.from("stc_members").select("*").eq("active",true),
      supabase.from("stc_notifications").select("*").order("created_at",{ascending:false}).limit(80),
    ]);
    const error=t.error||p.error||n.error;
    if(error){setErr(error.message);return;}
    const list=t.data as Task[];
    setMember(m.data);setTeam(p.data);setTasks(list);setNotices(n.data);setErr("");
    setSelected(prev=>prev?list.find(x=>x.id===prev.id)||null:null);
    cache.set(userId,{tasks:list,team:p.data,notices:n.data});
  },[userId]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    if(!userId)return;
    const ch=supabase.channel("simple-"+userId)
      .on("postgres_changes",{event:"*",schema:"public",table:"stc_tasks"},()=>void refresh())
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"stc_notifications",filter:"recipient_id=eq."+userId},payload=>{
        const n=payload.new as Notice;
        const message=n.kind==="waiting_review"?"سلّم التاسك ومستني مراجعتك"
          :n.kind==="approved"?"ناردين وافقت على التاسك ✅"
          :n.kind==="changes_requested"?"ناردين طلبت تعديل"
          :n.kind==="deleted"?"ناردين مسحت التاسك"
          :n.kind==="updated"?"ناردين عدّلت التاسك"
          :n.kind==="assigned"||n.kind==="reassigned"?"جالك تاسك جديد":"جالك تحديث";
        announce((n.actor_name?n.actor_name+": ":"")+message+(n.task_title?" — "+n.task_title:""));
        void refresh();
      }).subscribe(state=>setOnline(state==="SUBSCRIBED"));
    const poll=setInterval(()=>void refresh(),25000);
    return()=>{void supabase.removeChannel(ch);clearInterval(poll);setOnline(false);};
  },[userId,refresh,announce]);
  const manager=member?.role==="manager";
  const people=useMemo(()=>team.filter(p=>p.role==="member"&&p.active),[team]);
  const reviewTasks=tasks.filter(t=>t.status==="waiting_review");
  const visible=tasks.filter(t=>(!manager||tab==="all"||t.assignee_id===tab)&&(!reviewOnly||t.status==="waiting_review"));
  const unread=notices.filter(n=>!n.read_at).length;
  function choose(id:string,review=false){setCurrentTab(id);setReviewOnly(review);if(userId)try{sessionStorage.setItem("stc-simple-tab-"+userId,id);}catch{}}
  async function logout(){
    const id=userId;const r=await supabase.auth.signOut();
    if(r.error){setErr(r.error.message);return;}
    if(id)cache.delete(id);setMember(null);setTasks([]);setTeam([]);setNotices([]);
  }
  async function clickNotice(n:Notice){
    const r=await supabase.from("stc_notifications").update({read_at:new Date().toISOString()}).eq("id",n.id);
    if(r.error){setErr(r.error.message);return;}
    const task=tasks.find(x=>x.id===n.task_id);
    if(task){setSelected(task);setShowNotices(false);}
    await refresh();
  }
  if(!ready)return <div className="easy-loading">بنفتح مساحة الشغل…</div>;
  if(!session)return <main className="easy-login" dir="rtl">
    <div className="easy-login-brand"><Image src="/stc-logo.png" width={175} height={110} priority alt="STC"/><h1>شغلنا كله في مكان واحد.</h1><p>ناردين تبعت التاسك، تخلصه، وهي تراجعه وتوافق عليه.</p></div>
    <section className="easy-login-form"><span className="easy-eyebrow">STC MARKETING FLOW</span><h2>أهلاً بيك 👋</h2><p>سجّل دخول عشان تشوف التاسكات بتاعتك.</p>
      <form className="easy-form" onSubmit={e=>{
        e.preventDefault();const f=new FormData(e.currentTarget);
        if(!configured){setErr("إعدادات السيستم ناقصة.");return;}setBusy(true);setErr("");
        void supabase.auth.signInWithPassword({email:String(f.get("email")),password:String(f.get("password"))}).then(r=>{if(r.error)setErr(r.error.message);setBusy(false);});
      }}>
        <label>الإيميل<input name="email" type="email" required dir="ltr" autoComplete="username"/></label>
        <label>الباسورد<input name="password" type="password" required autoComplete="current-password"/></label>
        <button className="easy-btn easy-btn--navy" disabled={busy}>دخول</button>
      </form>{err&&<p className="easy-error" role="alert">{err}</p>}
    </section>
  </main>;
  return <div className="easy-shell" dir="rtl">
    <header className="easy-header"><div className="easy-brand"><Image src="/stc-logo.png" width={112} height={62} alt="STC"/><div><strong>Marketing Flow</strong><small>{manager?"متابعة شغل التيم":"تاسكاتي"}</small></div></div>
      <div className="easy-header-buttons"><span className={online?"easy-online":"easy-offline"}>{online?"متصل":"بيوصل…"}</span>
        <button className="easy-icon easy-bell" onClick={()=>setShowNotices(v=>!v)} aria-label="الإشعارات" title="الإشعارات"><Bell size={21}/>{unread>0&&<i>{unread}</i>}</button>
        <button className="easy-icon easy-logout" onClick={()=>void logout()} title="خروج"><LogOut size={19}/><span>خروج</span></button>
      </div>
    </header>
    <main className="easy-content">
      <section className="easy-intro"><div><span className="easy-eyebrow">{manager?"لوحة ناردين":"مساحة شغلي"}</span>
        <h1>{manager?"أهلاً يا ناردين 👋":"أهلاً يا "+first(member?.display_name||"")+" 👋"}</h1>
        <p>{manager?"اختاري اسم من التيم، وشوفي التاسكات بتاعته بسهولة.":"كل التاسكات بتاعتك هنا، افتح أي كارت عشان تتابعه."}</p></div>
        {manager&&<button className="easy-btn easy-btn--navy easy-create-button" onClick={()=>setCreating(true)}><Plus size={19}/> تاسك جديد</button>}
      </section>
      {err&&<div className="easy-error" role="alert">{err}<button onClick={()=>void refresh()}>جرّب تاني</button></div>}
      {manager&&<>
        <button className={"easy-review-banner "+(reviewOnly?"is-selected":"")} onClick={()=>choose("all",!reviewOnly)}>
          <span className="easy-review-symbol"><Clock3 size={25}/></span>
          <span className="easy-review-copy"><strong>{reviewTasks.length?"في "+reviewTasks.length+" تاسك مستني مراجعتك":"مفيش حاجة مستنية مراجعتك دلوقتي"}</strong><small>{reviewTasks.length?"دوسي هنا عشان تراجعي وتوافقي":"لما حد يسلّم تاسك هتلاقيه هنا"}</small></span>
          <b>{reviewTasks.length}</b><ChevronLeft size={19}/>
        </button>
        <nav className="easy-tabs" aria-label="أسماء التيم">
          <button className={"easy-tab "+(tab==="all"&&!reviewOnly?"active":"")} onClick={()=>choose("all")}><ListTodo size={18}/> كل التيم <b>{tasks.length}</b></button>
          {people.map((p,i)=><button key={p.id} className={"easy-tab easy-tab--"+i+" "+(tab===p.id&&!reviewOnly?"active":"")} onClick={()=>choose(p.id)}><span>{first(p.display_name).charAt(0)}</span>{p.display_name}<b>{tasks.filter(t=>t.assignee_id===p.id).length}</b></button>)}
        </nav>
      </>}
      {!manager&&<div className="easy-tip"><CheckCircle2 size={19}/> لما تخلص أي تاسك دوس <b>«خلصت، ابعتها لناردين»</b>، ولما توافق هيظهرلك بالأخضر.</div>}
      <div className="easy-section-heading"><h2>{reviewOnly?"مستنية مراجعتك":manager?(tab==="all"?"كل التاسكات":"تاسكات "+(people.find(p=>p.id===tab)?.display_name||"التيم")):"التاسكات بتاعتك"} <span>{visible.length}</span></h2>
        <p>{reviewOnly?"راجعي أي كارت واضغطي موافقة أو رجّعيه للتعديل.":"كل كارت فيه المطلوب وحالة التاسك وميعاد التسليم."}</p>
      </div>
      <div className="easy-grid">{visible.map(task=><Tile key={task.id} task={task} manager={!!manager} who={people.find(p=>p.id===task.assignee_id)?.display_name} open={()=>setSelected(task)}/>)}</div>
      {!visible.length&&<div className="easy-empty"><ListTodo size={34}/><h3>{reviewOnly?"مفيش تاسكات مستنية مراجعتك ✨":manager?"لسه مفيش تاسكات هنا":"لسه مفيش تاسكات عندك"}</h3><p>{reviewOnly?"كل التسليمات متراجعة دلوقتي.":manager?"ابعتِ تاسك جديد وهيظهر هنا.":"أول ما ناردين تبعتلك تاسك هتلاقيه هنا."}</p></div>}
    </main>
    {toast&&<div className="easy-toast" role="status" aria-live="polite"><CheckCircle2 size={22}/><span>{toast}</span><button className="easy-icon" onClick={()=>setToast("")} aria-label="قفل"><X size={16}/></button></div>}
    {showNotices&&<aside className="easy-notifications"><div className="easy-notification-top"><strong>الإشعارات {unread>0?"("+unread+" جديد)":""}</strong><button className="easy-icon" onClick={()=>setShowNotices(false)}><X size={18}/></button></div>
      {!notices.length&&<p>مفيش إشعارات لسه.</p>}
      {notices.map(n=><button key={n.id} className={"easy-notification "+(!n.read_at?"unread":"")} onClick={()=>void clickNotice(n)}><b>{n.kind==="waiting_review"?"تاسك مستني مراجعتك":n.kind==="approved"?"التاسك اتعمد ✓":n.kind==="changes_requested"?"مطلوب تعديل":n.kind==="deleted"?"التاسك اتمسح":n.kind==="updated"?"التاسك اتعدل":"تحديث جديد"}</b><span>{n.actor_name?n.actor_name+" · ":""}{n.task_title||tasks.find(t=>t.id===n.task_id)?.title||"تاسك"}</span><small>{new Date(n.created_at).toLocaleString("ar-EG",{timeZone:"Africa/Cairo"})}</small></button>)}
      {unread>0&&<button className="easy-read-all" onClick={()=>void(async()=>{const r=await supabase.from("stc_notifications").update({read_at:new Date().toISOString()}).is("read_at",null);if(r.error)setErr(r.error.message);else await refresh();})()}><CheckCheck size={17}/> علّمي الكل مقروء</button>}
    </aside>}
    {selected&&member&&<TaskDialog task={selected} member={member} team={team} close={()=>setSelected(null)} refresh={refresh} notify={announce}/>}
    {creating&&<CreateDialog people={people} initial={tab} close={()=>setCreating(false)} refresh={refresh} notify={announce}/>}
  </div>;
}
