export type ReportPeriod={first:string;last:string;next:string;label:string;fileKey:string;fullMonths:string[]};
const dayMs=86400000;
function validDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+"T00:00:00Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function addDays(date:string,days:number){if(!validDate(date))throw Error("اختار تاريخ صحيح.");return new Date(Date.parse(date+"T00:00:00Z")+days*dayMs).toISOString().slice(0,10);}
export function monthRange(month:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error("اختار شهر صحيح.");
 const first=month+"-01",d=new Date(first+"T00:00:00Z");d.setUTCMonth(d.getUTCMonth()+1);
 return {first,last:addDays(d.toISOString().slice(0,10),-1)};
}
export function reportPeriod(first:string,last:string):ReportPeriod{
 if(!validDate(first)||!validDate(last)||first>last)throw Error("اختار فترة صحيحة: تاريخ البداية قبل النهاية أو نفس اليوم.");
 const next=addDays(last,1),fullMonths:string[]=[];
 for(let month=first.slice(0,7);month<=last.slice(0,7);){
  const bounds=monthRange(month);
  if(bounds.first>=first&&bounds.last<=last)fullMonths.push(month);
  month=addDays(bounds.last,1).slice(0,7);
 }
 const isMonth=fullMonths.length===1&&first===monthRange(fullMonths[0]).first&&last===monthRange(fullMonths[0]).last;
 return {first,last,next,label:first+" — "+last,fileKey:isMonth?first.slice(0,7):first+"_to_"+last,fullMonths};
}
export function reportMonth(month:string){const {first,last}=monthRange(month);return reportPeriod(first,last);}
export function cairoDate(value:string){
 if(validDate(value))return value;
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(value));
 const get=(kind:string)=>parts.find(x=>x.type===kind)?.value;
 return get("year")+"-"+get("month")+"-"+get("day");
}
export function inReportPeriod(value:unknown,period:ReportPeriod){
 if(typeof value!=="string"||!value)return false;
 try{const date=cairoDate(value);return date>=period.first&&date<=period.last;}catch{return false;}
}
export function campaignOverlaps(start:unknown,end:unknown,period:ReportPeriod){
 return typeof start==="string"&&typeof end==="string"&&validDate(start)&&validDate(end)&&start<=end&&start<=period.last&&end>=period.first;
}
