/**
 * Navigation persistence for STC Marketing Flow.
 *
 * Stores location only (never tasks, user details, access tokens or files).
 * Location is scoped to the signed-in Supabase user ID in localStorage.
 * A URL can be bookmarked/refreshed, with permissions checked separately.
 */
export type FlowLocation = {
  view:"tasks"|"seo"|"storage";
  person?:string;
  section?:"targets"|"metrics"|"daily"|"evidence"|"archive";
  month?:string;
  tab?:string;
  review?:boolean;
  task?:string;
};
const NAV_KEY="stc:location:v4:";
const params=["flow","person","section","month","tab","review","task"] as const;
const validSlug=(s:string|null):s is string=>!!s&&s.length<=128&&/^[a-z0-9_-]+$/i.test(s);
const validMonth=(s:string|null):s is string=>!!s&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s);
function parse(search:URLSearchParams):FlowLocation {
  const v=search.get("flow");
  const view:FlowLocation["view"]=v==="seo"||v==="storage"?v:"tasks";
  const location:FlowLocation={view};
  if(view==="seo"){
    const person=search.get("person"),section=search.get("section"),month=search.get("month");
    if(validSlug(person))location.person=person;
    if(section==="targets"||section==="metrics"||section==="daily"||
       section==="evidence"||section==="archive")location.section=section;
    if(validMonth(month))location.month=month;
  }else if(view==="tasks"){
    const tab=search.get("tab"),task=search.get("task");
    if(validSlug(tab))location.tab=tab;
    if(validSlug(task))location.task=task;
    if(search.get("review")==="1")location.review=true;
  }
  return location;
}
export function getFlowLocation(userId:string):FlowLocation {
  if(typeof window==="undefined")return {view:"tasks"};
  const url=new URL(window.location.href);
  if(url.searchParams.has("flow"))return parse(url.searchParams);
  try{
    const saved=localStorage.getItem(NAV_KEY+userId);
    if(saved)return parse(new URLSearchParams(saved));
  }catch{}
  return {view:"tasks"};
}
export function setFlowLocation(userId:string,location:FlowLocation,action:"replace"|"push"="replace"){
  if(typeof window==="undefined"||!userId)return;
  const url=new URL(window.location.href);
  for(const key of params)url.searchParams.delete(key);
  url.searchParams.set("flow",location.view);
  if(location.view==="seo"){
    if(location.person)url.searchParams.set("person",location.person);
    if(location.section)url.searchParams.set("section",location.section);
    if(location.month)url.searchParams.set("month",location.month);
  }else if(location.view==="tasks"){
    if(location.tab&&location.tab!=="all")url.searchParams.set("tab",location.tab);
    if(location.review)url.searchParams.set("review","1");
    if(location.task)url.searchParams.set("task",location.task);
  }
  const destination=url.pathname+url.search+url.hash;
  if(action==="push")window.history.pushState({...window.history.state,stcLocation:true},"",destination);
  else window.history.replaceState({...window.history.state,stcLocation:true},"",destination);
  const only=new URLSearchParams();
  for(const key of params){
    const value=url.searchParams.get(key);
    if(value!==null)only.set(key,value);
  }
  try{localStorage.setItem(NAV_KEY+userId,only.toString());}catch{}
}
export function clearFlowLocation(userId:string|null){
  if(typeof window==="undefined")return;
  if(userId)try{localStorage.removeItem(NAV_KEY+userId);}catch{}
  const url=new URL(window.location.href);
  for(const key of params)url.searchParams.delete(key);
  window.history.replaceState({...window.history.state,stcLocation:false},"",
    url.pathname+url.search+url.hash);
}
