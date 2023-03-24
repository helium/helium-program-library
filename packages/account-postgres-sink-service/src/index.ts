import Fastify from "fastify";
import fastifyCron from "fastify-cron";

const server = Fastify();

server.register(fastifyCron, {
  jobs: [
    {
      cronTime: "0 0 * * *", // Everyday at midnight UTC
      startWhenReady: true,
      onTick: async (server) => {
        console.log("DOING");
      },
    },
  ],
});

server.listen(() => {
  // By default, jobs are not running at startup
  server.cron.startAllJobs();
});
