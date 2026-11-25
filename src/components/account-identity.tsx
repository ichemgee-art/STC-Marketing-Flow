"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import "./account-identity.css";

type Account = {
  id: string;
  displayName: string;
  role: "manager" | "member";
  department: "seo" | "media" | "team";
};

const knownArabicNames:Record<string,string> = {
  "nardine":"ناردين",
  "nardin":"ناردين",
  "nardin ichem":"ناردين",
  "gerges":"جرجس",
  "girgis":"جرجس",
  "mohamed omar":"محمد عمر",
  "mohammed omar":"محمد عمر",
  "sandra":"ساندرا",
  "ahmed el kholy":"أحمد الخولي",
  "ahmed elkholy":"أحمد الخولي",
};
function readableName(name:string){
  const normalized=name.trim().toLowerCase();
  return knownArabicNames[normalized] || name.trim();
}

/**
 * One account identity strip shared by every workspace.
 * Shows the authenticated member returned by Supabase, never a manually
 * selected employee or the SEO profile currently being reviewed by Nardine.
 */
export default function AccountIdentity(){
  const [userId,setUserId]=useState<string|null>(null);
  const [account,setAccount]=useState<Account|null>(null);
  const refreshId=useRef(0);

  useEffect(()=>{
    let live=true;
    let authEventSeen=false;
    void supabase.auth.getSession().then(({data})=>{
      if(live&&!authEventSeen)setUserId(data.session?.user.id||null);
    }).catch(()=>{});
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{
      authEventSeen=true;
      if(live)setUserId(session?.user.id||null);
    });
    return()=>{live=false;data.subscription.unsubscribe();};
  },[]);

  const refresh=useCallback(async (id:string)=>{
    const request=++refreshId.current;
    const [member,seo,media]=await Promise.all([
      supabase.from("stc_members").select("id,display_name,role,active")
        .eq("id",id).maybeSingle(),
      supabase.from("stc_seo_profiles").select("id").eq("member_id",id).limit(1),
      supabase.from("stc_media_profiles").select("id").eq("member_id",id).limit(1),
    ]);
    if(request!==refreshId.current)return;
    if(member.error||!member.data?.active){
      setAccount(null);return;
    }
    const role=member.data.role==="manager"?"manager":"member";
    setAccount({
      id,
      displayName:readableName(member.data.display_name||""),
      role,
      department:role==="manager"?"team":!media.error&&media.data?.length?"media":
        !seo.error&&seo.data?.length?"seo":"team",
    });
  },[]);

  useEffect(()=>{
    if(!userId){++refreshId.current;setAccount(null);return;}
    setAccount(null);
    void refresh(userId);
    const onFocus=()=>{if(document.visibilityState==="visible")void refresh(userId);};
    window.addEventListener("focus",onFocus);
    const interval=window.setInterval(onFocus,90_000);
    return()=>{
      ++refreshId.current;
      window.removeEventListener("focus",onFocus);
      window.clearInterval(interval);
    };
  },[userId,refresh]);

  if(!account||account.id!==userId||!account.displayName)return null;
  const roleLabel=account.role==="manager"?"الإدارة":
    account.department==="media"?"Media Buyer":
    account.department==="seo"?"فريق SEO":"عضو الفريق";
  return <div className="stc-account-identity" role="status"
    aria-label="الحساب الحالي" dir="rtl">
    <div className="stc-account-identity__inner">
      <span className="stc-account-identity__symbol" aria-hidden="true">
        {account.role==="manager"?<ShieldCheck size={18}/>:<UserRound size={18}/>}
      </span>
      <span className="stc-account-identity__caption">الحساب الحالي</span>
      <strong className="stc-account-identity__name" dir="auto">{account.displayName}</strong>
      <span className="stc-account-identity__separator" aria-hidden="true"/>
      <span className="stc-account-identity__role">{roleLabel}</span>
      <span className="stc-account-identity__verified">
        <span className="stc-account-identity__dot" aria-hidden="true"/>
        مسجّل دخول
      </span>
    </div>
  </div>;
}
