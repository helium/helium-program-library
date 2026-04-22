import fs from "fs/promises";
import path from "path";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const MIME_TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function getRepoDir(): string {
  return env.HELIUM_VOTE_PROXIES_DIR ?? "./helium-vote-proxies";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;

  if (
    segments.some(
      (s) =>
        !s || s === ".." || s === "." || s.startsWith("/") || s.includes("\0"),
    )
  ) {
    return new Response("Bad request", { status: 400 });
  }

  const root = path.resolve(getRepoDir());
  const target = path.resolve(root, ...segments);
  if (target !== root && !target.startsWith(root + path.sep)) {
    return new Response("Bad request", { status: 400 });
  }

  try {
    const data = await fs.readFile(target);
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: { "Content-Type": contentTypeFor(target) },
    });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "ENOENT"
    ) {
      return new Response("Not found", { status: 404 });
    }
    throw err;
  }
}
