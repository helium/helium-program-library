import BN from "bn.js";

export interface Season {
  start: BN;
  end: BN;
}

export function getCurrentSeason(
  seasons: Season[],
  now: BN,
): Season | undefined {
  return [...seasons].reverse().find((season) => now.gte(season.start));
}

export function getCurrentSeasonEnd(
  seasons: Season[],
  now: BN,
): BN | undefined {
  return getCurrentSeason(seasons, now)?.end;
}
