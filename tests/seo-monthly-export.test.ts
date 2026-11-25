import {test} from "node:test";
import assert from "node:assert/strict";
import {buildSeoMonthlyWorkbook,monthBounds} from "../src/lib/seo-monthly-export";
import {parseSeoWorkbook} from "../src/lib/seo-workbook";
test("month boundaries respect leap years and December rollover",()=>{
 assert.deepEqual(monthBounds("2028-02"),{first:"2028-02-01",next:"2028-03-01",last:"2028-02-29"});
 assert.equal(monthBounds("2026-12").next,"2027-01-01");
 assert.throws(()=>monthBounds("2026-13"));
});
test("XLSX preserves work periods, totals over 24h, Done-only days and literal user text",()=>{
 const hours=[{work_date:"2026-11-01",start_minutes:540,end_minutes:1020,activities:"=1+2 & <text>"},{work_date:"2026-11-01",start_minutes:1080,end_minutes:1200,activities:"Second"},{work_date:"2026-11-02",start_minutes:0,end_minutes:1440,activities:"Long"},{work_date:"2026-12-01",start_minutes:0,end_minutes:60,activities:"Exclude"}];
 const workbook=buildSeoMonthlyWorkbook({profileName:"Sandra",brand:"iChem",monthKey:"2026-11",hours,done:[{work_date:"2026-11-03",title:"SEO",unit:"pages",done_count:3,note:"Done"}]});
 const parsed=parseSeoWorkbook(Buffer.from(workbook));
 assert.equal(parsed.sheets.length,3);
 const [summary,detail,done]=parsed.sheets;
 assert.equal(detail.cells.E5,"=1+2 & <text>");
 assert.equal(detail.cells.E6,"Second");
 assert.equal(detail.cells.E7,"Long");
 assert.equal(detail.cells.E8,undefined);
 assert.equal(Number(detail.cells.B3),34/24);
 assert.equal(Number(summary.cells.B5),10/24);
 assert.equal(Number(summary.cells.B7),0);
 assert.equal(done.cells.B5,"SEO");
 assert.equal(Number(done.cells.C5),3);
 assert.ok(!Buffer.from(workbook).includes(Buffer.from("<f>")));
});
