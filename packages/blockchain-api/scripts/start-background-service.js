#!/usr/bin/env node

const fs = require("fs");
const envPath = fs.existsSync(".env.local") ? ".env.local" : ".env";
require("dotenv").config({ path: envPath });

// Use SWC for TypeScript compilation (same as Next.js uses)
require("@swc-node/register");
const { startBackgroundService } = require("../src/lib/background-service");

console.log("Starting background service...");
startBackgroundService();
console.log("Background service started successfully");

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  process.exit(0);
});
