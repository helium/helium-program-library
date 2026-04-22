"use client";

import { useSearchParams } from "next/navigation";
import { createContext, useContext, useMemo } from "react";

interface ViewAsContextValue {
  /** The wallet address being impersonated, or null if not viewing as another wallet */
  viewAsAddress: string | null;
}

const ViewAsContext = createContext<ViewAsContextValue>({
  viewAsAddress: null,
});

export const ViewAsProvider = ({ children }: { children: React.ReactNode }) => {
  const searchParams = useSearchParams();
  const viewAsAddress = searchParams.get("viewAs");

  const value = useMemo(() => ({ viewAsAddress }), [viewAsAddress]);

  return (
    <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>
  );
};

export const useViewAs = () => useContext(ViewAsContext);
