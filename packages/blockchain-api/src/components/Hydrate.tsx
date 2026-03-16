"use client";

import {
  HydrationBoundary,
  HydrationBoundaryProps,
} from "@tanstack/react-query";

function Hydrate(props: HydrationBoundaryProps) {
  return <HydrationBoundary {...props} />;
}

export default Hydrate;
