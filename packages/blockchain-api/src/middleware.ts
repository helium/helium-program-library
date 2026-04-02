import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/.*\.helium\.io$/,
  /^https?:\/\/.*\.test-helium\.com$/,
];

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";

  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    if (isAllowedOrigin(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Credentials", "true");
    }
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    response.headers.set("Access-Control-Max-Age", "86400");
    return response;
  }

  const response = NextResponse.next();
  if (isAllowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  return response;
}

export const config = {
  matcher: ["/api/:path*", "/rpc/:path*"],
};
