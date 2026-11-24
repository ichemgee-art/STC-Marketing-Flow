import type { Metadata } from "next";
import "./globals.css";
import "@/components/simple-workspace.css";
export const metadata: Metadata = {
  title: "STC Marketing Flow",
  description: "STC team workspace and review workflow",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
