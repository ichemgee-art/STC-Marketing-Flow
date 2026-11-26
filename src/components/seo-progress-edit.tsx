"use client";
import {useRef,useState} from "react";
import {Pencil,Check,X} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {progressCount,progressError} from "@/lib/seo-progress-correction";
import type {SeoProgress} from "./seo-target-board";
export default function SeoProgressEdit({entry,onSaved,onNotice,onError}:{entry:SeoProgress;onSaved:()=>Promise<void>;onNotice:(s:string)=>void;onError:(s:string)=>void}){
 const [open,setOpen]=useState(false),[amount,setAmount]=useState(""),[note,setNote]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const version=useRef(1),lock=useRef(false);
 function begin(){version.current=entry.version??1;setAmount(String(entry.done_count));setNote(entry.note||"");setError("");setOpen(true);}
 async function save(){
  if(lock.current)return;
  const count=progressCount(amount);if(count===null){setError("عدد المنجز لازم يكون رقم صحيح أكبر من صفر.");return;}
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
  <label>العدد المنفذ<input type="number" value={amount} min={1} max={1000000} step={1} required onChange={e=>setAmount(e.target.value)} disabled={busy}/></label>
  <label>ملاحظة (اختياري)<textarea rows={2} maxLength={3000} value={note} onChange={e=>setNote(e.target.value)} disabled={busy}/></label>
  {error&&<p role="alert" className="seo-progress-edit-error">{error}</p>}
  <div className="seo-progress-edit-actions"><button type="submit" disabled={busy}><Check size={15}/>{busy?"بنحفظ…":"حفظ التعديل"}</button><button type="button" disabled={busy} onClick={()=>setOpen(false)}><X size={15}/> إلغاء</button></div>
 </form>}</section>;
}
