/** Stable database keys with Arabic display labels and original English terminology. */
const labels:Record<string,readonly [string,string]>={
  "organic_traffic": [
    "الزيارات من البحث المجاني",
    "Organic Traffic"
  ],
  "impressions": [
    "مرات الظهور",
    "Impressions"
  ],
  "ctr": [
    "نسبة النقر إلى الظهور",
    "CTR"
  ],
  "average_position": [
    "متوسط الترتيب",
    "Average Position"
  ],
  "ranking_keywords": [
    "الكلمات المفتاحية المصنّفة",
    "Ranking Keywords"
  ],
  "referring_domains": [
    "النطاقات المُحيلة",
    "Referring Domains"
  ],
  "backlinks": [
    "الروابط الخلفية",
    "Backlinks"
  ],
  "ga4_tracking": [
    "تتبّع التحليلات والعملاء والنماذج",
    "GA4 / CRM / Forms"
  ],
  "ai_responses": [
    "الظهور في إجابات الذكاء الاصطناعي",
    "AI Responses"
  ],
  "top_keywords": [
    "أهم الكلمات المفتاحية",
    "Top Keywords"
  ]
};
export function seoMetricLabel(key:string,lang:"ar"|"en"="ar"):string{return labels[key]?.[lang==="ar"?0:1]??key;}
export const seoMetricTranslations:[string,string][]=Object.values(labels).map(([ar,en])=>[ar,en]);
