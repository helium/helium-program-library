import http from "http";

export interface NextOptions {
  port?: number;
  baseUrl?: string;
}

let server: http.Server | undefined;
let nextApp: any | undefined;
let ensurePromise: Promise<void> | null = null;
let startInProgress = false;
const sockets = new Set<any>();

export async function ensureNextServer(opts: NextOptions = {}): Promise<void> {
  if (ensurePromise) return ensurePromise;
  if (startInProgress) return Promise.resolve();
  startInProgress = true;
  ensurePromise = (async () => {
    const port = opts.port ?? parseInt(process.env.NEXT_PORT || "3000", 10);
    const baseUrl = opts.baseUrl || `http://127.0.0.1:${port}`;

    const ready = async () => {
      try {
        const res = await fetch(baseUrl);
        return res.ok || res.status >= 200;
      } catch {
        return false;
      }
    };

    if (await ready()) {
      startInProgress = false;
      return;
    }

    console.log("[next] Starting programmatic Next server (dev)...");
    const next = (await import("next")).default as any;
    const dev = true;
    const hostname = "127.0.0.1";
    // Disable Turbopack in tests - Next.js 16 has a bug where Turbopack handles don't close properly
    // Force webpack mode which closes cleanly
    nextApp = next({ dev, hostname, port, webpack: true });
    const handle = nextApp.getRequestHandler();
    console.log("[next] Calling app.prepare()...");
    await nextApp.prepare();
    console.log("[next] app.prepare() resolved, creating HTTP server...");
    await new Promise<void>((resolve) => {
      server = http.createServer((req, res) => handle(req, res));
      server.on("connection", (socket) => {
        sockets.add(socket);
        try {
          socket.unref?.();
        } catch {}
        socket.on("close", () => sockets.delete(socket));
      });
      server.listen(port, () => {
        console.log(`[next] Listening on ${baseUrl}`);
        try {
          server!.unref?.();
        } catch {}
        resolve();
      });
    });
    process.on("exit", () => {
      if (server) server.close();
      try {
        nextApp?.close?.();
      } catch {}
    });
    startInProgress = false;
  })();
  return ensurePromise;
}

function closeAllHandles(handles: any[]): void {
  for (const h of handles) {
    const name = h?.constructor?.name;
    if (
      (name === "FSWatcher" || name === "FSEvent") &&
      typeof h.close === "function"
    ) {
      try {
        h.close();
      } catch {}
    }
    if (name === "Timeout" && h.hasRef?.()) {
      try {
        h.unref();
      } catch {}
    }
    if (name === "Immediate" && h.hasRef?.()) {
      try {
        h.unref();
      } catch {}
    }
    if (name === "Socket" && typeof h.destroy === "function") {
      try {
        h.destroy();
        h.unref();
      } catch {}
    }
    if (
      (name === "TCPWRAP" || name === "TLSWRAP") &&
      typeof h.close === "function"
    ) {
      try {
        h.close();
      } catch {}
    }
  }
}

export async function stopNextServer(): Promise<void> {
  // Close Next app
  try {
    if (nextApp?.hotReloader?.close) {
      await nextApp.hotReloader.close();
    }
  } catch {}

  try {
    if (nextApp?.server?.close) {
      await nextApp.server.close();
    }
  } catch {}

  try {
    if (nextApp?.close) {
      await nextApp.close();
    }
  } catch {}

  // Stop accepting new connections
  if (server) {
    // Destroy any open sockets to allow server.close to finish
    for (const s of sockets) {
      try {
        s.destroy();
      } catch {}
    }
    sockets.clear();

    try {
      (server as any).closeAllConnections?.();
    } catch {}

    try {
      (server as any).closeIdleConnections?.();
    } catch {}

    await new Promise<void>((resolve) => {
      server!.close(() => resolve());
    });
    server = undefined;
  }

  // Clean up any remaining handles
  try {
    let handles: any[] = (process as any)._getActiveHandles?.() || [];
    let iterations = 0;
    const maxIterations = 20;
    while (handles.length > 0 && iterations < maxIterations) {
      closeAllHandles(handles);
      await new Promise((r) => setTimeout(r, 200));
      handles = (process as any)._getActiveHandles?.() || [];
      iterations++;
    }
  } catch {}

  nextApp = undefined;
  ensurePromise = null;
  startInProgress = false;
}
