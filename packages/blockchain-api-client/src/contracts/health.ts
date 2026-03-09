import { oc } from "@orpc/contract";
import { HealthResponseSchema } from "../schemas/health";

export const healthContract = oc
  .tag("Health")
  .router({
    check: oc
      .route({ method: "GET", path: "/health", summary: "Health check" })
      .output(HealthResponseSchema),
    testSentry: oc
      .route({
        method: "GET",
        path: "/health/test-sentry",
        summary: "Test Sentry error reporting",
      })
      .output(HealthResponseSchema),
  });
