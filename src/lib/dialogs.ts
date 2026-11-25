/**
 * STC-owned confirmation requests: never invoke browser-native alert/confirm.
 * Requests safely resolve false if the UI host is not mounted.
 */
export type ConfirmTone = "danger" | "warning" | "normal";

export type ConfirmRequest = {
  message: string;
  resolve: (confirmed: boolean) => void;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
};

export function requestConfirmation(
  message: string,
  options: Omit<ConfirmRequest, "message" | "resolve"> = {},
): Promise<boolean> {
  if (typeof window === "undefined" || !message.trim()) {
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    const event = new CustomEvent<ConfirmRequest>("stc:confirm", {
      detail: { ...options, message: message.trim(), resolve },
      cancelable: true,
    });
    window.dispatchEvent(event);
    // No dialog mounted: fail closed instead of silently approving deletion.
    if (!event.defaultPrevented) resolve(false);
  });
}
