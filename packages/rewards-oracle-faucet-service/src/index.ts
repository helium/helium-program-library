import fastify from "fastify";
import { Reward } from "./model";

const server = fastify();

server.get("/health", async (request, reply) => {
  reply.send({
    ok: true,
  });
});

const window = 30 * 1000; // 30 seconds
const rateLimit = {
  entityId: new Map<string, number>(),
  ip: new Map<string, number>(),
};
type RateLimitTracker = {
  entityId: Map<string, number>;
  ip: Map<string, number>;
};
function isRateLimited(
  request: any,
  entityId: string,
  rateLimitTracker: RateLimitTracker
): boolean {
  // Check if the wallet has been accessed within the rate limit window
  const entityLastAcccessed = rateLimitTracker.entityId.get(entityId);
  const now = Date.now();
  if (entityLastAcccessed && now - entityLastAcccessed < window) {
    return true;
  }
  rateLimitTracker.entityId.set(entityId, now);

  // Check if the IP needs to be rate limited
  const ip = (
    request.headers["x-real-ip"] || // nginx
    request.headers["x-client-ip"] || // apache
    request.ip
  ).toString(); // fallback to default
  const ipLastAccessed = rateLimitTracker.ip.get(ip);
  if (ipLastAccessed && now - ipLastAccessed < window) {
    return true;
  }
  rateLimitTracker.ip.set(ip, now);

  return false;
}

server.get<{ Params: { entityId: string } }>("/rewards/:entityId", {
  handler: async (request, reply) => {
    try {
      const entityId = request.params.entityId;
      const limit = isRateLimited(request, entityId, rateLimit);
      //@ts-ignore
      const amount = Number(request.query.amount) || 1;

      let curr = await Reward.findByPk(entityId);
      if (!curr) {
        curr = await Reward.create({
          address: entityId,
          rewards: BigInt(0),
          lastReward: new Date(),
        });
      }

      if (amount > 10) {
        reply.code(403).send("Must be less than 10");
        return;
      }

      await curr.update({
        rewards: BigInt(curr.rewards) + BigInt(amount),
      });

      if (limit) {
        reply.code(429).send("Too Many Requests");
        return;
      }
    } catch (err) {
      console.error(err);
      reply.status(500).send({
        message: "Request failed",
      });
    }

    reply.status(200).send({
      message: "Rewards incremented",
    });
  },
});

const start = async () => {
  try {
    // start the server
    await server.listen({ port: 3000, host: "0.0.0.0" });

    const address = server.server.address();
    const port = typeof address === "string" ? address : address?.port;
    console.log(`Running on 0.0.0.0:${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};
start();
