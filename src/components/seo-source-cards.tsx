"use client";

import { useMemo, useState } from "react";
import { BarChart3, BookOpen, CheckCircle2, ChevronDown, FileText, Link2, Target } from "lucide-react";

type Props = {
  cells: Record<string, string>;
  links: Record<string, string>;
  comments: Record<string, string>;
  quarter?: boolean;
  mode?: "all" | "summary" | "archive";
};
type Item = { label: string; values: { heading: string; value: string; href?: string; note?: string }[]; row: number };
function colNumber(address: string) {
  const match = address.match(/^[A-Z]+/);
  if (!match) return 0;
  return [...match[0]].reduce((acc, letter) => acc * 26 + letter.charCodeAt(0) - 64, 0);
}
function labelForColumn(n: number) {
  let result = "";
  for (let v = n; v > 0; v = Math.floor((v - 1) / 26)) result = String.fromCharCode(65 + ((v - 1) % 26)) + result;
  return result;
}
function validUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? value : null;
  } catch { return null; }
}
function RowCard({item,kind}: {item: Item;kind: "plan"|"metric"|"research"}) {
  const primary = item.values.filter(v => v.value.trim() && v.value.trim() !== item.label);
  return <article className={"seo-fancy-card seo-fancy-card--" + kind}>
    <div className="seo-fancy-card__header">
      <span className="seo-fancy-card__icon">{kind === "plan" ? <Target size={18}/> : kind === "metric" ? <BarChart3 size={18}/> : <BookOpen size={18}/>}</span>
      <span className="seo-fancy-card__number">من تقرير الشهر</span>
    </div>
    <h3 dir="auto">{item.label}</h3>
    <div className="seo-fancy-card__fields">
      {primary.length ? primary.map((v,i) => <div className="seo-fancy-card__field" key={i}>
        <span className="seo-fancy-card__field-name">{v.heading}</span>
        <strong dir="auto">{v.value}</strong>
        {v.note && <p dir="auto">{v.note}</p>}
        {v.href && <a href={v.href} target="_blank" rel="noopener noreferrer"><Link2 size={13}/> افتح المرجع</a>}
      </div>) : <p className="seo-fancy-card__unfilled">مفيش تفاصيل مكتوبة في الخانة دي.</p>}
    </div>
  </article>;
}
export default function SeoSourceCards({cells,links,comments,quarter,mode="all"}:Props) {
  const [expand,setExpand]=useState(false);
  const [showResearch,setShowResearch]=useState(false);
  const [query,setQuery]=useState("");
  const extracted=useMemo(()=>{
    const byRow = new Map<number,Map<number,{value:string;address:string}>>();
    for (const [address,value] of Object.entries(cells || {})) {
      if (!/^[A-Z]+\d+$/.test(address) || String(value).trim()==="") continue;
      const row = Number(address.match(/\d+$/)?.[0]||0);
      if(!byRow.has(row))byRow.set(row,new Map());
      byRow.get(row)!.set(colNumber(address),{value:String(value).trim(),address});
    }
    const ordered=[...byRow.entries()].sort((a,b)=>a[0]-b[0]);
    const plan:Item[]=[],metric:Item[]=[],research:Item[]=[];
    const consumed=new Set<string>();
    function take(row:number, cols:number[], titleColumn:number, kind:"plan"|"metric"|"research", title?:string) {
      const line=byRow.get(row);
      if(!line)return;
      const name=title||line.get(titleColumn)?.value||"";
      if (!name)return;
      if (kind!=="research" && (/^(monthly plan|monthly performance|kpi|target|current|previous|per month|status|month|task|activities)$/i.test(name) || row<7))return;
      const fields=cols.filter(c=>c!==titleColumn && line.has(c)).map(c=>{
        const cell=line.get(c)!;
        consumed.add(cell.address);
        const heading=kind==="plan"?(c===3?"التارجت من الإكسيل":c===4?"نتيجة أو ملاحظة":"تفاصيل من الشيت"):kind==="metric"?
          (byRow.get(6)?.get(c)?.value || (c===6?"القيمة":c===7?"المقارنة":c===8?"التارجت":"الحالة"))
          : "بيانات إضافية";
        return {heading,value:cell.value,href:validUrl(links?.[cell.address]||cell.value)||undefined,note:comments?.[cell.address]};
      });
      const titleAddress=line.get(titleColumn)?.address;
      if(titleAddress)consumed.add(titleAddress);
      const item={label:name,values:fields,row};
      if(kind==="plan")plan.push(item);else if(kind==="metric")metric.push(item);else research.push(item);
    }
    for(const [row,values] of ordered) {
      if(!quarter) {
        if(values.has(1) && row>=7)take(row,[1,2,3,4],1,"plan");
        else if(values.has(2) && row>=7 && !values.has(1))take(row,[1,2,3,4],2,"plan");
        if(values.has(5) && row>=7)take(row,[5,6,7,8,9,10],5,"metric");
      }
      const extra=[...values.keys()].filter(c=>quarter?c>=1:c>=11);
      if(extra.length && (quarter || row>=7)) {
        const titleCol=extra[0],cellsHere=extra.filter(c=>values.get(c)?.value);
        take(row,cellsHere,titleCol,"research");
      }
    }
    const remaining:Item[]=[];
    for(const [row,line] of ordered) {
      const fields=[...line.values()].filter(c=>!consumed.has(c.address));
      if(!fields.length)continue;
      const label=fields[0].value;
      remaining.push({label, row, values:fields.slice(1).map(v=>({
        heading:"من التقرير الأصلي",value:v.value,
        href:validUrl(links?.[v.address]||v.value)||undefined,
        note:comments?.[v.address],
      }))});
    }
    return {plan,metric,research,remaining};
  },[cells,links,comments,quarter]);
  const contains=(item:Item)=>!query.trim()||(item.label+" "+item.values.map(v=>v.value).join(" ")).toLowerCase().includes(query.trim().toLowerCase());
  return <div className="seo-structured">
    {(mode!=="summary")&&<section className="seo-fancy-section">
      <div className="seo-fancy-section__heading"><span className="seo-section-emblem"><Target size={20}/></span>
        <div><h2>{quarter?"مقارنة الـ3 شهور":"الخطة والتارجت اللي في الشيت"}</h2><p>كل عنصر متعرض في كارت منفصل بدل جدول الإكسيل. الأرقام هي اللي كانت مكتوبة فعلًا.</p></div>
        <span className="seo-count-tag">{(quarter?extracted.research:extracted.plan).length} عنصر</span>
      </div>
      <div className="seo-fancy-grid">{(quarter?extracted.research:extracted.plan).filter(contains).map(item=><RowCard key={item.row} item={item} kind="plan"/>)}</div>
      {(quarter?extracted.research:extracted.plan).length===0&&<div className="seo-no-records">مش متسجل تارجت واضح في الجزء ده من الشيت.</div>}
    </section>}
    {!quarter&&mode!=="archive"&&<section className="seo-fancy-section">
      <div className="seo-fancy-section__heading"><span className="seo-section-emblem seo-section-emblem--blue"><BarChart3 size={20}/></span>
        <div><h2>نتايج الموقع وSEO Performance</h2><p>الـKPIs الموجودة في المصدر، من غير افتراض إن الخانات الفاضية = صفر.</p></div>
        <span className="seo-count-tag">{extracted.metric.length} مؤشر</span>
      </div>
      <div className="seo-fancy-grid seo-fancy-grid--metric">{extracted.metric.filter(contains).map(item=><RowCard key={item.row} item={item} kind="metric"/>)}</div>
    </section>}
    {!quarter&&mode!=="summary"&&extracted.research.length>0&&<section className="seo-fancy-section">
      <div className="seo-fancy-section__heading"><span className="seo-section-emblem seo-section-emblem--purple"><BookOpen size={20}/></span>
        <div><h2>التحليل والكلمات والملاحظات</h2><p>المصادر والتفاصيل الموجودة في الشيت الأصلي.</p></div>
        <span className="seo-count-tag">{extracted.research.length} سجل</span>
      </div>
      <div className="seo-fancy-grid">{extracted.research.filter(contains).slice(0,showResearch?undefined:6).map(item=><RowCard key={item.row} item={item} kind="research"/>)}</div>
      {extracted.research.filter(contains).length>6&&<button className="seo-all-toggle" type="button" onClick={()=>setShowResearch(x=>!x)}>
        {showResearch?"اعرض تفاصيل أقل":"اعرض باقي سجلات التحليل ("+(extracted.research.filter(contains).length-6)+")"}
      </button>}
    </section>}
    {mode!=="summary"&&<section className="seo-fancy-more">
      <button type="button" onClick={()=>setExpand(x=>!x)} aria-expanded={expand}>
        <FileText size={17}/>{expand?"اقفل باقي تفاصيل التقرير":"شوف باقي التفاصيل الأصلية اللي في التقرير"}
        <ChevronDown size={16}/>
      </button>
      {expand&&<div>
        <label>دور على كلمة في تفاصيل الشيت
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="اكتب الكلمة هنا…"/>
        </label>
        <div className="seo-fancy-grid">{extracted.remaining.filter(contains).map(item=><RowCard key={item.row} item={item} kind="research"/>)}</div>
        {!extracted.remaining.length&&<p className="seo-no-records"><CheckCircle2 size={17}/> كل التفاصيل اتوزعت على البطاقات فوق.</p>}
      </div>}
    </section>}
  </div>;
}
