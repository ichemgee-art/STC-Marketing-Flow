"use client";

import Image from "next/image";
import { BarChart3, Camera, CheckCircle2, ChevronLeft, ClipboardCheck, FileSpreadsheet, ImageIcon, Info, Target, TrendingDown, TrendingUp } from "lucide-react";
import "./seo-historical-view.css";

type SourceCells=Record<string,string>;
export type HistoryPhoto={id:string;url:string;filename:string};
type HistoricalProps={
  slug:string;
  monthKey:string;
  monthLabel:string;
  cells:SourceCells;
  mode:"targets"|"metrics";
  photos:HistoryPhoto[];
  expectedPhotos:number;
  onGallery:()=>void;
  onOpenPhoto:(id:string)=>void;
};
const only=(value:string|undefined)=>String(value??"").trim();
function parseNumber(text:string):number|null {
 const s=only(text).replace(/,/g,"");
 if(!s||/^(-|—|n\/a|---)$/i.test(s))return null;
 const m=s.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(K|M)?\s*$/i);
 if(!m)return null;
 const factor=(m[2]||"").toUpperCase()==="K"?1000:(m[2]||"").toUpperCase()==="M"?1_000_000:1;
 return Number(m[1])*factor;
}
function short(value:string,limit=230){
 return value.length>limit?value.slice(0,limit)+"…":value;
}
type WorkRow={row:number;title:string;reported:string;plan:string;status:"complete"|"partial"|"undocumented";completed:number|null;target:number|null;detail:string};
function readTasks(cells:SourceCells,slug:string,month:string):WorkRow[]{
 const results:WorkRow[]=[];
 for(let row=7;row<=25;row++){
  const title=only(cells["A"+row]);
  if(!title)continue;
  const b=only(cells["B"+row]),c=only(cells["C"+row]);
  const looksDone=/\b(done|completed|finished)\b|تم\s*الانتهاء|اتعمل/i.test(b);
  const onlyNumberB=parseNumber(b),onlyNumberC=parseNumber(c);
  let completed:number|null=null,target:number|null=null;
  let status:WorkRow["status"]="undocumented";
  let detail="";
  if(slug==="mohamed-omar"&&month==="2026-10"&&row===7&&/^30\b/.test(b)&&onlyNumberC!==null){
    target=30;completed=onlyNumberC;status="partial";detail="المطلوب 30 رابط، والمذكور في تقرير الشهر 21. مراجعة التفاصيل من المصدر.";
  }else if(/stopped at 3 upon nardin/i.test(b)&&slug==="sandra"&&month==="2026-08"){
    completed=3;target=10;status="complete";detail="اتوقف عند 3 بطلب من ناردين، مع إن الخطة الأصلية كانت 10. تم اعتباره مكتمل حسب الملاحظة، مش 10/10.";
  }else if(onlyNumberB!==null&&onlyNumberC!==null&&onlyNumberC>0){
    completed=onlyNumberB;target=onlyNumberC;status=completed>=target?"complete":"partial";
  }else if(looksDone){
    status="complete";
    // A Done marker proves completion, but not the exact count; avoid converting
    // the plan count into a made-up executed count.
    if(onlyNumberC!==null&&onlyNumberC>0){target=onlyNumberC;}
    else {
      const match=c.match(/^\s*(\d+)\s*(blogs?|cards?|backlinks?|photos?)/i);
      if(match)target=Number(match[1]);
    }
    detail="الشيت الأصلي كاتب Done، لكن العدد المنفّذ مش مفصول عن الخطة بشكل مؤكد.";
  }else{
    target=onlyNumberC!==null&&onlyNumberC>0?onlyNumberC:null;
    const match=c.match(/^\s*(\d+)\s*(?:page|photo|blog|card|backlink)/i);
    if(!target&&match)target=Number(match[1]);
    detail="فيه خطة مكتوبة، لكن مفيش تسجيل واضح للعدد المنفّذ.";
  }
  results.push({row,title,reported:b,plan:c,status,completed,target,detail});
 }
 return results;
}
const metricMap:Record<string,string>={
 "organic traffic":"Organic Traffic",
 "ga4 / crm / form tracking":"GA4 / CRM / Forms",
 "ranking keywords":"Ranking Keywords",
 "backlink":"Backlinks",
 "backlinks":"Backlinks",
 "referring domains":"Referring Domains",
 "impressions":"Impressions",
 "ctr":"CTR",
 "average position":"Average Position",
 "ai responses":"AI Responses",
 "top keywords":"Top Keywords",
};
type HistoricalKPI={row:number;name:string;prev:string;current:string;target:string;change:string;state:string;headerF:string;headerG:string};
function readMetrics(cells:SourceCells):HistoricalKPI[]{
 const out:HistoricalKPI[]=[];
 for(let row=7;row<=19;row++){
  const raw=only(cells["E"+row]);
  if(!raw)continue;
  const name=metricMap[raw.toLowerCase()]||raw;
  // All original SEO workbooks store display values in F/G, target in I,
  // and the final status in J, even where headers are offset in Excel.
  out.push({
   row,name,prev:only(cells["F"+row]),current:only(cells["G"+row]),
   change:only(cells["H"+row]),target:only(cells["I"+row]),
   state:only(cells["J"+row]),
   headerF:only(cells.F6)||"Previous",headerG:only(cells.G6)||"Current",
  });
 }
 return out;
}
function PhotoBanner({photos,expectedPhotos,onGallery,onOpenPhoto}:{
 photos:HistoryPhoto[];expectedPhotos:number;onGallery:()=>void;onOpenPhoto:(id:string)=>void;
}){
 return <section className="seo-history-photos">
   <div className="seo-history-photos__heading"><Camera size={21}/>
    <div><strong>اسكرينات الشهر الأصلية</strong>
     <small>{photos.length?photos.length+" صورة جاهزة للعرض":expectedPhotos?expectedPhotos+" صورة في المصدر":"مفيش صور محفوظة للشهر ده"}</small></div>
    <button type="button" onClick={onGallery}><ImageIcon size={16}/> افتح معرض الشهر <ChevronLeft size={16}/></button>
   </div>
   {!!photos.length&&<div className="seo-history-photos__strip">
    {photos.slice(0,5).map(photo=><button type="button" key={photo.id} onClick={()=>onOpenPhoto(photo.id)}
      title={photo.filename}><Image src={photo.url} width={180} height={115} unoptimized alt={"اسكرين "+photo.filename}/></button>)}
   </div>}
 </section>;
}
export default function SeoHistoricalView({
 slug,monthKey,monthLabel,cells,mode,photos,expectedPhotos,onGallery,onOpenPhoto,
}:HistoricalProps){
 const isNovember=monthKey==="2026-11";
 const work=readTasks(cells,slug,monthKey);
 const metrics=readMetrics(cells);
 if(isNovember)return null;
 return <div className="seo-history-panel" dir="rtl">
  <header className="seo-history-head">
    <div className="seo-history-head__icon">{mode==="targets"?<ClipboardCheck size={24}/>:<BarChart3 size={24}/>}</div>
    <div><span>البيانات الأصلية المستوردة</span>
      <h2>{mode==="targets"?"شغل الشهر والتارجت — "+monthLabel:"مؤشرات SEO — "+monthLabel}</h2>
      <p>دي نتائج محفوظة من ملف الإكسيل الأصلي، مش تسجيلات Done جديدة ومش موافقات جديدة من ناردين.</p>
    </div>
  </header>
  {mode==="targets"?<>
    <div className="seo-history-explainer"><Info size={18}/>
      الكارت بيوضح الخطة والتقدم الموجودين في الشيت. لما يكون المصدر كاتب Done بس من غير عدد، بنعرض حالة الاكتمال من غير اختراع عدد.</div>
    <div className="seo-history-grid">
      {work.map(item=><article className={"seo-history-work seo-history-work--"+item.status} key={item.row}>
       <div className="seo-history-work__top"><span>خطة الشهر الأصلية</span>
        <b className={item.status}>{item.status==="complete"?"مكتمل حسب المصدر":item.status==="partial"?"تنفيذ جزئي":"التنفيذ غير موثق"}</b></div>
       <h3 dir="auto">{item.title}</h3>
       <div className="seo-history-work__stats">
         <div><span>المطلوب</span><strong dir="auto">{item.target!==null?String(item.target):item.plan?short(item.plan,120):"مش محدد"}</strong></div>
         <div><span>المنفّذ</span><strong dir="auto">{item.completed!==null?String(item.completed):item.status==="complete"?"Done":item.reported?short(item.reported,100):"مش متسجل"}</strong></div>
       </div>
       {item.target!==null&&item.completed!==null&&item.target>0&&<div className="seo-history-work__progress">
         <div style={{width:Math.max(0,Math.min(100,Math.round(item.completed/item.target*100)))+"%"}}/>
         <small>{Math.round(item.completed/item.target*100)}% من الخطة الأصلية</small>
       </div>}
       {item.detail&&<p className="seo-history-work__note">{item.detail}</p>}
       {item.reported&&item.completed===null&&item.status!=="complete"&&<p className="seo-history-work__note">ملاحظة الشيت: {short(item.reported,190)}</p>}
      </article>)}
    </div>
  </>:<>
    <div className="seo-history-explainer"><Info size={18}/>
      الأرقام متعرضة بالنص اللي في ملف الإكسيل، بما فيها الـK والـ% والحالات المكتوبة. الأعمدة اللي عنوانها مختلف هنوضحها بدل ما نفترض تحويلات غير مؤكدة.</div>
    {slug==="sandra"&&monthKey==="2026-10"&&<div className="seo-history-warning">
       تنبيه: بعض أرقام أكتوبر في المصدر مطابقة لسبتمبر. معروضين زي ما هم، لكن محتاجين تأكيد المصدر قبل اعتماد إنهم نتيجة أكتوبر الفعلية.
      </div>}
    <div className="seo-history-grid seo-history-grid--metrics">
      {metrics.map(item=>{
       const previousLabel=/previous/i.test(item.headerF)?"قبل":/current/i.test(item.headerF)?"القيمة المكتوبة (F)":"قبل / F";
       const currentLabel=/current/i.test(item.headerG)?"بعد":/change/i.test(item.headerG)?"القيمة المكتوبة (G)":"بعد / G";
       const numericBefore=parseNumber(item.prev),numericAfter=parseNumber(item.current);
       const pct=item.name==="CTR"?null:numericBefore!==null&&numericAfter!==null&&numericBefore>0?
        Math.round((numericAfter-numericBefore)/numericBefore*1000)/10:null;
       const statusText=item.state||"—";
       return <article className="seo-history-metric" key={item.row}>
        <div className="seo-history-metric__top"><BarChart3 size={19}/>
         <span>{statusText==="—"?"الحالة مش متسجلة":statusText}</span></div>
        <h3>{item.name}</h3>
        <div className="seo-history-metric__stats">
          <div><span>{previousLabel}</span><strong dir="auto">{item.prev||"مش متسجل"}</strong></div>
          <div><span>{currentLabel}</span><strong dir="auto">{item.current||"مش متسجل"}</strong></div>
        </div>
        {item.target&&<div className="seo-history-metric__target"><Target size={15}/>التارجت المذكور بالشيت: <strong dir="auto">{item.target}</strong></div>}
        {item.change&&<p className="seo-history-metric__change">التغيير في المصدر: <b dir="auto">{item.change}</b></p>}
        {!item.change&&pct!==null&&<p className="seo-history-metric__change">
           {pct>0?<TrendingUp size={15}/>:pct<0?<TrendingDown size={15}/>:<CheckCircle2 size={15}/>}
           فرق محسوب بين F وG: {pct>0?"+":""}{pct}%
          </p>}
       </article>;
      })}
    </div>
   </>}
   <PhotoBanner photos={photos} expectedPhotos={expectedPhotos} onGallery={onGallery} onOpenPhoto={onOpenPhoto}/>
   <p className="seo-history-source"><FileSpreadsheet size={15}/> كل القيم محفوظة من الشيت الأصلي، بما فيها الملاحظات والروابط. تقدر ترجع للمصدر الكامل من تاب «الشيتات القديمة».</p>
 </div>;
}
