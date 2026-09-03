import BN from "bn.js";

export interface Season {
  start: BN;
  end: BN;
}

/**
 * Mirrors `ProxyConfigV0::get_current_season` on-chain: a season is current
 * only while `start <= now < end`. Past the last season's end there is none,
 * and the program's `.unwrap()` on it would panic, so callers must refuse to
 * build rather than sign a bundle that cannot land.
 */
export function getCurrentSeason(
  seasons: Season[],
  now: BN
): Season | undefined {
  return [...seasons]
    .reverse()
    .find((season) => now.gte(season.start) && now.lt(season.end));
}

export function getCurrentSeasonEnd(
  seasons: Season[],
  now: BN
): BN | undefined {
  return getCurrentSeason(seasons, now)?.end;
}
