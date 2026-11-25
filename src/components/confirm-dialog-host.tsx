"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ShieldAlert, X } from "lucide-react";
import type { ConfirmRequest } from "@/lib/dialogs";
import "./confirm-dialog-host.css";

export default function ConfirmDialogHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const pending = useRef<ConfirmRequest | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const cancelButton = useRef<HTMLButtonElement | null>(null);

  const answer = useCallback((accepted: boolean) => {
    const active = pending.current;
    pending.current = null;
    setRequest(null);
    active?.resolve(accepted);
  }, []);

  useEffect(() => {
    const receive = (event: Event) => {
      const e = event as CustomEvent<ConfirmRequest>;
      if (!e.detail?.message || typeof e.detail.resolve !== "function") return;
      // Explicitly mark as handled, so the action cannot fall through.
      event.preventDefault();
      if (pending.current) {
        // Prevent overlapping confirmations from triggering duplicate mutations.
        e.detail.resolve(false);
        return;
      }
      trigger.current = document.activeElement instanceof HTMLElement
        ? document.activeElement : null;
      pending.current = e.detail;
      setRequest(e.detail);
    };
    window.addEventListener("stc:confirm", receive);
    return () => {
      window.removeEventListener("stc:confirm", receive);
      const unresolved = pending.current;
      pending.current = null;
      unresolved?.resolve(false);
    };
  }, []);

  useEffect(() => {
    if (!request) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = window.requestAnimationFrame(() => cancelButton.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        answer(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.getElementById("stc-confirm-modal");
      if (!dialog) return;
      const focusables = Array.from(dialog.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)'
      ));
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = originalOverflow;
      trigger.current?.focus();
    };
  }, [request, answer]);

  if (!request) return null;
  const danger = request.tone !== "normal" && request.tone !== "warning";
  return (
    <div className="stc-confirm-overlay" role="presentation" onMouseDown={(e) => {
      if (e.target === e.currentTarget) answer(false);
    }}>
      <section id="stc-confirm-modal" className={"stc-confirm-modal" + (danger ? " stc-confirm-modal--danger" : "")}
        role="alertdialog" aria-modal="true" aria-labelledby="stc-confirm-title"
        aria-describedby="stc-confirm-message" dir="rtl">
        <div className="stc-confirm-topline">
          <span className="stc-confirm-eyebrow">STC MARKETING FLOW</span>
          <button type="button" className="stc-confirm-close" aria-label="إغلاق" onClick={() => answer(false)}>
            <X size={19}/>
          </button>
        </div>
        <div className="stc-confirm-content">
          <div className="stc-confirm-symbol">
            {danger ? <ShieldAlert size={29}/> : <AlertTriangle size={29}/>}
          </div>
          <h2 id="stc-confirm-title">{request.title || (danger ? "تأكيد الحذف" : "تأكيد الإجراء")}</h2>
          <p id="stc-confirm-message">{request.message}</p>
          <span className="stc-confirm-hint">العملية مش هتتنفّذ إلا بعد تأكيدك.</span>
        </div>
        <div className="stc-confirm-actions">
          <button ref={cancelButton} className="stc-confirm-cancel" type="button"
            onClick={() => answer(false)}>{request.cancelText || "إلغاء"}</button>
          <button className="stc-confirm-accept" type="button"
            onClick={() => answer(true)}>
            <Check size={17}/>
            {request.confirmText || (danger ? "نعم، احذف" : "تأكيد")}
          </button>
        </div>
      </section>
    </div>
  );
}
