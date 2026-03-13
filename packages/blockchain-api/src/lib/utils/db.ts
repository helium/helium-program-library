let isConnected = false;
let associationsDefined = false;

import { isServerless, sequelize } from "../db";
import { defineAssociations } from "../models/associations";

export async function connectToDb() {
  if (isConnected) {
    return;
  }

  if (!associationsDefined) {
    defineAssociations();
    associationsDefined = true;
  }

  try {
    await sequelize.authenticate();
    isConnected = true;
    console.log("Connection has been established successfully.");
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    throw error; // Rethrow to handle connection failures
  }
}

// Only set up cleanup handlers in non-serverless environment
if (!isServerless) {
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

async function cleanup() {
  try {
    await sequelize.close();
    console.log("Database connection closed.");
    process.exit(0);
  } catch (err) {
    console.error("Error closing database connection:", err);
    process.exit(1);
  }
}
