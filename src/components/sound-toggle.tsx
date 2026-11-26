"use client";
import {useEffect,useState} from "react";
import {Volume2,VolumeX} from "lucide-react";
import {playSound,setSoundEnabled,soundEnabled,unlockSound} from "@/lib/notification-sound";
export default function SoundToggle({userId}:{userId:string}){
 const [enabled,setEnabled]=useState(true);
 useEffect(()=>{
  setEnabled(soundEnabled(userId));
  const unlock=()=>{if(soundEnabled(userId))void unlockSound();};
  document.addEventListener("pointerdown",unlock);document.addEventListener("keydown",unlock);
  return()=>{document.removeEventListener("pointerdown",unlock);document.removeEventListener("keydown",unlock);};
 },[userId]);
 return <button type="button" className="stc-sound-toggle" aria-pressed={enabled} aria-label={enabled?"كتم صوت الإشعارات":"تفعيل صوت الإشعارات"} title={enabled?"كتم صوت الإشعارات":"تفعيل صوت الإشعارات"} onClick={()=>{
  const on=!enabled;setEnabled(on);setSoundEnabled(userId,on);if(on)void unlockSound().then(()=>playSound("assigned"));
 }}>{enabled?<Volume2 size={16}/>:<VolumeX size={16}/>}</button>;
}
