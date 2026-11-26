import {test} from "node:test";import assert from "node:assert/strict";
import {reportMonth,reportPeriod,inReportPeriod,campaignOverlaps,companyMonthRange,companyMonthKey,companyReportMonth,companyReportPeriod,companyDefaultDay} from "../src/lib/report-period";
import {buildSeoMonthlyWorkbook} from "../src/lib/seo-monthly-export";
import {parseSeoWorkbook} from "../src/lib/seo-workbook";
test("inclusive dates, leap days, invalid dates and Cairo midnight",()=>{
 const p=reportPeriod("2026-11-24","2026-11-30");
 assert.equal(p.next,"2026-12-01");assert.ok(inReportPeriod("2026-11-30",p));assert.ok(!inReportPeriod("2026-12-01",p));
 assert.ok(inReportPeriod("2026-11-23T22:00:00Z",p));assert.ok(!inReportPeriod("2026-11-30T22:00:00Z",p));
 assert.equal(reportMonth("2028-02").last,"2028-02-29");assert.throws(()=>reportPeriod("2026-02-30","2026-03-01"));assert.throws(()=>reportPeriod("2026-12-01","2026-11-01"));
 assert.deepEqual(reportPeriod("2026-10-20","2026-12-02").fullMonths,["2026-11"]);
 assert.ok(campaignOverlaps("2026-11-20","2026-11-24",p));assert.ok(!campaignOverlaps("2026-12-01","2026-12-04",p));
});
test("daily workbook includes the requested range across months",()=>{
 const period=reportPeriod("2026-11-30","2026-12-02");
 const hours=["2026-11-29","2026-11-30","2026-12-02","2026-12-03"].map(work_date=>({work_date,start_minutes:540,end_minutes:600,activities:work_date}));
 const wb=parseSeoWorkbook(Buffer.from(buildSeoMonthlyWorkbook({profileName:"Sandra",brand:"iChem",monthKey:"2026-11",period,hours,done:[]})));
 assert.equal(wb.sheets[1].cells.E5,"2026-11-30");assert.equal(wb.sheets[1].cells.E6,"2026-12-02");assert.equal(wb.sheets[1].cells.E7,undefined);assert.equal(Number(wb.sheets[1].cells.B3),2/24);
});

test("company cycles start on the 26th, end on the 25th and cross years",()=>{
 assert.deepEqual(companyMonthRange("2026-12"),{first:"2026-11-26",last:"2026-12-25",next:"2026-12-26"});
 assert.deepEqual(companyMonthRange("2027-01"),{first:"2026-12-26",last:"2027-01-25",next:"2027-01-26"});
 assert.equal(companyMonthKey("2026-11-25"),"2026-11");assert.equal(companyMonthKey("2026-11-26"),"2026-12");
 assert.equal(companyDefaultDay("2026-12","2026-11-26"),"2026-11-26");assert.equal(companyDefaultDay("2026-12","2026-11-25"),"2026-11-26");
 const r=companyReportMonth("2026-12");assert.equal(r.fileKey,"2026-12");assert.deepEqual(r.fullMonths,["2026-12"]);assert.ok(inReportPeriod("2026-12-25",r));assert.ok(!inReportPeriod("2026-12-26",r));
 assert.deepEqual(companyReportPeriod("2026-11-27","2027-01-25").fullMonths,["2027-01"]);
 assert.deepEqual(companyReportPeriod("2026-11-26","2027-01-25").fullMonths,["2026-12","2027-01"]);
});
