"use client";
import {useEffect,useState} from "react";
import type {Task} from "@/lib/domain";
import {supabase} from "@/lib/supabase";
import {cairoDate} from "@/lib/report-period";
import type {Usage} from "@/lib/weekly-report";
import {ReportTaskFields,reportTaskValues} from "./report-task-fields";
import {readableError} from "@/lib/workspace-quality";
const states=[["published","تم النشر"],["used","تم الاستخدام"],["scheduled","مجدول للنشر"],["not_used","لم يستخدم بعد"],["cancelled","لن يستخدم"]] as const;
export default function TaskUsage({task,refresh}:{task:Task;refresh:()=>Promise<void>}){
 const [rows,setRows]=useState<Usage[]>([]),[current,setCurrent]=useState(""),[busy,setBusy]=useState(false),[err,setErr]=useState(""),[meta,setMeta]=useState(!task.report_brand||!task.report_category||task.actual_quantity==null);
 async function load(){const r=await supabase.from("stc_deliverable_usage").select("*").eq("task_id",task.id).order("created_at",{ascending:false});if(r.error)throw r.error;setRows(r.data||[]);}
 useEffect(()=>{void load().catch(e=>setErr(readableError(e)));},[task.id]);
 async function run(fn:()=>Promise<void>){if(busy)return;setBusy(true);setErr("");try{await fn();await load();await refresh();}catch(e){setErr(readableError(e));}finally{setBusy(false);}}
 const row=rows.find(r=>r.id===current);const allocated=rows.reduce((n,r)=>n+r.quantity,0);
 return <details className="easy-details"><summary>النشر والاستخدام</summary>{err&&<p role="alert" className="easy-error">{err}</p>}
 {meta?<form className="easy-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(async()=>{const quantity=Number(f.get("actual"));if(quantity<allocated)throw Error("العدد أقل من الاستخدام المسجل.");const r=await supabase.from("stc_tasks").update({...reportTaskValues(f),actual_quantity:quantity}).eq("id",task.id).eq("version",task.version).select("id");if(r.error)throw r.error;if(!r.data?.length)throw Error("التاسك اتغيّر، حدّثي الصفحة.");setMeta(false);});}}><ReportTaskFields task={task} required/><label>العدد المنفذ<input name="actual" type="number" min={0} max={1000000} required defaultValue={task.actual_quantity??""}/></label><button className="easy-btn easy-btn--navy" disabled={busy}>حفظ التعديل</button></form>:<>
 <p>{allocated} / {task.actual_quantity??"—"}</p>{rows.map(r=><div key={r.id} className="wr-archive"><span>{states.find(s=>s[0]===r.state)?.[1]} · {r.quantity} · {r.activity_date}</span><button type="button" className="easy-link-btn" onClick={()=>setCurrent(r.id)}>تعديل</button></div>)}
 <form key={current} className="easy-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(async()=>{const values={task_id:task.id,quantity:Number(f.get("quantity")),state:String(f.get("state")),activity_date:String(f.get("date")),note:String(f.get("note")||"")};const r=row?await supabase.from("stc_deliverable_usage").update(values).eq("id",row.id):await supabase.from("stc_deliverable_usage").insert(values);if(r.error)throw r.error;setCurrent("");});}}><div className="wr-fields"><label>حالة الاستخدام<select name="state" defaultValue={row?.state||"published"}>{states.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>الكمية<input name="quantity" type="number" min={1} max={Math.max(1,(task.actual_quantity??0)-allocated+(row?.quantity||0))} required defaultValue={row?.quantity||Math.max(1,(task.actual_quantity??0)-allocated)}/></label><label>تاريخ النشر أو الاستخدام<input name="date" type="date" required defaultValue={row?.activity_date||cairoDate(new Date().toISOString())}/></label></div><label>ملاحظة (اختياري)<textarea name="note" rows={2} defaultValue={row?.note||""}/></label><div className="stc-report-actions"><button className="easy-btn easy-btn--navy" disabled={busy||(!row&&allocated>=(task.actual_quantity??0))}>حفظ التعديل</button>{row&&<button type="button" className="easy-link-btn" onClick={()=>setCurrent("")}>إلغاء</button>}<button type="button" className="easy-link-btn" onClick={()=>setMeta(true)}>تعديل بيانات التقرير</button></div></form></>}
 </details>;
}
