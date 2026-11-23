import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppLoading } from "@/components/AppLoading";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/current-user";
import { PwaServiceWorker } from "@/components/PwaServiceWorker";

export const metadata: Metadata = {
  applicationName: "ARC Irobot",
  title: "ARC Irobot · Quản lý chi tiêu",
  description: "Quản lý chi tiêu và ngân sách cá nhân",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ARC Irobot",
  },
  icons: {
    icon: [
      { url: "/pwa-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/pwa-192.png",
    apple: "/pwa-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#00b878",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" data-scroll-behavior="smooth">
      <body className="min-h-dvh font-sans">
        <PwaServiceWorker />
        <Suspense fallback={<AppLoading fullScreen />}>
          <SessionLayout>{children}</SessionLayout>
        </Suspense>
      </body>
    </html>
  );
}

async function SessionLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <TooltipProvider>
      <AppShell user={user}>{children}</AppShell>
      <Toaster />
    </TooltipProvider>
  );
}
