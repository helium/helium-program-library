import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { SmartCoercionPlugin } from "@orpc/json-schema";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { publicRouter } from "@/server/api";
import { onError } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

/**
 * ORPC OpenAPI handler for the public v1 API.
 *
 * This handler serves REST endpoints and OpenAPI documentation for public routers only.
 * Internal routers (fiat, webhooks) are excluded from docs but accessible via RPC.
 * - REST endpoints are available at /api/v1/*
 * - OpenAPI documentation is available at /api/v1/docs
 */
const openApiHandler = new OpenAPIHandler(publicRouter, {
  interceptors: [
    onError((error: any) => {
      // Don't log expected 401 auth errors - they're handled by the frontend
      if (error.code !== "UNAUTHORIZED") {
        console.error("[ORPC API Error]", error);
      }

      // Capture 500-level errors to Sentry
      // Skip UNAUTHORIZED errors (expected client errors)
      if (error.code === "UNAUTHORIZED") {
        return;
      }

      // Determine if we should capture to Sentry
      const is500Error =
        error instanceof ORPCError ? error.status >= 500 : true; // Capture all non-ORPCError errors (unexpected errors)

      if (is500Error) {
        const errorToCapture =
          error instanceof Error
            ? error
            : new Error(error.message || error.toString() || "Unknown error");

        Sentry.captureException(errorToCapture, {
          level: "error",
          tags: {
            error_type:
              error instanceof ORPCError ? "orpc_error" : "unknown_error",
            error_code: error.code || "unknown",
            api_route: "/api/v1",
          },
          extra: {
            error_message: error.message,
            error_code: error.code,
            error_status: error instanceof ORPCError ? error.status : undefined,
            error_data: error.data,
          },
        });
      }
    }),
  ],
  plugins: [
    new SmartCoercionPlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
    new OpenAPIReferencePlugin({
      docsPath: "/docs",
      schemaConverters: [new ZodToJsonSchemaConverter()],
      specGenerateOptions: {
        info: {
          title: "Helium Blockchain API",
          version: "1.0.0",
          description:
            "API for the Helium Dashboard - manage Helium hotspots, tokens, swaps, and more.",
        },
        components: {
          securitySchemes: {
            cookieAuth: {
              type: "apiKey",
              in: "cookie",
              name: "privy-id-token",
              description:
                "Privy ID token stored in cookie. Used by browser clients after Privy authentication.",
            },
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
              description:
                "Privy ID token passed as Bearer token. Use for external API consumers: Authorization: Bearer <privy-id-token>",
            },
          },
        },
        // Security is applied per-route via protectedOc's .meta({ security: [...] })
        // No global security - public routes don't require auth
        servers: [
          {
            url: `${
              process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
            }/api/v1`,
            description: "API Server",
          },
        ],
      },
    }),
  ],
});

/**
 * Handle incoming requests.
 * Maps requests to the ORPC handler with the /api/v1 prefix.
 */
async function handleRequest(request: Request) {
  const { response } = await openApiHandler.handle(request, {
    prefix: "/api/v1",
    context: {},
  });

  return response ?? new Response("Not found", { status: 404 });
}

// Export handlers for all HTTP methods
export const HEAD = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
export const OPTIONS = handleRequest;
