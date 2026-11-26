/** Browser XLSX export: all user-supplied strings are literal inline cells, never formulas. */
export type ReportHour={work_date:string;start_minutes:number;end_minutes:number;activities:string};
export type ReportAchievement={work_date:string;title:string;unit:string;done_count:number;note:string};
import {reportMonth,type ReportPeriod} from "./report-period";
type Report={profileName:string;brand:string;monthKey:string;hours:ReportHour[];done:ReportAchievement[];period?:ReportPeriod};
export function monthBounds(month:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error("اختار شهر صحيح.");
 const d=new Date(month+"-01T00:00:00Z");d.setUTCMonth(d.getUTCMonth()+1);
 return {first:month+"-01",next:d.toISOString().slice(0,10),last:new Date(d.getTime()-86400000).toISOString().slice(0,10)};
}
type Cell={v:string|number;s:number};
const c=(v:string|number,s=0):Cell=>({v,s});
const esc=(v:string)=>v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main",rel="http://schemas.openxmlformats.org/officeDocument/2006/relationships",pkg="http://schemas.openxmlformats.org/package/2006/relationships";
const header=(labels:string[])=>labels.map(v=>c(v,1));
const duration=(m:number)=>c(m/1440,4);
const day=(s:string)=>c(Date.parse(s+"T00:00:00Z")/86400000+25569,2);
const time=(m:number)=>c(m/1440,3);
function sheet(rows:Cell[][],widths:number[]){
 const end=String.fromCharCode(64+widths.length);
 return xml+'<worksheet xmlns="'+ns+'"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>'+widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join("")+'</cols><sheetData>'+rows.map((row,i)=>{
  const rn=i+1,ht=i===0?30:i===3?28:Math.min(250,Math.max(23,...row.map(x=>typeof x.v==="string"?x.v.split("\n").reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/65)),0)*20:23)));
  return '<row r="'+rn+'" ht="'+ht+'" customHeight="1">'+row.map((x,j)=>{
   const ref=String.fromCharCode(65+j)+rn;
   return typeof x.v==="number"?'<c r="'+ref+'" s="'+x.s+'"><v>'+x.v+'</v></c>':'<c r="'+ref+'" s="'+x.s+'" t="inlineStr"><is><t xml:space="preserve">'+esc(x.v)+'</t></is></c>';
  }).join("")+'</row>';
 }).join("")+'</sheetData><autoFilter ref="A4:'+end+rows.length+'"/><mergeCells count="2"><mergeCell ref="A1:'+end+'1"/><mergeCell ref="A2:'+end+'2"/></mergeCells></worksheet>';
}
const styles=xml+'<styleSheet xmlns="'+ns+'"><numFmts count="3"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="[h]:mm"/><numFmt numFmtId="166" formatCode="[h]:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/><color rgb="FF253A55"/></font><font><b/><sz val="12"/><name val="Arial"/><color rgb="FFFFFFFF"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF253A55"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF1C9"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
const enc=new TextEncoder();
function crc(data:Uint8Array){let v=0xffffffff;for(const b of data){v^=b;for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0);}return (v^0xffffffff)>>>0;}
function zip(files:Record<string,string|Uint8Array>){
 const chunks:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0,total=0;
 for(const [name,content] of Object.entries(files)){
  const n=enc.encode(name),data=typeof content==="string"?enc.encode(content):content,sum=crc(data);
  const local=new Uint8Array(30+n.length),l=new DataView(local.buffer);
  l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint32(14,sum,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);l.setUint16(26,n.length,true);local.set(n,30);
  const ct=new Uint8Array(46+n.length),v=new DataView(ct.buffer);
  v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint32(16,sum,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,n.length,true);v.setUint32(42,offset,true);ct.set(n,46);
  chunks.push(local,data);central.push(ct);offset+=local.length+data.length;total+=ct.length;
 }
 const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,central.length,true);v.setUint16(10,central.length,true);v.setUint32(12,total,true);v.setUint32(16,offset,true);
 const output=new Uint8Array(offset+total+22);let pos=0;for(const part of [...chunks,...central,end]){output.set(part,pos);pos+=part.length;}return output;
}
export function buildSeoMonthlyWorkbook(report:Report){
 const period=report.period??reportMonth(report.monthKey);
 const {first,next}=period,inMonth=(s:string)=>s>=first&&s<next;
 const hours=report.hours.filter(h=>inMonth(h.work_date)).sort((a,b)=>a.work_date.localeCompare(b.work_date)||a.start_minutes-b.start_minutes);
 const done=report.done.filter(h=>inMonth(h.work_date)).sort((a,b)=>a.work_date.localeCompare(b.work_date));
 const days=[...new Set([...hours.map(h=>h.work_date),...done.map(h=>h.work_date)])].sort();
 const total=hours.reduce((n,h)=>n+h.end_minutes-h.start_minutes,0);
 const prefix=(title:string,labels:string[])=>[[c(title,1)],[c(report.profileName+" | "+report.brand+" | "+period.label)],[c("إجمالي ساعات الفترة"),c(total/1440,5)],header(labels)];
 const detail=prefix("STC | فترات العمل",["التاريخ","من الساعة","إلى الساعة","مدة الفترة","الأعمال المنفذة"]);
 for(const h of hours)detail.push([day(h.work_date),time(h.start_minutes),time(h.end_minutes),duration(h.end_minutes-h.start_minutes),c(h.activities)]);
 const daily=prefix("STC | ملخص التقرير",["التاريخ","إجمالي ساعات اليوم","عدد الفترات","الأعمال المسجلة","عدد سجلات Done"]);
 for(const date of days){const rows=hours.filter(h=>h.work_date===date);daily.push([day(date),duration(rows.reduce((n,h)=>n+h.end_minutes-h.start_minutes,0)),c(rows.length),c(rows.map(h=>h.activities).join("\n")),c(done.filter(h=>h.work_date===date).length)]);}
 const achievements=prefix("STC | الإنجازات المسجلة Done",["التاريخ","التارجت","المنفذ","الوحدة","الملاحظات"]);
 for(const h of done)achievements.push([day(h.work_date),c(h.title),c(h.done_count),c(h.unit),c(h.note||"")]);
 const names=[period.fileKey===report.monthKey?"ملخص الشهر":"ملخص الفترة","فترات العمل","الإنجازات"],sheets=[sheet(daily,[17,23,17,85,22]),sheet(detail,[17,17,17,18,85]),sheet(achievements,[17,42,15,20,75])];
 return packWorkbook(names,sheets);
}
function packWorkbook(names:string[],sheets:string[]){
 return zip({
  "[Content_Types].xml":xml+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+names.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("")+'</Types>',
  "_rels/.rels":xml+'<Relationships xmlns="'+pkg+'"><Relationship Id="rId1" Type="'+rel+'/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  "xl/workbook.xml":xml+'<workbook xmlns="'+ns+'" xmlns:r="'+rel+'"><bookViews><workbookView/></bookViews><sheets>'+names.map((n,i)=>'<sheet name="'+esc(n)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join("")+'</sheets></workbook>',
  "xl/_rels/workbook.xml.rels":xml+'<Relationships xmlns="'+pkg+'">'+names.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+rel+'/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join("")+'<Relationship Id="rId'+(names.length+1)+'" Type="'+rel+'/styles" Target="styles.xml"/></Relationships>',
  "xl/styles.xml":styles,...Object.fromEntries(sheets.map((s,i)=>["xl/worksheets/sheet"+(i+1)+".xml",s]))
 });
}

export type DepartmentSheet={name:string;subtitle:string;rows:(string|number)[][]};
export function buildDepartmentWorkbook(reports:DepartmentSheet[]){
 const used=new Set<string>();
 const names=reports.map(r=>{
  const base=r.name.replace(/[\\/?*\[\]:]/g," ").replace(/^'+|'+$/g,"").trim().slice(0,28)||"Report";
  let name=base,i=2;while(used.has(name.toLowerCase()))name=base.slice(0,26)+" "+i++;
  used.add(name.toLowerCase());return name;
 });
 const sheets=reports.map(r=>sheet([[c("STC | تقرير الفترة",1)],[c(r.subtitle)],[c("البيانات المسجلة في السيستم")],header(["التاريخ","النوع","العمل / العنوان","التفاصيل","الحالة","القيمة / المدة"]),...r.rows.map(row=>row.map(v=>c(v)))],[23,24,42,105,24,22]));
 return packWorkbook(names,sheets);
}

import type {WeeklyPayload} from "./weekly-report";
export function buildWeeklyWorkbook(report:WeeklyPayload,logo:Uint8Array){
 const names=["Achievements","Utilization","Social media","SEO","Campaigns","WhatsApp"];
 const sheets=report.sections.map(section=>sheet([[c(section.title,1)],[c(report.brand==="stc"?"STC":"iChem")],[c(report.first+" — "+report.last) ],header(section.headers),...section.rows.map(row=>row.map(v=>c(v)))],section.headers.map((_,i)=>i===2?55:28)));
 const drawing=xml+'<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="1100000" cy="450000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Company logo"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="'+rel+'" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>';
 const linked=sheets.map(s=>s.replace('</worksheet>','<drawing xmlns:r="'+rel+'" r:id="rId1"/></worksheet>'));
 const relationships=(body:string)=>xml+'<Relationships xmlns="'+pkg+'">'+body+'</Relationships>';
 const relationship=(id:string,type:string,target:string)=>'<Relationship Id="'+id+'" Type="'+rel+'/'+type+'" Target="'+target+'"/>';
 const files:Record<string,string|Uint8Array>={
 "[Content_Types].xml":xml+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'+names.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("")+'</Types>',
 "_rels/.rels":relationships(relationship("rId1","officeDocument","xl/workbook.xml")),
 "xl/workbook.xml":xml+'<workbook xmlns="'+ns+'" xmlns:r="'+rel+'"><sheets>'+names.map((n,i)=>'<sheet name="'+n+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join("")+'</sheets></workbook>',
 "xl/_rels/workbook.xml.rels":relationships(names.map((_,i)=>relationship("rId"+(i+1),"worksheet","worksheets/sheet"+(i+1)+".xml")).join("")+relationship("rId"+(names.length+1),"styles","styles.xml")),
 "xl/styles.xml":styles,"xl/drawings/drawing1.xml":drawing,"xl/drawings/_rels/drawing1.xml.rels":relationships(relationship("rId1","image","../media/logo.png")),"xl/media/logo.png":logo};
 linked.forEach((s,i)=>{files["xl/worksheets/sheet"+(i+1)+".xml"]=s;files["xl/worksheets/_rels/sheet"+(i+1)+".xml.rels"]=relationships(relationship("rId1","drawing","../drawings/drawing1.xml"));});
 return zip(files);
}
