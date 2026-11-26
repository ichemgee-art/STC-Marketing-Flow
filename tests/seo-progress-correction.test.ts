import {test} from "node:test";import assert from "node:assert/strict";
import {progressCount,progressError,targetQuantity,isTargetComplete,countCompletedMonthlyTargets,scopedSeoProgress} from "../src/lib/seo-progress-correction";
test("achievement quantities accept zero and positive integers",()=>{for(const v of ["","-1","1.5","1000001","NaN"])assert.equal(progressCount(v),null);assert.equal(progressCount("2"),2);assert.equal(progressCount("0"),0);});
test("target-limit errors receive an actionable Arabic message",()=>{assert.equal(progressError({message:"Achievement exceeds target limit"}),"العدد ده هيعدّي التارجت المطلوب.");});

test("optional targets are complete by status, not a visible numeric quota",()=>{assert.equal(targetQuantity(""),null);assert.equal(targetQuantity("0"),null);assert.equal(targetQuantity("5"),5);assert.equal(targetQuantity("-1"),undefined);assert.equal(isTargetComplete(null,0),false);assert.equal(isTargetComplete(null,1),true);assert.equal(isTargetComplete(5,0),false);});
test("December summary does not count three blank monthly targets as complete",()=>{
 const targets=[...Array.from({length:3},(_,i)=>({id:"blank"+i,cadence:"monthly",target_count:null})),...Array.from({length:6},(_,i)=>({id:"numeric"+i,cadence:"monthly",target_count:4})),{id:"daily",cadence:"daily",target_count:null}];
 assert.equal(countCompletedMonthlyTargets(targets,[],"2026-12"),0);
 const progress=[{target_id:"blank0",done_count:0,work_date:"2026-12-01"},{target_id:"blank1",done_count:1,work_date:"2026-11-25"},{target_id:"blank2",done_count:1,work_date:"2026-11-26"},{target_id:"numeric0",done_count:3,work_date:"2026-12-01"},{target_id:"numeric0",done_count:1,work_date:"2026-12-02"},{target_id:"daily",done_count:1,work_date:"2026-12-01"}];
 assert.equal(countCompletedMonthlyTargets(targets,progress,"2026-12"),2);
});

test("daily Done list isolates target month even when old record shares new cycle date",()=>{
 const targets=[{id:"nov",month_key:"2026-11"},{id:"dec",month_key:"2026-12"}];
 const progress=[{target_id:"nov",work_date:"2026-11-26",done_count:1},{target_id:"dec",work_date:"2026-11-26",done_count:0},{target_id:"dec",work_date:"2026-12-25",done_count:1},{target_id:"dec",work_date:"2026-12-26",done_count:2},{target_id:"unknown",work_date:"2026-11-26",done_count:9}];
 assert.deepEqual(scopedSeoProgress(targets,progress,"2026-12"),[progress[1],progress[2]]);
 assert.deepEqual(scopedSeoProgress(targets,progress,"2026-11"),[]);
 assert.deepEqual(scopedSeoProgress(targets,progress,""),[]);
});
