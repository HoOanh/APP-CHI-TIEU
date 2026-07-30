import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/current-user";

export const metadata: Metadata = {
  title: "Chi Tiêu Manager",
  description: "Quản lý chi tiêu thông minh với AI",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#F7F9FB",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="vi" data-scroll-behavior="smooth">
      <body className="min-h-dvh font-sans">
        <TooltipProvider>
          <AppShell user={user}>{children}</AppShell>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
