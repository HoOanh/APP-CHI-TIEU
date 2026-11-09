import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/current-user";

export const metadata: Metadata = {
  applicationName: "ARC Irobot",
  title: "ARC Irobot · Quản lý chi tiêu",
  description: "Quản lý chi tiêu và ngân sách cá nhân",
  icons: {
    icon: "/arc-irobot.png",
    shortcut: "/arc-irobot.png",
    apple: "/arc-irobot.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F1F5F9",
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
