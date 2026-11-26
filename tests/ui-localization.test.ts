import {test} from "node:test";
import assert from "node:assert/strict";
import {translateText} from "../src/lib/translate-ui";
test("manager screenshot labels translate completely",()=>{
 for(const [ar,en] of [["المراجعات","Reviews"],["تسليمات محتاجة قرار منك","Submissions awaiting your decision"],["كل التسليمات متراجعة","All submissions reviewed"],["إخفاء التفاصيل","Hide details"],["عرض المراجعات","Show reviews"],["فريق المحتوى","Content team"],["فريق المحتوى والتصميم","Content & design team"]])assert.equal(translateText(ar),en);
 assert.equal(translateText("تاسكات Gerges"),"Tasks — Gerges");
 assert.equal(translateText(" تاسكات Esraa ")," Tasks — Esraa ");
});
test("dynamic labels and SEO notifications preserve data",()=>{
 assert.equal(translateText("عرض المزيد (24)"),"Show more (24)");
 assert.equal(translateText("تفاصيل اليوم (3)"),"Today's details (3)");
 assert.equal(translateText("مقارنة الموقع · 2026-11"),"Website comparison · 2026-11");
 assert.equal(translateText("تمام، مقارنة مرات الظهور تم اعتمادها وظهرت بالأخضر."),"Impressions comparison approved.");
 assert.equal(translateText("Gerges · 2026-11 · قبل: 10 · بعد: 20"),"Gerges · 2026-11 · Before: 10 · After: 20");
 assert.equal(translateText("محتوى خاص كتبه الموظف"),"محتوى خاص كتبه الموظف");
});
