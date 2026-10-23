import { OpenAPIHandler } from "@orpc/openapi/fastify";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { SmartCoercionPlugin } from "@orpc/json-schema";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { publicRouter } from "@/server/api";
import { env } from "@/lib/env";
import { onError } from "@orpc/server";
import { ORPCError, ValidationError } from "@orpc/server";
import * as Sentry from "@sentry/node";
import { summarizeProcedureInput } from "@/lib/utils/log-input";

/**
 * ORPC OpenAPI handler for the public v1 API.
 *
 * This handler serves REST endpoints and OpenAPI documentation for public routers only.
 * - REST endpoints are available at /api/v1/*
 * - OpenAPI documentation is available at /api/v1/docs
 */
export const openApiHandler = new OpenAPIHandler(publicRouter, {
  interceptors: [
    onError((error: any) => {
      // Don't log expected 401 auth errors - they're handled by the frontend
      if (error.code !== "UNAUTHORIZED") {
        console.error(
          "[ORPC API Error]",
          error.cause instanceof ValidationError
            ? {
                message: error.message,
                code: error.code,
                issues: error.cause.issues,
                data: summarizeProcedureInput(error.cause.data),
              }
            : error,
        );
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
        servers: [
          {
            url: `${
              env.PUBLIC_URL || `http://localhost:${process.env.PORT ?? 3000}`
            }/api/v1`,
            description: "API Server",
          },
        ],
      },
    }),
  ],
});
