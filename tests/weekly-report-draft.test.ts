import {test} from "node:test";import assert from "node:assert/strict";import {readSelection,saveSelection,readDraft,saveDraft,blankDraft,draftKey} from "../src/lib/weekly-report-draft";
function storage(){const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};}
test("refresh restores selection and all entered values, with account/company/period isolation",()=>{
 const store=storage(),s={...readSelection(store,"manager","2026-11-26T12:00:00Z"),department:"media" as const,lang:"ar" as const};
 const draft={...blankDraft(),allocations:{design:{published:"12",next:"3",unused:"0"}},posts:{Facebook:"5"},whatsapp:"20",notes:"Weekly notes",selected:["campaign-1","campaign-2"]};
 assert.equal(saveSelection(store,"manager",s),true);assert.equal(saveDraft(store,"manager",s,draft),true);
 const restored=readSelection(store,"manager");assert.deepEqual(restored,s);assert.deepEqual(readDraft(store,"manager",restored),draft);
 assert.deepEqual(readDraft(store,"another",s),blankDraft());assert.deepEqual(readDraft(store,"manager",{...s,brand:"ichem"}),blankDraft());assert.deepEqual(readDraft(store,"manager",{...s,last:"2026-11-27"}),blankDraft());
 assert.deepEqual(readDraft(store,"manager",{...s,department:"content",lang:"en"}),draft);
 assert.equal(saveDraft(null,"manager",s,draft),false);
 store.setItem(draftKey("manager",s),"broken-json");assert.deepEqual(readDraft(store,"manager",s),blankDraft());
});
