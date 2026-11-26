import type {Allocations,Brand,WeeklyDepartment} from "./weekly-report";
import type {ReportLanguage} from "./weekly-report-language";
import {addDays,cairoDate} from "./report-period";
export type Selection={brand:Brand;first:string;last:string;department:WeeklyDepartment;lang:ReportLanguage};
export type Draft={allocations:Allocations;posts:Record<string,string>;whatsapp:string;notes:string;selected:string[]};
type Store=Pick<Storage,"getItem"|"setItem">;
export const blankDraft=():Draft=>({allocations:{},posts:{},whatsapp:"",notes:"",selected:[]});
const prefix="stc:weekly-draft:v1:";
export const selectionKey=(id:string)=>prefix+id+":selection";
export const draftKey=(id:string,s:Selection)=>prefix+id+":period:"+JSON.stringify([s.brand,s.first,s.last]);
const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const isDate=(v:unknown):v is string=>typeof v==="string"&&(/^\d{4}-\d{2}-\d{2}$/.test(v)||v==="");
const stringMap=(v:unknown):Record<string,string>=>isObject(v)?Object.fromEntries(Object.entries(v).filter((e):e is [string,string]=>typeof e[1]==="string")):{};
function read(store:Store|null,key:string):unknown{try{return JSON.parse(store?.getItem(key)||"null");}catch{return null;}}
function write(store:Store|null,key:string,value:unknown){try{if(!store)return false;store.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
export function readSelection(store:Store|null,id:string,now=new Date().toISOString()):Selection{
 const last=cairoDate(now),fallback:Selection={brand:"stc",first:addDays(last,-6),last,department:"content",lang:"en"};
 const v=read(store,selectionKey(id));if(!isObject(v))return fallback;
 return {brand:v.brand==="ichem"?"ichem":"stc",first:isDate(v.first)?v.first:fallback.first,last:isDate(v.last)?v.last:fallback.last,department:v.department==="seo"||v.department==="media"||v.department==="all"?v.department:"content",lang:v.lang==="ar"?"ar":"en"};
}
export function readDraft(store:Store|null,id:string,selection:Selection):Draft{
 const v=read(store,draftKey(id,selection));if(!isObject(v))return blankDraft();
 const allocations:Allocations={};
 if(isObject(v.allocations))for(const [key,row] of Object.entries(v.allocations)){
  if(!["design","ai_image","ai_video","video","caption","content","datasheet","photo","other"].includes(key)||!isObject(row))continue;
  allocations[key]={published:typeof row.published==="string"?row.published:"",next:typeof row.next==="string"?row.next:"",unused:typeof row.unused==="string"?row.unused:""};
 }
 return {allocations,posts:stringMap(v.posts),whatsapp:typeof v.whatsapp==="string"?v.whatsapp:"",notes:typeof v.notes==="string"?v.notes:"",selected:Array.isArray(v.selected)?v.selected.filter((s):s is string=>typeof s==="string"):[]};
}
export const saveSelection=(store:Store|null,id:string,selection:Selection)=>write(store,selectionKey(id),selection);
export const saveDraft=(store:Store|null,id:string,selection:Selection,draft:Draft)=>write(store,draftKey(id,selection),draft);
export function browserDraftStore():Store|null{try{return typeof window==="undefined"?null:window.localStorage;}catch{return null;}}
