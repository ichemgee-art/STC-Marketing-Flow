import {test} from "node:test";
import assert from "node:assert/strict";
import {seoMetricLabel,seoMetricTranslations} from "../src/lib/seo-metric-labels";
import {UI_EN} from "../src/lib/ui-en";
test("all ten SEO metrics have distinct Arabic labels and their original English names",()=>{
const pairs=[["organic_traffic","الزيارات من البحث المجاني","Organic Traffic"],["impressions","مرات الظهور","Impressions"],["ctr","نسبة النقر إلى الظهور","CTR"],["average_position","متوسط الترتيب","Average Position"],["ranking_keywords","الكلمات المفتاحية المصنّفة","Ranking Keywords"],["referring_domains","النطاقات المُحيلة","Referring Domains"],["backlinks","الروابط الخلفية","Backlinks"],["ga4_tracking","تتبّع التحليلات والعملاء والنماذج","GA4 / CRM / Forms"],["ai_responses","الظهور في إجابات الذكاء الاصطناعي","AI Responses"],["top_keywords","أهم الكلمات المفتاحية","Top Keywords"]];
for(const [key,ar,en] of pairs){assert.equal(seoMetricLabel(key),ar);assert.equal(seoMetricLabel(key,"en"),en);assert.equal(UI_EN[ar],en);}
assert.equal(seoMetricTranslations.length,10);
assert.equal(new Set(seoMetricTranslations.map(x=>x[0])).size,10);
});
