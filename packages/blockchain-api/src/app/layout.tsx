import { formMetaTags } from "@/lib/utils/misc";
import { Providers } from "@/providers/providers";
import { Geist, Geist_Mono } from "next/font/google";
import React, { Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

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
        className={`${geistSans.variable} ${geistMono.variable} bg-background text-foreground min-h-screen antialiased`}
      >
        <Suspense>
          <main
            className="layout-container size-full relative flex min-h-screen grow flex-col"
            style={{ fontFamily: 'Inter, "Noto Sans", sans-serif' }}
          >
            <div className="flex min-h-screen w-full flex-1 flex-col">
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
