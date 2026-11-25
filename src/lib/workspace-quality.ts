/** Small shared primitives for the workspace without changing auth or permissions. */
export function readableError(error:unknown):string {
  if(error instanceof Error && error.message)return error.message;
  if(typeof error==="object" && error!==null && "message" in error && typeof error.message==="string" && error.message)return error.message;
  return "حصلت مشكلة. حاول تاني؛ لو البيانات لسه موجودة متقفلش الصفحة.";
}
/** Merge a burst of realtime events into one refresh; direct save refreshes remain immediate. */
export function createRefreshScheduler(refresh:()=>void,delay=200){
  let timer:ReturnType<typeof setTimeout>|undefined;
  return {
    request(){if(timer!==undefined)return;timer=setTimeout(()=>{timer=undefined;refresh();},delay);},
    cancel(){if(timer!==undefined){clearTimeout(timer);timer=undefined;}},
  };
}
