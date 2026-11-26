import {test} from "node:test";import assert from "node:assert/strict";
import {contentReportRows,contentSummary,CONTENT_HEADERS} from "../src/lib/content-report";
import {reportPeriod} from "../src/lib/report-period";
const period=reportPeriod("2026-11-26","2026-12-25");
const task={id:"a",title:"Marketing system",description:"updates",status:"waiting_review",created_at:"2026-11-26T12:22:00Z",updated_at:"2026-11-26T13:32:00Z",due_date:null,submission_note:"updates",text_deliverables:[]};
test("one task appears once, with notes and attachments merged and no audit movement rows",()=>{
 const events=[{task_id:"a",created_at:task.created_at,action:"assigned"},{task_id:"a",created_at:task.updated_at,action:"waiting_review"}];
 const rows=contentReportRows([task],events,[{task_id:"a",created_at:task.updated_at,body:"updates"}],[{task_id:"a",created_at:task.updated_at,filename:"design.png"}],period);
 assert.equal(rows.length,1);assert.deepEqual(rows[0],["Marketing system","updates\nالمرفقات: design.png","26/11/2026","—","بانتظار المراجعة"]);
 assert.deepEqual(contentSummary(rows),{total:1,approved:0,review:1,other:0});assert.equal(CONTENT_HEADERS.length,5);
});
test("historical report does not use status or text from after selected period",()=>{
 const changed={...task,status:"approved",description:"later edit",updated_at:"2026-12-27T12:00:00Z"};
 const rows=contentReportRows([changed],[{task_id:"a",created_at:task.updated_at,action:"waiting_review",details:{after:task}}],[],[],period);
 assert.equal(rows[0][4],"بانتظار المراجعة");assert.equal(rows[0][1],"updates");
 assert.deepEqual(contentReportRows([{...task,created_at:"2026-12-27T12:00:00Z",updated_at:"2026-12-27T12:00:00Z"}],[],[],[],period),[]);
});
