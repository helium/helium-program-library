import { PublicKey } from "@solana/web3.js";
import { Registrar, VotingMintConfig } from "../sdk/types";

export const calcMultiplier = ({
  baselineScaledFactor,
  maxExtraLockupScaledFactor,
  lockupSecs,
  lockupSaturationSecs,
}: {
  baselineScaledFactor: number;
  maxExtraLockupScaledFactor: number;
  lockupSecs: number;
  lockupSaturationSecs: number;
}): number => {
  let multiplier = 0;
  const base = baselineScaledFactor !== 0 ? baselineScaledFactor : 1e9;

  multiplier =
    (Math.min(lockupSecs / lockupSaturationSecs, 1) *
      maxExtraLockupScaledFactor) /
    base;

  return multiplier < 0 ? 0 : multiplier;
};

export const calcLockupMultiplier = ({
  lockupSecs,
  registrar,
  mint,
}: {
  lockupSecs: number;
  registrar: Registrar | null;
  mint: PublicKey;
}) => {
  let multiplier = 0;
  const mintCfgs = registrar?.votingMints || [];
  const mintCfg = mintCfgs?.find((cfg) => cfg.mint.equals(mint));

  if (mintCfg && !mintCfg.mint.equals(PublicKey.default)) {
    const {
      baselineVoteWeightScaledFactor,
      lockupSaturationSecs,
      maxExtraLockupVoteWeightScaledFactor,
      // genesisVotePowerMultiplier,
      // genesisVotePowerMultiplierExpirationTs
    } = mintCfg as VotingMintConfig;
    const baselineScaledFactorNum = baselineVoteWeightScaledFactor.toNumber();
    const maxExtraLockupVoteWeightScaledFactorNum =
      maxExtraLockupVoteWeightScaledFactor.toNumber();
    const lockupSaturationSecsNum = lockupSaturationSecs.toNumber();

    multiplier = calcMultiplier({
      baselineScaledFactor: baselineScaledFactorNum,
      maxExtraLockupScaledFactor: maxExtraLockupVoteWeightScaledFactorNum,
      lockupSecs,
      lockupSaturationSecs: lockupSaturationSecsNum,
    });
  }

  return parseFloat(multiplier.toFixed(2));
};
