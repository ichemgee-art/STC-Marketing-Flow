export type SoundKind="assigned"|"review"|"approved";
let context:AudioContext|null=null;
const played=new Map<string,number>();
export const soundEnabled=(user:string)=>{try{return localStorage.getItem("stc:sound:"+user)!=="off";}catch{return true;}};
export function setSoundEnabled(user:string,on:boolean){try{localStorage.setItem("stc:sound:"+user,on?"on":"off");}catch{}}
export async function unlockSound(){
 try{if(!context)context=new AudioContext();if(context.state!=="running")await context.resume();}catch{}
}
const melodies:Record<SoundKind,number[]>={assigned:[523.25,659.25],review:[587.33,523.25,659.25],approved:[523.25,659.25,783.99,1046.5]};
export function playSound(kind:SoundKind){
 if(!context||context.state!=="running")return;
 const ctx=context,now=ctx.currentTime;
 melodies[kind].forEach((freq,i)=>{
  const start=now+i*.115,osc=ctx.createOscillator(),gain=ctx.createGain();
  osc.type="sine";osc.frequency.value=freq;gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.075,start+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+.18);
  osc.connect(gain);gain.connect(ctx.destination);osc.start(start);osc.stop(start+.19);osc.onended=()=>{osc.disconnect();gain.disconnect();};
 });
}
export function notifySound(user:string,kind:SoundKind,id:string,timestamp:unknown){
 if(!soundEnabled(user)||!context||context.state!=="running"||typeof timestamp!=="string")return;
 const age=Date.now()-Date.parse(timestamp);if(!Number.isFinite(age)||age>120000||age< -120000)return;
 const key=user+":"+kind+":"+id;if(played.has(key))return;
 played.set(key,Date.now());if(played.size>500){const first=played.keys().next().value;if(first)played.delete(first);}
 // Same account open in several tabs: best effort cross-tab deduplication.
 try{const storage="stc:last-sound:"+user;const prior=JSON.parse(localStorage.getItem(storage)||"[]") as string[];if(prior.includes(key))return;localStorage.setItem(storage,JSON.stringify([...prior.slice(-39),key]));}catch{}
 playSound(kind);
}
