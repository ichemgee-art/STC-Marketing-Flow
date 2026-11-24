"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardCheck, FileImage, Pencil, Plus, Target, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export type SeoTarget = {
  id:string;profile_id:string;month_key:string;title:string;details:string;
  target_count:number;target_unit:string;cadence:"monthly"|"daily";
};
export type SeoProgress = {
  id:string;target_id:string;work_date:string;done_count:number;note:string;created_by:string;created_at:string;
};
function cairoToday() {return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function sumFor(t:SeoTarget,logs:SeoProgress[],day:string) {
  return logs.filter(p=>p.target_id===t.id&&(t.cadence==="monthly"||p.work_date===day)).reduce((n,p)=>n+p.done_count,0);
}
function countAll(id:string, logs:SeoProgress[]) {return logs.filter(x=>x.target_id===id).reduce((sum,x)=>sum+x.done_count,0);}
export default function SeoTargetBoard({
 profileId,monthKey,manager,memberId,onNotice,onError,onAttach
}:{
 profileId:string;monthKey:string;manager:boolean;memberId:string;
 onNotice:(text:string)=>void;onError:(text:string)=>void;onAttach?:(targetId:string)=>void;
}) {
 const [targets,setTargets]=useState<SeoTarget[]>([]);
 const [progress,setProgress]=useState<SeoProgress[]>([]);
 const [create,setCreate]=useState(false);
 const [editing,setEditing]=useState<SeoTarget|null>(null);
 const [active,setActive]=useState<string|null>(null);
 const [amount,setAmount]=useState("1");
 const [note,setNote]=useState("");
 const [day,setDay]=useState(()=>cairoToday().startsWith(monthKey+"-")?cairoToday():monthKey+"-01");
 const [busy,setBusy]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const load=useCallback(async()=>{
   const t=await supabase.from("stc_seo_targets").select("*")
     .eq("profile_id",profileId).eq("month_key",monthKey).order("created_at");
   if(t.error){onError(t.error.message);return;}
   const list=t.data as SeoTarget[];
   setTargets(list);setLoaded(true);
   if(!list.length){setProgress([]);return;}
   const p=await supabase.from("stc_seo_progress").select("*").in("target_id",list.map(x=>x.id)).order("created_at",{ascending:false});
   if(p.error){onError(p.error.message);return;}
   setProgress(p.data as SeoProgress[]);
 },[profileId,monthKey,onError]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
   const channel=supabase.channel("seo-targets-"+profileId+"-"+monthKey)
     .on("postgres_changes",{event:"*",schema:"public",table:"stc_seo_targets"},()=>void load())
     .on("postgres_changes",{event:"*",schema:"public",table:"stc_seo_progress"},()=>void load())
     .subscribe();
   return()=>{void supabase.removeChannel(channel);};
 },[profileId,monthKey,load]);
 const monthCompleted=useMemo(()=>targets.filter(t=>t.cadence==="monthly"&&countAll(t.id,progress)>=t.target_count).length,[targets,progress]);
 async function saveTarget(form:HTMLFormElement){
   const f=new FormData(form);
   const title=String(f.get("title")||"").trim();
   const targetCount=Number(f.get("count"));
   if(title.length<2||!Number.isInteger(targetCount)||targetCount<1){onError("اكتبي اسم التارجت والعدد المطلوب بشكل صحيح.");return;}
   setBusy(true);
   try{
     const values={title,details:String(f.get("details")||"").trim(),
       target_count:targetCount,target_unit:String(f.get("unit")||"مهمة").trim()||"مهمة",
       cadence:String(f.get("cadence")||"monthly")};
     const r=editing
       ? await supabase.from("stc_seo_targets").update(values).eq("id",editing.id).eq("profile_id",profileId)
       : await supabase.from("stc_seo_targets").insert({...values,profile_id:profileId,month_key:monthKey,created_by:memberId});
     if(r.error)throw r.error;
     setEditing(null);setCreate(false);await load();onNotice("تمام، التارجت اتسجل وظهر لصاحب الشغل.");
   }catch(e){onError(e instanceof Error?e.message:"مقدرناش نحفظ التارجت.");}
   finally{setBusy(false);}
 }
 async function saveProgress(target:SeoTarget) {
   // The manager sets targets and reviews employee progress; only the
   // assigned specialist should report completed work.
   if(manager){onError("تسجيل الإنجاز متاح لصاحب الشغل بس، مش لناردين.");return;}
   const n=Number(amount);
   if(!Number.isInteger(n)||n<1||n>1000000){onError("عدد المنجز لازم يكون رقم صحيح أكبر من صفر.");return;}
   if(!day.startsWith(monthKey+"-")){onError("اختار يوم داخل نفس شهر التارجت.");return;}
   if(target.cadence==="monthly"&&sumFor(target,progress,day)+n>target.target_count){
     onError("العدد ده هيعدّي التارجت الشهري. راجع اللي اتسجّل الأول.");return;
   }
   if(target.cadence==="daily"&&sumFor(target,progress,day)+n>target.target_count){
     onError("العدد ده هيعدّي تارجت اليوم. لو الخطة اتغيرت، ناردين تقدر تعدّل العدد.");return;
   }
   setBusy(true);
   try{
     const r=await supabase.from("stc_seo_progress").insert({
       target_id:target.id,work_date:day,done_count:n,note:note.trim(),created_by:memberId,
     });
     if(r.error)throw r.error;
     setNote("");setAmount("1");setActive(null);await load();
     onNotice("اتسجّل الإنجاز ✅ وهتلاقيه في التقرير اليومي.");
   }catch(e){onError(e instanceof Error?e.message:"مقدرناش نسجّل الإنجاز.");}
   finally{setBusy(false);}
 }
 return <section className="seo-target-board">
  <div className="seo-target-header">
   <div><span className="seo-target-kicker">التارجت الرسمي · {monthKey}</span>
    <h2><Target size={23}/> التارجت والمتابعة</h2>
    <p>{manager?"انتي بتحددي المطلوب وبتتابعي اللي الموظف خلّصه. تسجيل الـDone والاسكرينات من حساب صاحب الشغل بس.":"ده المطلوب منك من ناردين. سجّل اللي خلّصته بـDone، وحط ملاحظة أو اسكرين لو محتاج."}</p>
   </div>
   <div className="seo-target-header-actions">
    <span className="seo-target-achievement"><CheckCircle2 size={18}/>{monthCompleted} تارجت شهري مكتمل</span>
    {manager&&<button type="button" className="seo-target-add" onClick={()=>{setEditing(null);setCreate(x=>!x);}}><Plus size={17}/> ضيفي تارجت</button>}
   </div>
  </div>
  {manager&&(create||editing)&&<form className="seo-target-editor" onSubmit={e=>{e.preventDefault();void saveTarget(e.currentTarget);}} key={editing?.id||"new"}>
    <div className="seo-editor-title"><strong>{editing?"عدّلي التارجت":"تارجت جديد للشهر"}</strong><button type="button" aria-label="إلغاء" onClick={()=>{setEditing(null);setCreate(false);}}><X size={17}/></button></div>
    <label>اسم الشغل<input name="title" defaultValue={editing?.title||""} placeholder="مثلاً: كتابة Blogs" required maxLength={180}/></label>
    <label>تفاصيل أو تعليمات (اختياري)<textarea name="details" defaultValue={editing?.details||""} rows={2} placeholder="المطلوب بالظبط…"/></label>
    <div className="seo-target-form-grid">
      <label>العدد المطلوب<input name="count" type="number" min="1" step="1" max="1000000" defaultValue={editing?.target_count||1} required/></label>
      <label>الوحدة<input name="unit" defaultValue={editing?.target_unit||"مهمة"} maxLength={30} placeholder="بلوج / منتج / صفحة"/></label>
      <label>كل إمتى؟<select name="cadence" defaultValue={editing?.cadence||"monthly"}><option value="monthly">في الشهر</option><option value="daily">كل يوم</option></select></label>
    </div>
    <button type="submit" className="seo-target-save" disabled={busy}>{busy?"بنحفظ…":"احفظي التارجت"}</button>
  </form>}
  {!loaded&&<p className="seo-empty-inline">بنحمّل التارجت…</p>}
  {loaded&&!targets.length&&<div className="seo-target-empty">
    <Target size={28}/><strong>لسه ناردين ماحددتش تارجت جديد للشهر ده.</strong>
    <p>الخطة اللي جاية من الإكسيل هتلاقيها تحت في بطاقات «الخطة القديمة». التارجت الجديد بيتسجّل من هنا.</p>
  </div>}
  {!!targets.length&&<>
    <div className="seo-target-day"><CalendarDays size={18}/><span>{manager?"اختاري اليوم عشان تشوفي اللي اتنفّذ:":"اليوم اللي هتسجّل عليه شغلك:"}</span>
      <input type="date" value={day} min={monthKey+"-01"} max={monthKey+"-31"} onChange={e=>setDay(e.target.value)}/>
    </div>
    <div className="seo-live-card-grid">{targets.map(target=>{
      const done=sumFor(target,progress,day);
      const all=countAll(target.id,progress);
      const pct=Math.min(100,Math.round((done/target.target_count)*100));
      const completed=done>=target.target_count;
      const entries=progress.filter(p=>p.target_id===target.id&&(target.cadence==="monthly"||p.work_date===day));
      return <article key={target.id} className={"seo-live-card"+(completed?" is-done":"")}>
       <div className="seo-live-card-top"><span className={"seo-live-cadence "+target.cadence}>{target.cadence==="daily"?"تارجت يومي":"تارجت شهري"}</span>
         <span className={completed?"seo-live-badge done":"seo-live-badge"}>{completed?"اتعمل ✓":manager?"مستني تنفيذ":"لسه شغال"}</span></div>
       <h3>{target.title}</h3>{target.details&&<p className="seo-live-details">{target.details}</p>}
       <div className="seo-live-figures"><strong>{done} <span>/ {target.target_count}</span></strong><small>{target.target_unit} {target.cadence==="daily"?"في اليوم":"في الشهر"}</small></div>
       <div className="seo-live-track"><div style={{width:pct+"%"}}/></div>
       <div className="seo-live-card-foot"><span>{pct}% من المطلوب {target.cadence==="daily"?"النهارده":""}</span>
         {manager&&<button type="button" className="seo-live-edit" onClick={()=>{setEditing(target);setCreate(false);}}><Pencil size={14}/> تعديل</button>}</div>
       {target.cadence==="daily"&&<p className="seo-target-month-count">إجمالي اللي اتسجّل في الشهر: {all} {target.target_unit}</p>}
       {!manager&&!completed&&<button type="button" className="seo-live-done-btn" disabled={busy} onClick={()=>{setActive(active===target.id?null:target.id);setNote("");setAmount("1");}}>
         <ClipboardCheck size={17}/> {active===target.id?"اقفل تسجيل الإنجاز":"سجّل Done / إنجاز"}
       </button>}
       {!manager&&active===target.id&&!completed&&<form className="seo-live-progress-form" onSubmit={e=>{e.preventDefault();void saveProgress(target);}}>
         <label>عملت كام؟<input type="number" min="1" max={target.target_count-done} value={amount} onChange={e=>setAmount(e.target.value)} required/></label>
         <label>ملاحظة (اختياري)<textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="اللي خلّصته أو رابط الشغل…"/></label>
         <button type="submit" disabled={busy}>{busy?"بنسجّل…":"تمام، سجّل الإنجاز"}</button>
       </form>}
       {entries.length>0&&<details className="seo-progress-history"><summary>آخر الإنجازات والملاحظات ({entries.length})</summary>
         {entries.slice(0,12).map(entry=><div key={entry.id}><b>{entry.done_count} {target.target_unit} · {entry.work_date}</b>{entry.note&&<p>{entry.note}</p>}</div>)}
       </details>}
       {!manager&&onAttach&&<button type="button" className="seo-live-attach" onClick={()=>onAttach(target.id)}><FileImage size={16}/> ارفع اسكرين للتارجت ده</button>}
      </article>;
    })}</div>
  </>}
 </section>;
}
