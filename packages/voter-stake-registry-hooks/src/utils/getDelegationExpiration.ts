import { BN } from "@anchor-lang/core";
import { getLockupEffectiveEndTs } from "@helium/helium-sub-daos-sdk";
import { PositionWithMeta } from "../sdk/types";

// Mirrors the closing and genesis-end epoch seeds of helium-sub-daos
// extend_expiration_ts_v0. `registrarNow` is the cluster clock plus the
// registrar's time_offset, which the program judges the season and genesis
// end against.
export const getDelegationExpiration = ({
  position,
  expirationTs,
  seasons,
  registrarNow,
}: {
  position: PositionWithMeta;
  // The delegated position's current expiration; zero means none.
  expirationTs: BN;
  seasons: { start: BN; end: BN }[];
  registrarNow: BN;
}) => {
  const seasonEnd = [...seasons]
    .reverse()
    .find(
      (season) => registrarNow.gte(season.start) && registrarNow.lt(season.end),
    )?.end;
  if (!seasonEnd) {
    throw new Error("No new valid expiration ts found");
  }
  const lockupEffectiveEnd = getLockupEffectiveEndTs(position.lockup);
  const newExpirationTs = BN.min(seasonEnd, lockupEffectiveEnd);
  const oldClosingTs = expirationTs.isZero()
    ? lockupEffectiveEnd
    : BN.min(lockupEffectiveEnd, expirationTs);
  const genesisEndTs = position.genesisEnd.lte(registrarNow)
    ? newExpirationTs
    : position.genesisEnd;

  return { newExpirationTs, oldClosingTs, genesisEndTs };
};
