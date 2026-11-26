import {UI_EN} from "./ui-en";
const hasArabic = /[\u0600-\u06ff]/;
const westernDigits = (value: string) =>
  value.replace(/[٠-٩۰-۹]/g, ch => String(
    ch.charCodeAt(0) - (ch.charCodeAt(0) <= 0x0669 ? 0x0660 : 0x06f0)
  ));

const monthNames: Record<string,string> = {
  "يناير":"January","فبراير":"February","مارس":"March",
  "أبريل":"April","ابريل":"April","مايو":"May","يونيو":"June",
  "يوليو":"July","أغسطس":"August","اغسطس":"August",
  "سبتمبر":"September","أكتوبر":"October","اكتوبر":"October",
  "نوفمبر":"November","ديسمبر":"December",
};

export function translateText(source: string): string {
  if (!hasArabic.test(source)) return source;
  const direct = UI_EN[source];
  if (direct !== undefined) return direct;
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  const core = source.slice(leading.length, source.length - trailing.length || undefined);
  const exact = UI_EN[core] ?? UI_EN[core.replace(/\s+/g," ").trim()];
  if (exact !== undefined) return leading + westernDigits(exact) + trailing;
  // Dynamic UI templates only: preserve names and entered work after the fixed prefix.
  const employeeTasks = core.match(/^تاسكات (.+)$/);
  if(employeeTasks) return leading + "Tasks — " + employeeTasks[1] + trailing;
  const countPrefix = core.match(/^(ملاحظات اتحفظت قبل كده|سجل حركة التاسك|عرض المزيد|الاسكرينات|تفاصيل اليوم|الشغل اللي اتسجّل Done|شوف تقارير الأيام التانية|آخر الإنجازات والملاحظات|ملفات التاسك|الإشعارات)\s*\(([\d٠-٩]*)\)?$/);
  if(countPrefix) {
    const label=UI_EN[countPrefix[1]+" ("] ?? UI_EN[countPrefix[1]] ?? countPrefix[1];
    return leading + label.replace(/\s*\($/,"") + " (" + westernDigits(countPrefix[2]) + (core.endsWith(")")?")":"") + trailing;
  }
  const prefixes: [string,string][] = [
    ["الاسكرينات شهر ","Screenshots for "],["تقرير آخر 3 شهور — ","Last 3 months report — "],
    ["مقارنة الموقع · ","Website comparison · "],["متابعة السيو · ","SEO overview · "],
    ["التارجت الرسمي · ","Official target · "],["STC | التقرير الشهري ","STC | Monthly report "],
  ];
  for(const [ar,en] of prefixes) if(core.startsWith(ar))return leading+en+translateText(core.slice(ar.length))+trailing;
  const pending=core.match(/^([\d٠-٩]+)\s+(تقرير مستني مراجعتك|تقرير للمراجعة|للمراجعة)$/);
  if(pending)return leading+westernDigits(pending[1])+" "+(pending[2]==="للمراجعة"?"awaiting review":"reports awaiting review")+trailing;
  const percent=core.match(/^([\d٠-٩.]+)%\s+من المطلوب(?:\s+(النهارده))?$/);
  if(percent)return leading+westernDigits(percent[1])+"% of "+(percent[2]?"today's target":"target")+trailing;
  const embedded=core.match(/^(.*?)\s*·\s*قبل:\s*(.*?)\s*·\s*بعد:\s*(.*)$/);
  if(embedded)return leading+embedded[1]+" · Before: "+embedded[2]+" · After: "+embedded[3]+trailing;
  // Fixed fragments often live in separate React text nodes around numeric children.
  const fragment = UI_EN[core.trim()];
  if(fragment!==undefined)return leading+fragment+trailing;
  // Recognize only application-generated messages with known templates.
  // This does not translate arbitrary text written by employees.
  const importDone = core.match(/^اتحفظ (\d+) شيت ومعاهم (\d+) اسكرين\. تقدري تفتحيهم جوه السيستم\.$/);
  if (importDone) return leading + "Imported " + importDone[1] + " worksheets with " + importDone[2] + " screenshots. You can open them in the app." + trailing;
  const targetsCopied = core.match(/^الشهر الجديد اتفتح واتنسخ (\d+) تارجت من ([0-9-]+)، من غير إنجازات قديمة\.$/);
  if (targetsCopied) return leading + "Month created; " + targetsCopied[1] + " targets copied from " + targetsCopied[2] + " without previous completions." + trailing;
  const metricApproved = core.match(/^تمام، مقارنة (.+) تم اعتمادها وظهرت بالأخضر\.$/);
  if (metricApproved) return leading + translateText(metricApproved[1]) + " comparison approved." + trailing;
  const metricSent = core.match(/^(.+) اتبعت لناردين بأرقام قبل وبعد\. ✅$/);
  if (metricSent) return leading + translateText(metricSent[1]) + " Before/After results sent to Nardine ✅" + trailing;
  const screenshotDelete = core.match(/^متأكد إنك عايز تمسح الاسكرين دي نهائيًا من شهر (.+)؟$/);
  if (screenshotDelete) return leading + "Permanently delete this screenshot from " + translateText(screenshotDelete[1]) + "?" + trailing;
  // Date and duration values are presentation details, not workbook data.
  const duration = core.match(/^(\d+)\s*ساعة(?:\s*و(\d+)\s*دقيقة)?$/);
  if (duration) {
    const hours = Number(duration[1]), minutes = Number(duration[2] ?? 0);
    return leading + hours + (hours === 1 ? " hour" : " hours") +
      (minutes ? " and " + minutes + (minutes === 1 ? " minute" : " minutes") : "") + trailing;
  }
  const normalizedDate = core.replace(/[\u200e\u200f\u061c]/g, "");
  if (/^[٠-٩\d]{1,4}[\s\/،,\.:٠-٩\dصم]+$/.test(normalizedDate) &&
    /[٠-٩]/.test(normalizedDate)) {
    return leading + westernDigits(normalizedDate).replaceAll("،", ",")
      .replace(/\sص$/, " AM").replace(/\sم$/, " PM") + trailing;
  }
  const datedMonth = normalizedDate.match(/^([٠-٩\d]{1,2})\s+([\u0621-\u064a]+)([،,]?\s*[\d٠-٩:صم\s]*)$/);
  if (datedMonth && monthNames[datedMonth[2]]) {
    return leading + westernDigits(datedMonth[1]) + " " + monthNames[datedMonth[2]] +
      westernDigits(datedMonth[3]).replaceAll("،", ",").replace(/\sص$/, " AM").replace(/\sم$/, " PM") + trailing;
  }
  const matchMonth = core.match(/^([\u0621-\u064a]+)\s+([0-9٠-٩]{4})$/);
  if (matchMonth && monthNames[matchMonth[1]])
    return leading + monthNames[matchMonth[1]] + " " + westernDigits(matchMonth[2]) + trailing;
  // Unknown strings may contain employee-entered work, URLs or Excel data.
  // Leaving them unchanged is safer than modifying their source content.
  return source;
}

