"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { PUBLIC_ROUTES, ROUTE_MIGRATE } from "@/lib/utils/routes";
import { useViewAs } from "./ViewAsProvider";

export const AuthRouter = ({ children }: { children: React.ReactNode }) => {
  const { ready, authenticated, user } = usePrivy();
  const { viewAsAddress } = useViewAs();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;

    const effectiveAddress = viewAsAddress || user?.wallet?.address;

    if (authenticated && effectiveAddress) {
      // If user is authenticated and not already on a protected route
      if (pathname === "/") {
        router.replace(ROUTE_MIGRATE);
      }
    } else if (!authenticated) {
      // Only redirect if user is trying to access a protected route
      const isPublicRoute =
        PUBLIC_ROUTES.includes(pathname) ||
        PUBLIC_ROUTES.some(
          (route) => route !== "/" && pathname.startsWith(route),
        );
      if (!isPublicRoute) {
        router.replace("/");
      }
    }
  }, [ready, authenticated, user?.wallet?.address, viewAsAddress, router, pathname]);

  return <>{children}</>;
};
