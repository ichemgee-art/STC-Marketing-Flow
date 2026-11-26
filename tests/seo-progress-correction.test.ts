import {test} from "node:test";import assert from "node:assert/strict";
import {progressCount,progressError,targetQuantity,isTargetComplete} from "../src/lib/seo-progress-correction";
test("achievement quantities accept zero and positive integers",()=>{for(const v of ["","-1","1.5","1000001","NaN"])assert.equal(progressCount(v),null);assert.equal(progressCount("2"),2);assert.equal(progressCount("0"),0);});
test("target-limit errors receive an actionable Arabic message",()=>{assert.equal(progressError({message:"Achievement exceeds target limit"}),"العدد ده هيعدّي التارجت المطلوب.");});

test("optional targets are complete by status, not a visible numeric quota",()=>{assert.equal(targetQuantity(""),null);assert.equal(targetQuantity("0"),null);assert.equal(targetQuantity("5"),5);assert.equal(targetQuantity("-1"),undefined);assert.equal(isTargetComplete(null,0),false);assert.equal(isTargetComplete(null,1),true);assert.equal(isTargetComplete(5,0),false);});