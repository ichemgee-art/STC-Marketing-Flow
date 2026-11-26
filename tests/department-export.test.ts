import {test} from "node:test";
import assert from "node:assert/strict";
import {buildDepartmentWorkbook} from "../src/lib/seo-monthly-export";
import {parseSeoWorkbook} from "../src/lib/seo-workbook";
test("department report has one sheet per employee, distinct names and literal text",()=>{
 const data=buildDepartmentWorkbook([{name:"Sandra",subtitle:"iChem 2026-11",rows:[["2026-11-01","Work","A","=1+2","Done",8]]},{name:"Mohamed",subtitle:"STC",rows:[]},{name:"Sandra",subtitle:"duplicate",rows:[]},{name:"Esraa",subtitle:"content",rows:[]}]);
 const parsed=parseSeoWorkbook(Buffer.from(data));
 assert.deepEqual(parsed.sheets.map(s=>s.name),["Sandra","Mohamed","Sandra 2","Esraa"]);
 assert.equal(parsed.sheets[0].cells.D5,"=1+2");assert.equal(parsed.sheets[0].cells.F5,"8");assert.ok(!Buffer.from(data).includes(Buffer.from("<f>")));
});

test("content export has five clear columns, no movement column",()=>{const parsed=parseSeoWorkbook(Buffer.from(buildDepartmentWorkbook([{name:"Gerges",subtitle:"Content",kind:"content",headers:["التاسك","التفاصيل","تاريخ التكليف","موعد التسليم","الحالة"],rows:[["Marketing system","updates","26/11/2026","—","بانتظار المراجعة"]]}])));assert.equal(parsed.sheets[0].cells.A5,"Marketing system");assert.equal(parsed.sheets[0].cells.E5,"بانتظار المراجعة");assert.equal(parsed.sheets[0].cells.F5,undefined);});
