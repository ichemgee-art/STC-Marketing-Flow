"use client";
import {useRef,useState} from "react";
import {Pencil,Check,X} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {progressCount,progressError} from "@/lib/seo-progress-correction";
import type {SeoProgress} from "./seo-target-board";
export default function SeoProgressEdit({entry,qualitative=false,onSaved,onNotice,onError}:{entry:SeoProgress;qualitative?:boolean;onSaved:()=>Promise<void>;onNotice:(s:string)=>void;onError:(s:string)=>void}){
 const [open,setOpen]=useState(false),[amount,setAmount]=useState(""),[note,setNote]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const version=useRef(1),lock=useRef(false);
 function begin(){version.current=entry.version??1;setAmount(qualitative?(entry.done_count>0?"1":"0"):String(entry.done_count));setNote(entry.note||"");setError("");setOpen(true);}
 async function save(){
  if(lock.current)return;
  const count=qualitative?(amount==="0"?0:Math.max(1,entry.done_count)):progressCount(amount);if(count===null){setError("عدد المنجز لازم يكون رقم صحيح أكبر من أو يساوي صفر.");return;}
  if(!navigator.onLine){setError("الإنترنت مش متصل. بياناتك لسه موجودة.");return;}
  lock.current=true;setBusy(true);setError("");
  try{
   const r=await supabase.from("stc_seo_progress").update({done_count:count,note:note.trim()}).eq("id",entry.id).eq("version",version.current).select("id");
   if(r.error)throw r.error;
   if(!r.data?.length){setError("الإنجاز اتعدّل من مكان تاني. افتح التعديل من جديد بعد مراجعة آخر قيمة.");await onSaved();return;}
   setOpen(false);onNotice("تم حفظ تعديل الإنجاز وتحديث التقرير.");await onSaved();
  }catch(e){const msg=progressError(e);setError(msg);onError(msg);}
  finally{lock.current=false;setBusy(false);}
 }
 return <section className="seo-progress-correction">{!open?<button type="button" className="seo-progress-edit-btn" onClick={begin}><Pencil size={14}/> تعديل الإنجاز</button>:<form className="seo-progress-edit-form" onSubmit={e=>{e.preventDefault();void save();}}>
  {qualitative?<label>حالة التنفيذ<select value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy}><option value="1">تم التنفيذ</option><option value="0">لم يتم التنفيذ</option></select></label>:<label>العدد المنفذ<input type="number" value={amount} min={0} max={1000000} step={1} required onChange={e=>setAmount(e.target.value)} disabled={busy}/></label>}
  <label>ملاحظة (اختياري)<textarea rows={2} maxLength={3000} value={note} onChange={e=>setNote(e.target.value)} disabled={busy}/></label>
  {error&&<p role="alert" className="seo-progress-edit-error">{error}</p>}
  <div className="seo-progress-edit-actions"><button type="submit" disabled={busy}><Check size={15}/>{busy?"بنحفظ…":"حفظ التعديل"}</button><button type="button" disabled={busy} onClick={()=>setOpen(false)}><X size={15}/> إلغاء</button></div>
 </form>}</section>;
}
