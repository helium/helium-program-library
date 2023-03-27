import server from "./server";
import database from "./utils/database";
import * as dotenv from "dotenv";
dotenv.config();

const start = async () => {
  try {
    await database.sync();
    await server.listen({ port: 3000, host: "0.0.0.0" });
    // By default, jobs are not running at startup
    server.cron.startAllJobs();
    const address = server.server.address();
    const port = typeof address === "string" ? address : address?.port;
    console.log(`Running on 0.0.0.0:${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
