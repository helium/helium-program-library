import { formMetaTags } from "@/lib/utils/misc";
import { Providers } from "@/providers/providers";
import { Geist, Geist_Mono } from "next/font/google";
import React, { Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import "../lib/background-jobs/transaction-resubmission";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = formMetaTags();
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full w-full" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        <Suspense>
          <main
            className="relative layout-container flex size-full min-h-screen grow flex-col"
            style={{ fontFamily: 'Inter, "Noto Sans", sans-serif' }}
          >
            <div className="flex flex-col flex-1 min-h-screen w-full">
              <Providers>{children}</Providers>
              <Toaster position="top-center" className="md:hidden" />
              <Toaster position="bottom-right" className="hidden md:block" />
            </div>
          </main>
        </Suspense>
      </body>
    </html>
  );
}
