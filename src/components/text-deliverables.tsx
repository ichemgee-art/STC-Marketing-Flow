"use client";
import {useState} from "react";
import {Copy,Plus,Trash2} from "lucide-react";
export function isTextTask(category:string|null|undefined){return category==="caption"||category==="content";}
export function submissionTexts(values:string[]){
 const clean=values.map(v=>v.trim());
 if(!clean.length||clean.some(v=>!v))throw Error("كمّل كل خانات الكتابة قبل التسليم، أو امسح الخانات الفاضية.");
 return clean;
}
export function TextDeliverables({kind,values,onChange,readOnly,busy,dirty,onSave}:{kind:"caption"|"content";values:string[];onChange:(v:string[])=>void;readOnly:boolean;busy:boolean;dirty:boolean;onSave:()=>void}){
 const [copied,setCopied]=useState<number|null>(null);
 const title=kind==="caption"?"Caption":"Content";
 async function copy(value:string,i:number){try{await navigator.clipboard.writeText(value);setCopied(i);}catch{setCopied(null);}}
 return <section className="easy-details stc-text-deliverables"><h3>{kind==="caption"?"الكابشن":"الكونتنت"}</h3>
 {values.map((v,i)=><div key={i} className="stc-text-box"><div className="stc-text-label"><label htmlFor={"text-deliverable-"+i}>{title} {i+1}:</label><div>{v.trim()&&<button type="button" className="easy-link-btn" onClick={()=>void copy(v,i)}><Copy size={15}/>{copied===i?"تم النسخ":"نسخ"}</button>}{!readOnly&&values.length>1&&<button type="button" className="easy-link-btn easy-danger" disabled={busy} aria-label="حذف الخانة" onClick={()=>onChange(values.filter((_,j)=>j!==i))}><Trash2 size={15}/></button>}</div></div>
 <textarea id={"text-deliverable-"+i} rows={4} maxLength={20000} data-no-translate value={v} readOnly={readOnly} disabled={busy} placeholder={kind==="caption"?"اكتب الكابشن هنا…":"اكتب الكونتنت هنا…"} onChange={e=>onChange(values.map((x,j)=>j===i?e.target.value:x))}/></div>)}
 {!readOnly&&<div className="stc-report-actions"><button type="button" className="easy-btn easy-btn--light" disabled={busy||values.length>=200} onClick={()=>onChange([...values,""])}><Plus size={16}/>{kind==="caption"?"إضافة كابشن":"إضافة كونتنت"}</button><button type="button" className="easy-btn easy-btn--navy" disabled={busy||!dirty} onClick={onSave}>حفظ المحتوى</button></div>}
 {!readOnly&&<small>احفظ المحتوى عشان يظهر لباقي التيم، أو ابعته لناردين للمراجعة.</small>}
 </section>;
}
