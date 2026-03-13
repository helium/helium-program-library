import { spawn, type ChildProcess } from "child_process";
import fs from "fs";

type JsonRpcResponse<T> = {
  jsonrpc: string;
  id: number | string;
  result?: T;
  error?: unknown;
};

export interface SurfpoolOptions {
  rpcUrl?: string;
  startCmd?: string;
  startArgs?: string[];
  healthTimeoutMs?: number;
  showLogs?: boolean;
  logPath?: string;
  skipStart?: boolean;
}

let startedChild: ChildProcess | undefined;
let startedPid: number | undefined;
let ensurePromise: Promise<void> | null = null;
let startInProgress = false;

export function getSurfpoolRpcUrl(): string {
  return process.env.SURFPOOL_RPC_URL || "http://127.0.0.1:8899";
}

async function jsonRpc<T = unknown>(
  method: string,
  params?: unknown,
  rpcUrl = getSurfpoolRpcUrl()
): Promise<JsonRpcResponse<T>> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res.json() as Promise<JsonRpcResponse<T>>;
}

export async function surfpoolHealthy(
  rpcUrl = getSurfpoolRpcUrl()
): Promise<boolean> {
  try {
    const res = await jsonRpc<string>("getHealth", undefined, rpcUrl);
    if (res?.result === "ok") return true;
  } catch {}
  try {
    const res = await jsonRpc<any>(
      "getLatestBlockhash",
      [{ commitment: "processed" }],
      rpcUrl
    );
    if (res?.result) return true;
  } catch {}
  try {
    const res = await jsonRpc<any>("getVersion", undefined, rpcUrl);
    if (res?.result) return true;
  } catch {}
  return false;
}

export async function ensureSurfpool(
  opts: SurfpoolOptions = {}
): Promise<void> {
  if (ensurePromise) return ensurePromise;
  if (startInProgress) return Promise.resolve();
  startInProgress = true;
  ensurePromise = (async () => {
    const rpcUrl = opts.rpcUrl || getSurfpoolRpcUrl();
    const startCmd = (opts.startCmd || process.env.SURFPOOL_CMD)!;
    const startArgs =
      opts.startArgs ||
      (process.env.SURFPOOL_START_ARGS
        ? process.env.SURFPOOL_START_ARGS.split(" ")
        : ["start", "--network", "mainnet", "--no-tui"]);
    const healthTimeoutMs =
      opts.healthTimeoutMs ??
      parseInt(process.env.SURFPOOL_HEALTH_TIMEOUT_MS || "120000", 10);
    const showLogs = opts.showLogs ?? process.env.SURFPOOL_SHOW_LOGS !== "0";
    const skipStart = opts.skipStart ?? process.env.SURFPOOL_SKIP_START === "1";

    console.log(`[surfpool] Checking health at ${rpcUrl}...`);
    if (await surfpoolHealthy(rpcUrl)) {
      console.log("[surfpool] Already healthy");
      return;
    }

    if (!skipStart) {
      console.log(
        `[surfpool] Starting via: ${startCmd} ${startArgs.join(" ")}`
      );
      let child: ChildProcess;
      try {
        child = spawn(startCmd, startArgs, {
          stdio: ["ignore", "pipe", "pipe"],
          detached: true,
        });
      } catch (e: any) {
        startInProgress = false;
        ensurePromise = null;
        const msg = `[surfpool] Failed to start '${startCmd}': ${e?.code || e}
Set SURFPOOL_CMD/SURFPOOL_START_ARGS to your CLI, or run Surfpool externally and set SURFPOOL_SKIP_START=1.`;
        console.error(msg);
        throw new Error(msg);
      }
      let fileStream: fs.WriteStream | undefined;
      const logPath = opts.logPath || process.env.SURFPOOL_LOG_PATH;
      if (logPath) {
        try {
          fileStream = fs.createWriteStream(logPath, { flags: "a" });
        } catch (e) {
          console.error("[surfpool] Failed to open log file", e);
        }
      }
      const write = (pfx: string) => (chunk: Buffer) => {
        const text = chunk.toString();
        if (showLogs)
          process[pfx as "stdout" | "stderr"].write(`[surfpool] ${text}`);
        if (fileStream) fileStream.write(text);
      };
      child.stdout?.on("data", write("stdout"));
      child.stderr?.on("data", write("stderr"));
      child.on("exit", (code, signal) => {
        console.log(
          `[surfpool] start process exited code=${code} signal=${
            signal ?? "none"
          }`
        );
        if (fileStream) fileStream.end();
      });
      child.on("error", (err) =>
        console.error("[surfpool] start process error", err)
      );
      startedChild = child;
      startedPid = child.pid;
      process.on("exit", () => {
        try {
          if (startedPid) process.kill(-startedPid, "SIGTERM");
        } catch {}
      });
    } else {
      console.log(
        "[surfpool] Skipping auto-start (SURFPOOL_SKIP_START=1). Waiting for health..."
      );
    }

    const start = Date.now();
    while (Date.now() - start < healthTimeoutMs) {
      if (await surfpoolHealthy(rpcUrl)) {
        console.log("[surfpool] Became healthy");
        startInProgress = false;
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    startInProgress = false;
    ensurePromise = null;
    throw new Error("Surfpool did not become healthy in time");
  })();
  return ensurePromise;
}

export async function stopSurfpool(timeoutMs = 10_000): Promise<void> {
  if (process.env.SURFPOOL_PERSIST === "1") return;
  if (!startedChild && !startedPid) return;
  const child = startedChild;
  const pgid = startedPid;
  startedChild = undefined;
  startedPid = undefined;
  // Kill process group first (all descendants)
  try {
    if (pgid) process.kill(-pgid, "SIGTERM");
  } catch {}
  // Also send to child if available
  try {
    child?.kill("SIGTERM");
  } catch {}
  const exited = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    if (child) {
      child.once("exit", () => {
        clearTimeout(timer);
        resolve(true);
      });
    } else {
      setTimeout(() => resolve(true), 200); // best-effort when only pgid is known
    }
  });
  if (!exited) {
    try {
      if (pgid) process.kill(-pgid, "SIGKILL");
    } catch {}
    try {
      child?.kill("SIGKILL");
    } catch {}
  }

  ensurePromise = null;
  startInProgress = false;
}
