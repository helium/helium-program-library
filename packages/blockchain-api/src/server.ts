import { buildApp, startBackgroundServices } from "./app";

const start = async () => {
  const app = await buildApp();

  startBackgroundServices();

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
