import { buildApp } from "./app";
import { defineAssociations } from "./lib/models/associations";
import { transactionResubmissionService } from "./lib/background-jobs/transaction-resubmission";

const start = async () => {
  const app = await buildApp();

  if (process.env.NO_PG !== "true") {
    try {
      defineAssociations();
      transactionResubmissionService.start();
      console.log("[server] Transaction resubmission service started");
    } catch (e) {
      console.error("Failed to start transaction resubmission service:", e);
    }
  }

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ host: "0.0.0.0", port });
  console.log(`[server] Listening on 0.0.0.0:${port}`);
};

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
