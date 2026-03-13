const AWS = require("aws-sdk");

const host = process.env.PG_HOST || "localhost";
const port = Number(process.env.PG_PORT) || 5432;

module.exports = {
  development: {
    username: "postgres",
    password: "postgres",
    database: "helium",
    host: "127.0.0.1",
    dialect: "postgres",
  },
  test: {
    username: "postgres",
    password: "postgres",
    database: "helium_test",
    host: "127.0.0.1",
    dialect: "postgres",
  },
  production: {
    username: process.env.PG_USER || "postgres",
    password: process.env.PG_PASSWORD || "postgres",
    database: process.env.PG_NAME || "helium",
    host: process.env.PG_HOST || "127.0.0.1",
    port: process.env.PG_PORT || 5432,
    dialect: "postgres",
    hooks: {
      beforeConnect: async (config) => {
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
  },
};
