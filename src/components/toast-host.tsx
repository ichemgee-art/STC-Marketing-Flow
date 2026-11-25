"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Info, Trash2, X, XCircle } from "lucide-react";
import { showToast } from "@/lib/toasts";
import type { ToastKind, ToastMessage } from "@/lib/toasts";
import "./toast-host.css";

type ToastItem = ToastMessage & { id:number };

const labels:Record<ToastKind,string> = {
  success:"تمام، اتحفظ بنجاح",
  delete:"اتمسح بنجاح",
  info:"تم التحديث",
  error:"فيه حاجة محتاجة مراجعة",
};
const lifetime:Record<ToastKind,number>={success:4100,delete:5100,info:4400,error:6500};

export default function ToastHost(){
  const [items,setItems]=useState<ToastItem[]>([]);
  const next=useRef(0);
  useEffect(()=>{
    const onMessage=(e:Event)=>{
      const message=(e as CustomEvent<ToastMessage>).detail;
      if(!message || !message.message?.trim())return;
      const item:ToastItem={...message,id:++next.current};
      // A tiny stack keeps feedback visible without taking over the page.
      setItems(current=>[...current.filter(x=>x.message!==item.message),item].slice(-3));
    };
    window.addEventListener("stc:toast",onMessage);
    return()=>window.removeEventListener("stc:toast",onMessage);
  },[]);
  useEffect(()=>{
    if(!items.length)return;
    const timers=items.map(item=>window.setTimeout(()=>{
      setItems(current=>current.filter(x=>x.id!==item.id));
    },lifetime[item.kind]));
    return()=>timers.forEach(clearTimeout);
  },[items]);
  // The browser normally displays its own "Please fill out this field" balloon.
  // Keep HTML constraint validation intact, but surface the feedback as an STC toast.
  useEffect(()=>{
    let notified=false;
    const onInvalid=(event:Event)=>{
      const target=event.target;
      if(!(target instanceof HTMLInputElement ||
           target instanceof HTMLSelectElement ||
           target instanceof HTMLTextAreaElement))return;
      event.preventDefault();
      if(notified)return;
      notified=true;
      queueMicrotask(()=>{notified=false;});
      target.focus();
      const validity=target.validity;
      const message=validity.valueMissing?
        "كمّل الخانات المطلوبة قبل الحفظ أو الإرسال.":
        validity.typeMismatch||validity.patternMismatch?
        "راجع صيغة البيانات المدخلة في الخانة دي.":
        validity.rangeUnderflow||validity.rangeOverflow||validity.stepMismatch?
        "الرقم أو التاريخ المدخل خارج النطاق المسموح.":
        "راجع البيانات في الخانة المحددة وحاول تاني.";
      showToast(message,"error");
    };
    document.addEventListener("invalid",onInvalid,true);
    return()=>document.removeEventListener("invalid",onInvalid,true);
  },[]);
  return <div className="stc-toast-stack" dir="rtl" aria-label="رسائل السيستم">
    {items.map(item=><div key={item.id} className={"stc-toast-card stc-toast-card--"+item.kind}
      role={item.kind==="error"?"alert":"status"} aria-live={item.kind==="error"?"assertive":"polite"}>
      <span className="stc-toast-card__symbol">
        {item.kind==="delete"?<Trash2 size={21}/>:item.kind==="info"?<Info size={21}/>:
          item.kind==="error"?<XCircle size={21}/>:<CheckCircle2 size={21}/>}
      </span>
      <div className="stc-toast-card__copy">
        <strong>{item.title||labels[item.kind]}</strong>
        <span>{item.message}</span>
      </div>
      <button type="button" className="stc-toast-card__dismiss" aria-label="اقفل الرسالة"
        onClick={()=>setItems(current=>current.filter(x=>x.id!==item.id))}><X size={17}/></button>
      <div className="stc-toast-card__stripe" style={{animationDuration:lifetime[item.kind]+"ms"}}/>
    </div>)}
  </div>;
}
