import cors from "@fastify/cors";
import Fastify, { FastifyInstance } from "fastify";

const server: FastifyInstance = Fastify({
  logger: true
});
server.register(cors, {
  origin: "*"
});
server.get("/health", async () => {
  return { ok: true };
})

server.get<{ Params: { subDao: string } }>("/:subDao", async (request) => {
  const { subDao } = request.params;

  if (subDao === "MOBILE") {
    return { 
      count: 20
     };
  } else {
    return {
      count: 10
    }
  }
});

const start = async () => {
  try {
    await server.listen({ port: 8081, host: "0.0.0.0" });

    const address = server.server.address();
    const port = typeof address === "string" ? address : address?.port;
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
