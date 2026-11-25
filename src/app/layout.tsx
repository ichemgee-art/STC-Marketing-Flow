import type { Metadata } from "next";
import "./globals.css";
import "@/components/simple-workspace.css";
import ToastHost from "@/components/toast-host";
import ConfirmDialogHost from "@/components/confirm-dialog-host";
import AppLanguageProvider from "@/components/app-language-provider";
import AccountIdentity from "@/components/account-identity";
export const metadata: Metadata = {
  title: "STC Marketing Flow",
  description: "STC team workspace and review workflow",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body><AppLanguageProvider><AccountIdentity/>{children}<ToastHost/><ConfirmDialogHost/></AppLanguageProvider></body>
    </html>
  );
}
