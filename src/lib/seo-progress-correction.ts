import {inCompanyMonth} from "./report-period";
export function progressCount(value:string):number|null {
 if(!value.trim())return null;
 const n=Number(value);return Number.isInteger(n)&&n>=0&&n<=1000000?n:null;
}
export function progressError(error:unknown):string {
 const message=error instanceof Error?error.message:typeof error==="object"&&error!==null&&"message" in error?String(error.message):"";
 if(message.includes("Achievement exceeds target limit"))return "العدد ده هيعدّي التارجت المطلوب.";
 return message||"مقدرناش نحفظ تعديل الإنجاز.";
}

/** A blank or zero target means a task with no required quantity. */
export function targetQuantity(value:string):number|null|undefined{if(!value.trim())return null;const n=progressCount(value);return n===null?undefined:n===0?null:n;}
export function isTargetComplete(required:number|null,done:number){return done>=(required??1);}

// The monthly header and target board must use the same completion rule.
// Qualitative targets require a positive completion record; zero is not done.
export function countCompletedMonthlyTargets(
 targets:readonly {id:string;cadence:string;target_count:number|null}[],
 progress:readonly {target_id:string;done_count:number;work_date:string}[],
 monthKey:string
):number{
 const sums=new Map<string,number>();
 for(const row of progress){
  if(!inCompanyMonth(row.work_date,monthKey))continue;
  sums.set(row.target_id,(sums.get(row.target_id)||0)+row.done_count);
 }
 return targets.filter(t=>t.cadence==="monthly"&&isTargetComplete(t.target_count,sums.get(t.id)||0)).length;
}
