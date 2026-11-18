import { failure } from "./errors";
import * as jup from "./jupiter";
import { buildServer } from "./server";

const server = buildServer(jup);

const start = async () => {
  try {
    await server.listen({
      port: Number(process.env.PORT) || 8081,
      host: "0.0.0.0",
    });

    const address = server.server.address();
    const port = typeof address === "string" ? address : address?.port;
    console.log(`Running on 0.0.0.0:${port}`);
  } catch (err) {
    server.log.error(failure(err).log);
    process.exit(1);
  }
};
start();
