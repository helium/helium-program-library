import { DuneClient } from "@duneanalytics/client-sdk";
import { env } from "@/lib/env";

const CACHE_TIME_MS = 1000 * 60 * 60 * 24;

let cached: Record<string, number> | null = null;
let cachedAt: number | null = null;

export async function getDataBurn(): Promise<Record<string, number>> {
  if (cached && cachedAt && cachedAt > Date.now() - CACHE_TIME_MS) {
    return cached;
  }

  if (!env.DUNE_API_KEY) {
    cached = {};
    cachedAt = Date.now();
    return cached;
  }

  const client = new DuneClient(env.DUNE_API_KEY);
  const result = await client.getLatestResult({ queryId: 5069123 });
  const rows = result.result?.rows ?? [];
  cached = rows.reduce<Record<string, number>>((acc, row) => {
    const subdao = (row as { subdao?: string }).subdao;
    const dcBurned = (row as { dc_burned?: number }).dc_burned;
    if (subdao && typeof dcBurned === "number") {
      acc[subdao] = dcBurned;
    }
    return acc;
  }, {});
  cachedAt = Date.now();
  return cached;
}
