import {test} from "node:test";
import assert from "node:assert/strict";
import {readableError,createRefreshScheduler} from "../src/lib/workspace-quality";
test("preserve database and network error messages",()=>{
  assert.equal(readableError({message:"conflict"}),"conflict");
  assert.equal(readableError(new Error("offline")),"offline");
  assert.ok(readableError(null).length>0);
});
test("realtime bursts merge and cleanup cancels pending refresh",async()=>{
  let calls=0;
  const scheduler=createRefreshScheduler(()=>{calls++;},5);
  scheduler.request();scheduler.request();scheduler.request();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(calls,1);
  scheduler.request();scheduler.cancel();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(calls,1);
});
