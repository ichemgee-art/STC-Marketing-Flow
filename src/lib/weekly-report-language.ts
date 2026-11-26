import type {WeeklyPayload,WeeklySection} from "./weekly-report";
export type ReportLanguage="ar"|"en";
const words:Record<string,string>={"01 — Team Achievements":"١ — إنجازات الفريق","02 — Deliverables Utilization":"٢ — استخدام المخرجات","03 — Social Media Posting":"٣ — النشر على منصات التواصل","04 — SEO Achievements":"إنجازات تحسين محركات البحث","05 — Paid Campaigns":"الحملات الإعلانية","06 — WhatsApp":"رسائل واتساب","Team member":"عضو الفريق","Work type":"نوع العمل","Work performed":"الأعمال المنفذة","Completed work":"الأعمال المنجزة","Quantity":"الكمية","Approval date":"تاريخ الاعتماد","Activity date":"تاريخ النشاط","Status":"الحالة","Category":"التصنيف","Deliverable":"المخرج","Date":"التاريخ","Notes":"ملاحظات","Platform":"المنصة","Published posts":"المنشورات المنشورة","Source":"المصدر","Specialist":"المتخصص","Work":"العمل","Unit":"الوحدة","Post":"المنشور","Goal":"الهدف","Daily budget":"الميزانية اليومية","Currency":"العملة","From":"من","To":"إلى","Results":"النتائج","Metric":"المؤشر","Count":"العدد","Messages":"الرسائل","Manager entry":"إدخال الإدارة","Not recorded":"غير مسجل","Graphic Design":"تصميم جرافيك","AI Images":"صور ذكاء اصطناعي","AI Videos":"فيديوهات ذكاء اصطناعي","Videos":"فيديوهات","Captions":"نصوص المنشورات","Datasheets":"نشرات فنية","Photography":"تصوير","Other":"أخرى","Unclassified":"غير مصنف","Published":"تم النشر","Used":"تم الاستخدام","Scheduled":"مجدول","Not used yet":"لم يستخدم بعد","Will not be used":"لن يستخدم","Not yet classified":"لم تحدد حالة الاستخدام","Current unallocated quantity":"كمية لم تحدد حالة استخدامها","Assigned":"تم الإسناد","In progress":"جاري التنفيذ","Awaiting review":"بانتظار المراجعة","Changes requested":"مطلوب تعديل","Approved":"تم الاعتماد","pending_review":"بانتظار المراجعة","approved":"تم الاعتماد","changes_requested":"مطلوب تعديل","Facebook":"فيسبوك","Instagram":"إنستجرام","LinkedIn":"لينكدإن","TikTok":"تيك توك","YouTube":"يوتيوب","No recorded data":"لا توجد بيانات مسجلة"};
Object.assign(words,{"Hours worked (h:mm)":"ساعات العمل (ساعة:دقيقة)","Completed quantity":"إجمالي المنفذ","Published / used":"تم النشر أو الاستخدام","Next week":"الأسبوع القادم","Unused":"غير مستخدم","Not classified":"لم يحدد بعد","Add New Products":"إضافة منتجات جديدة","Blogs":"المقالات","Optimize Images":"تحسين الصور","Subcategories":"التصنيفات الفرعية"});
export function reportWord(value:string,lang:ReportLanguage){return lang==="ar"?words[value]??value:value;}
export function localizedSections(report:WeeklyPayload,lang:ReportLanguage):WeeklySection[]{
 return report.sections.map(section=>{
 const cols=section.headers.map((h,i)=>["Work type","Category","Status","Platform","Source","Metric"].includes(h)?i:-1).filter(i=>i>=0);
 return {title:reportWord(section.title,lang),headers:section.headers.map(h=>reportWord(h,lang)),rows:section.rows.map(row=>row.map((v,i)=>typeof v==="string"&&(cols.includes(i)||(section.title.includes("SEO")&&section.headers[i]==="Work")||((section.headers[i]==="Quantity"||section.headers[i]==="Count"||section.headers[i]==="Published posts"||section.headers[i]==="Daily budget")&&v==="Not recorded"))?reportWord(v,lang):v))};
 });
}

export function reportGroups(report:WeeklyPayload,lang:ReportLanguage){
 const sections=localizedSections(report,lang);
 const groups=[{title:lang==="ar"?"١. إنجازات الفريق":"1. Team Weekly Achievements",sections:[] as WeeklySection[]},{title:lang==="ar"?"٢. استخدام المخرجات":"2. Deliverables Utilization Details",sections:[] as WeeklySection[]},{title:lang==="ar"?"٣. النشر على منصات التواصل":"3. Social Media Posting",sections:[] as WeeklySection[]}];
 report.sections.forEach((s,i)=>{
 const index=s.title.includes("Utilization")?1:s.title.includes("Social Media")?2:0;
 const title=s.title.includes("Team Achievements")||index!==0?"":sections[i].title.replace(/^\d+\s*—\s*/,"");
 groups[index].sections.push({...sections[i],title});
 });
 return groups.filter(g=>g.sections.length);
}
