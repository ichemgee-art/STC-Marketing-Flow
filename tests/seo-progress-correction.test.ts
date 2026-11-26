import {test} from "node:test";import assert from "node:assert/strict";
import {progressCount,progressError} from "../src/lib/seo-progress-correction";
test("achievement quantities must be positive integers",()=>{for(const v of ["","0","-1","1.5","1000001","NaN"])assert.equal(progressCount(v),null);assert.equal(progressCount("2"),2);});
test("target-limit errors receive an actionable Arabic message",()=>{assert.equal(progressError({message:"Achievement exceeds target limit"}),"العدد ده هيعدّي التارجت المطلوب.");});
