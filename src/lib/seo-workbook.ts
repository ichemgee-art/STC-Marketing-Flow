import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import path from "node:path";

export type SeoImage = {
  bytes: Buffer;
  filename: string;
  mime: string;
  row: number;
  col: number;
  index: number;
};
export type SeoSheet = {
  name: string;
  cells: Record<string, string>;
  links: Record<string, string>;
  comments: Record<string, string>;
  images: SeoImage[];
};
export type SeoWorkbook = { hash: string; sheets: SeoSheet[] };

function decode(s: string) {
  return s.replace(/&#x([0-9a-f]+);/gi, (_, x: string) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#([0-9]+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of raw.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    out[match[1]] = decode(match[2] ?? match[3] ?? "");
  }
  return out;
}
function openTags(xml: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const rx = new RegExp("<(?:[\\w-]+:)?" + tag + "\\b([^>]*?)\\/?>", "g");
  for (const match of xml.matchAll(rx)) out.push(attrs(match[1]));
  return out;
}
function contentOf(xml: string, tag: string): string | null {
  const rx = new RegExp("<(?:[\\w-]+:)?" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?" + tag + ">");
  const value = xml.match(rx);
  return value ? decode(value[1]) : null;
}
function runs(xml: string) {
  let result = "";
  for (const match of xml.matchAll(/<(?:[\w-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?t>/g)) {
    result += decode(match[1]);
  }
  return result;
}
function unzip(input: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = input.length - 22; i >= Math.max(0, input.length - 65557); i--) {
    if (input.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ملف Excel مش سليم.");
  const count = input.readUInt16LE(eocd + 10);
  const offset = input.readUInt32LE(eocd + 16);
  if (count > 5000) throw new Error("ملف Excel كبير جدًا.");
  let pos = offset, total = 0;
  for (let i = 0; i < count; i++) {
    if (input.readUInt32LE(pos) !== 0x02014b50) throw new Error("محتوى Excel مش سليم.");
    const method = input.readUInt16LE(pos + 10);
    const compressed = input.readUInt32LE(pos + 20);
    const expected = input.readUInt32LE(pos + 24);
    const nameLen = input.readUInt16LE(pos + 28);
    const extraLen = input.readUInt16LE(pos + 30);
    const commentLen = input.readUInt16LE(pos + 32);
    const local = input.readUInt32LE(pos + 42);
    const name = input.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
    pos += 46 + nameLen + extraLen + commentLen;
    total += expected;
    if (total > 90 * 1024 * 1024 || expected > 16 * 1024 * 1024) {
      throw new Error("حجم محتويات Excel كبير جدًا.");
    }
    if (name.endsWith("/")) continue;
    if (input.readUInt32LE(local) !== 0x04034b50) throw new Error("بيانات Excel مش سليمة.");
    const dataStart = local + 30 + input.readUInt16LE(local + 26) + input.readUInt16LE(local + 28);
    if (dataStart + compressed > input.length) throw new Error("في ملفات ناقصة جوه Excel.");
    const raw = input.subarray(dataStart, dataStart + compressed);
    const file = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : null;
    if (!file || file.length !== expected) throw new Error("صيغة Excel غير مدعومة.");
    out.set(name, file);
  }
  return out;
}
function rels(zip: Map<string, Buffer>, base: string) {
  const file = path.posix.join(path.posix.dirname(base), "_rels", path.posix.basename(base) + ".rels");
  const xml = zip.get(file)?.toString("utf8") ?? "";
  const map = new Map<string, { target: string; type: string; external: boolean }>();
  for (const item of openTags(xml, "Relationship")) {
    if (!item.Id || !item.Target) continue;
    const external = item.TargetMode === "External";
    map.set(item.Id, {
      target: external ? item.Target : item.Target.startsWith("/")
        ? path.posix.normalize(item.Target.slice(1))
        : path.posix.normalize(path.posix.join(path.posix.dirname(base), item.Target)),
      type: item.Type ?? "",
      external,
    });
  }
  return map;
}
function sheet(zip: Map<string, Buffer>, location: string, name: string, shared: string[]): SeoSheet {
  const xml = zip.get(location)?.toString("utf8") ?? "";
  const links: Record<string, string> = {}, comments: Record<string, string> = {};
  const cells: Record<string, string> = {};
  const sheetRels = rels(zip, location);
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const a = attrs(m[1]), body = m[2] ?? "";
    if (!a.r) continue;
    const kind = a.t;
    const rawValue = contentOf(body, "v");
    const formula = contentOf(body, "f");
    let value = kind === "s" ? shared[Number(rawValue)] ?? ""
      : kind === "inlineStr" ? runs(body)
      : kind === "b" ? rawValue === "1" ? "TRUE" : "FALSE"
      : rawValue ?? "";
    if (!value && formula) value = "=" + formula;
    if (value !== "") cells[a.r] = value;
  }
  for (const h of openTags(xml, "hyperlink")) {
    if (!h.ref) continue;
    const target = h["r:id"] ? sheetRels.get(h["r:id"])?.target : h.location ?? h.display;
    if (target) links[h.ref] = target;
  }
  for (const item of sheetRels.values()) {
    if (!item.type.endsWith("/comments")) continue;
    const commentsXml = zip.get(item.target)?.toString("utf8") ?? "";
    for (const m of commentsXml.matchAll(/<comment\b([^>]*)>([\s\S]*?)<\/comment>/g)) {
      const a = attrs(m[1]);
      if (a.ref) comments[a.ref] = runs(m[2]);
    }
  }
  const images: SeoImage[] = [];
  for (const drawing of openTags(xml, "drawing")) {
    const drawingPath = drawing["r:id"] ? sheetRels.get(drawing["r:id"])?.target : null;
    if (!drawingPath) continue;
    const drawingXml = zip.get(drawingPath)?.toString("utf8") ?? "";
    const drawingRels = rels(zip, drawingPath);
    const anchors = /<(?:[\w-]+:)?(?:oneCellAnchor|twoCellAnchor|absoluteAnchor)\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?(?:oneCellAnchor|twoCellAnchor|absoluteAnchor)>/g;
    for (const anchor of drawingXml.matchAll(anchors)) {
      if (!/<(?:[\w-]+:)?pic\b/.test(anchor[1])) continue;
      const blip = anchor[1].match(/<(?:[\w-]+:)?blip\b([^>]*?)\/?>/);
      const id = blip ? attrs(blip[1])["r:embed"] : null;
      const imageFile = id ? drawingRels.get(id)?.target : null;
      const bytes = imageFile ? zip.get(imageFile) : null;
      if (!bytes || !imageFile) continue;
      const from = anchor[1].match(/<(?:[\w-]+:)?from>([\s\S]*?)<\/(?:[\w-]+:)?from>/);
      const row = from ? Number(contentOf(from[1], "row") ?? 0) : 0;
      const col = from ? Number(contentOf(from[1], "col") ?? 0) : 0;
      const ext = path.posix.extname(imageFile).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;
      images.push({
        bytes, filename: path.posix.basename(imageFile), mime: ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg",
        row, col, index: images.length,
      });
    }
  }
  return { name, cells, links, comments, images };
}
export function parseSeoWorkbook(input: Buffer): SeoWorkbook {
  if (input.length < 100 || input.length > 4.1 * 1024 * 1024) throw new Error("ملف Excel أكبر من الحد المسموح أو مش سليم.");
  const zip = unzip(input);
  const sharedXml = zip.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared: string[] = [];
  for (const entry of sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) shared.push(runs(entry[1]));
  const workbook = zip.get("xl/workbook.xml")?.toString("utf8");
  if (!workbook) throw new Error("مش قادر نقرأ الشهور من الملف.");
  const workbookRels = rels(zip, "xl/workbook.xml");
  const sheets: SeoSheet[] = [];
  for (const item of openTags(workbook, "sheet")) {
    const loc = item["r:id"] ? workbookRels.get(item["r:id"])?.target : null;
    if (loc && item.name && zip.has(loc)) sheets.push(sheet(zip, loc, item.name, shared));
  }
  if (!sheets.length) throw new Error("مش لاقيين شيتات مقروءة.");
  return { hash: createHash("sha256").update(input).digest("hex"), sheets };
}
