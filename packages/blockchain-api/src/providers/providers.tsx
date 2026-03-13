"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "./PrivyProvider";
import { ThemeProvider } from "./ThemeProvider";
import { AuthRouter } from "./AuthRouter";
import { TransactionProvider } from "./TransactionProvider";
import { ViewAsProvider } from "./ViewAsProvider";
import { getQueryClient } from "@/lib/query-client";
import { Suspense } from "react";

export const Providers = ({ children }: { children: React.ReactNode }) => {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <PrivyProvider>
        <Suspense>
          <ViewAsProvider>
            <AuthRouter>
              <TransactionProvider>
                <ThemeProvider
                  attribute="class"
                  defaultTheme="system"
                  enableSystem
                  disableTransitionOnChange
                >
                  {children}
                </ThemeProvider>
              </TransactionProvider>
            </AuthRouter>
          </ViewAsProvider>
        </Suspense>
      </PrivyProvider>
    </QueryClientProvider>
  );
};
