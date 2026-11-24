export type ToastKind = "success" | "error" | "info" | "delete";

export type ToastMessage = {
  kind: ToastKind;
  message: string;
  title?: string;
};

export function showToast(message: string, kind: ToastKind = "success", title?: string) {
  if (typeof window === "undefined" || !message.trim()) return;
  window.dispatchEvent(new CustomEvent<ToastMessage>("stc:toast", {
    detail: { kind, message: message.trim(), title },
  }));
}
