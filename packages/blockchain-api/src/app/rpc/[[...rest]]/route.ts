import { BatchHandlerPlugin } from "@orpc/server/plugins";
import { onError } from "@orpc/server";
import { appRouter } from "@/server/api";
import { RPCHandler } from "@orpc/server/fetch";
import { ORPCError } from "@orpc/server";
import { ValidationError } from "@orpc/server";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      // Helper to safely serialize nested objects
      const serializeValue = (value: unknown): unknown => {
        if (value === null || value === undefined) return value;
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        )
          return value;
        if (Array.isArray(value)) return value.map(serializeValue);
        if (typeof value === "object") {
          try {
            // Try to serialize as plain object
            return Object.fromEntries(
              Object.entries(value).map(([key, val]) => [
                key,
                serializeValue(val),
              ]),
            );
          } catch {
            // If serialization fails, convert to string
            return String(value);
          }
        }
        return String(value);
      };

      // Handle ORPCError
      if (error instanceof ORPCError) {
        const errorDetails = {
          message: error.message,
          code: error.code,
          status: error.status,
          data: serializeValue(error.data),
          defined: error.defined,
          // Check for ValidationError in cause (standard Error.cause property)
          cause:
            error.cause instanceof ValidationError
              ? {
                  message: error.cause.message,
                  name: error.cause.name,
                  issues: serializeValue(error.cause.issues),
                  data: serializeValue(error.cause.data),
                }
              : error.cause
                ? serializeValue(error.cause)
                : undefined,
        };
        console.error("RPC Error:", JSON.stringify(errorDetails, null, 2));

        // Capture 500-level errors to Sentry
        if (error.status >= 500) {
          Sentry.captureException(error, {
            level: "error",
            tags: {
              error_type: "orpc_error",
              error_code: error.code,
              api_route: "/rpc",
            },
            extra: {
              error_message: error.message,
              error_code: error.code,
              error_status: error.status,
              error_data: serializeValue(error.data),
              error_defined: error.defined,
              error_cause: error.cause
                ? serializeValue(error.cause)
                : undefined,
            },
          });
        }
      } else if (error instanceof Error) {
        // Handle standard Error
        const errorDetails = {
          message: error.message,
          name: error.name,
          stack: error.stack,
          cause: error.cause ? serializeValue(error.cause) : undefined,
        };
        console.error("RPC Error:", JSON.stringify(errorDetails, null, 2));

        // Capture unexpected errors to Sentry
        Sentry.captureException(error, {
          level: "error",
          tags: {
            error_type: "standard_error",
            error_name: error.name,
            api_route: "/rpc",
          },
          extra: {
            error_message: error.message,
            error_name: error.name,
            error_stack: error.stack,
            error_cause: error.cause ? serializeValue(error.cause) : undefined,
          },
        });
      } else {
        // Handle unknown error type
        const serialized = serializeValue(error);
        console.error("RPC Error:", JSON.stringify(serialized, null, 2));

        // Capture unknown error types to Sentry
        Sentry.captureException(new Error(String(error)), {
          level: "error",
          tags: {
            error_type: "unknown_error",
            api_route: "/rpc",
          },
          extra: {
            error_data: serialized,
          },
        });
      }
    }),
  ],
  plugins: [new BatchHandlerPlugin()],
});

async function handleRequest(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Handle batch requests - the BatchHandlerPlugin should detect them by body format
  // But we need to ensure the path is correct after prefix removal
  // When path is /rpc/__batch__, after removing /rpc prefix, it becomes /__batch__
  const isBatchPath =
    pathname === "/rpc/__batch__" || pathname.endsWith("/__batch__");

  const { response } = await rpcHandler.handle(request, {
    prefix: "/rpc",
    context: {}, // Provide initial context if needed
  });

  // If it's a batch path and we got no response, the BatchHandlerPlugin might not be working
  // This could be a bug or configuration issue with ORPC
  if (!response && isBatchPath) {
    console.error(
      "[RPC] BatchHandlerPlugin failed to handle batch request. " +
        "This might indicate a bug in ORPC or incorrect configuration.",
    );
  }

  return response ?? new Response("Not found", { status: 404 });
}

export const HEAD = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
