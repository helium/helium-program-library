import pg from "pg";
import { Sequelize } from "sequelize";
import { env } from "./env";
import AWS from "aws-sdk";

// Make sure to set your POSTGRES_URL in a .env.local file
// Example: POSTGRES_URL="postgres://user:password@localhost:5432/database"
const POSTGRES_URL = `postgres://${env.PG_USER}:${env.PG_PASSWORD}@${env.PG_HOST}:${env.PG_PORT}/${env.PG_NAME}`;

if (!POSTGRES_URL) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("POSTGRES_URL environment variable is not set");
  } else {
    console.warn(
      "POSTGRES_URL environment variable is not set. Using default for development.",
    );
  }
}

// For serverless environments, we want to limit the pool size
// For Docker/standalone, we can use a larger pool
export const isServerless = process.env.VERCEL === "1";
const noPg = process.env.NO_PG === "true";
const poolConfig = noPg
  ? { max: 1, min: 0, acquire: 1000, idle: 1000 }
  : isServerless
    ? {
        max: 1,
        acquire: 30000,
        idle: 10000,
      }
    : {
        max: 20,
        min: 5,
        acquire: 60000,
        idle: 10000,
      };

const host = process.env.PG_HOST || "localhost";
const port = Number(process.env.PG_PORT) || 5432;
export const sequelize = new Sequelize(POSTGRES_URL, {
  dialect: "postgres",
  dialectModule: pg,
  logging: false, // set to console.log to see SQL queries
  pool: poolConfig,
  retry: {
    max: 3,
  },
  hooks: {
    beforeConnect: async (config: any) => {
      const isRds = host.includes("rds.amazonaws.com");

      let password = process.env.PG_PASSWORD;
      if (isRds && !password) {
        const signer = new AWS.RDS.Signer({
          region: process.env.AWS_REGION,
          hostname: process.env.PG_HOST,
          port,
          username: process.env.PG_USER,
        });
        password = await new Promise((resolve, reject) =>
          signer.getAuthToken({}, (err, token) => {
            if (err) {
              return reject(err);
            }
            resolve(token);
          }),
        );
        config.dialectOptions = {
          ssl: {
            require: false,
            rejectUnauthorized: false,
          },
        };
      }
      config.password = password;
    },
  },
});
