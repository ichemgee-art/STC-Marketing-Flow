"use client";

/**
 * App-wide Arabic / English interface localization.
 *
 * The existing application contains user-facing copy in several independent
 * workflows. This adapter localizes the rendered UI chrome without modifying
 * tasks, report cells, uploaded files, user-supplied notes or Supabase data.
 *
 * The dictionary is curated; no online or AI translation service is called.
 * Text/attribute changes caused by React are observed and localized again.
 * Original Arabic node values are retained so switching back is lossless.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Globe2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { translateText } from "@/lib/translate-ui";
import { requestConfirmation } from "@/lib/dialogs";
import "./app-language.css";

export type AppLanguage = "ar" | "en";
type SourceRecord = { source: string; applied: string };
const originals = new WeakMap<Text, SourceRecord>();
const originalAttrs = new WeakMap<Element, Map<string, SourceRecord>>();
const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"] as const;
const IGNORE = "script,style,textarea,code,pre,svg,[data-no-translate],[contenteditable='true']";

export function confirmInCurrentLanguage(message:string):Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  // A branded in-app confirmation replaces the browser-native blocking popup.
  return requestConfirmation(
    document.documentElement.dataset.stcLanguage === "en" ? translateText(message) : message
  );
}

function blocked(element: Element | null): boolean {
  return !element || !!element.closest(IGNORE);
}

function textPass(textNode: Text, language: AppLanguage) {
  if (blocked(textNode.parentElement)) return;
  const current = textNode.nodeValue ?? "";
  if (!current) return;
  const previous = originals.get(textNode);
  const original = previous && current === previous.applied ? previous.source : current;
  const translated = language === "en" ? translateText(original) : original;
  originals.set(textNode, { source: original, applied: translated });
  if (current !== translated) textNode.nodeValue = translated;
}

function attributesPass(element: Element, language: AppLanguage) {
  if (blocked(element)) return;
  let records = originalAttrs.get(element);
  if (!records) {
    records = new Map<string, SourceRecord>();
    originalAttrs.set(element, records);
  }
  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (current === null) {
      records.delete(attribute);
      continue;
    }
    const previous = records.get(attribute);
    const original = previous && current === previous.applied ? previous.source : current;
    const translated = language === "en" ? translateText(original) : original;
    records.set(attribute, { source: original, applied: translated });
    if (translated !== current) element.setAttribute(attribute, translated);
  }
}

function localize(node: Node, language: AppLanguage) {
  if (node.nodeType === Node.TEXT_NODE) {
    textPass(node as Text, language);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as Element;
  if (blocked(element)) return;
  attributesPass(element, language);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current: Node | null;
  while ((current = walker.nextNode())) {
    if (current.nodeType === Node.TEXT_NODE) textPass(current as Text, language);
    else attributesPass(current as Element, language);
  }
}

function languageKey(userId: string) {
  return "stc:ui-language:v1:" + userId;
}

function savedLanguage(key: string): AppLanguage | null {
  try {
    const value = localStorage.getItem(key);
    return value === "en" || value === "ar" ? value : null;
  } catch {
    return null;
  }
}

export default function AppLanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>("ar");
  const userIdRef = useRef("guest");

  // Sessions are isolated by browser tab; language preferences are scoped to
  // each authenticated account and persist between visits.
  useEffect(() => {
    setLanguage(savedLanguage(languageKey("global")) ?? "ar");
    let alive = true;
    const applySession = (id: string | null) => {
      if (!alive) return;
      const key = id ?? "guest";
      if (userIdRef.current === key) return;
      userIdRef.current = key;
      setLanguage(savedLanguage(languageKey(key)) ??
        savedLanguage(languageKey("global")) ?? "ar");
    };
    void supabase.auth.getSession().then(({ data }) => {
      applySession(data.session?.user.id ?? null);
    }).catch(() => {});
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user.id ?? null);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const choose = useCallback((next: AppLanguage) => {
    setLanguage(next);
    try {
      localStorage.setItem(languageKey(userIdRef.current), next);
      localStorage.setItem(languageKey("global"), next);
    } catch {
      // Private-browsing mode can disable persistent storage.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "en" ? "en" : "ar";
    document.documentElement.dir = language === "en" ? "ltr" : "rtl";
    document.documentElement.dataset.stcLanguage = language;
    document.body.dir = language === "en" ? "ltr" : "rtl";

    let pending = new Set<Node>();
    let scheduled = false;
    let disposed = false;
    const flush = () => {
      scheduled = false;
      if (disposed) return;
      const nodes = pending;
      pending = new Set();
      for (const node of nodes) {
        if (node.isConnected) localize(node, language);
      }
    };
    const schedule = (node: Node) => {
      pending.add(node);
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(flush);
      }
    };
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") schedule(mutation.target);
        else if (mutation.type === "attributes") schedule(mutation.target);
        else for (const node of mutation.addedNodes) schedule(node);
      }
    });
    // Language changes reapply against the originals cached in WeakMaps.
    localize(document.body, language);
    observer.observe(document.body, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });
    return () => {
      disposed = true;
      observer.disconnect();
      pending.clear();
    };
  }, [language]);

  return <>
    {children}
    <nav className="stc-language-switch" data-no-translate aria-label="Interface language">
      <Globe2 size={17} aria-hidden="true"/>
      <button type="button" lang="ar" aria-pressed={language === "ar"}
        aria-label="العربية" className={language==="ar"?"selected":""}
        onClick={() => choose("ar")}>AR</button>
      <span className="stc-language-divider" aria-hidden="true"/>
      <button type="button" lang="en" aria-pressed={language === "en"}
        aria-label="English" className={language==="en"?"selected":""}
        onClick={() => choose("en")}>EN</button>
    </nav>
  </>;
}
