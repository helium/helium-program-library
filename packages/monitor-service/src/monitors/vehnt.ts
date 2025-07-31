import BN from "bn.js";
import {
  approxFallRateGauge,
  approxVeTokensGauge,
  realFallRateGauge,
  realVeTokensGauge,
  delegationsGauge,
} from "../metrics";
import { sequelize } from "../model";
import { toNumber } from "@helium/spl-utils";

export async function monitorVehnt() {
  await monitorVehntOnce()
  // Check once a minute
  setInterval(monitorVehntOnce, 60 * 1000)
}

async function monitorVehntOnce() {
  const result = await sequelize.query(`

WITH
  readable_positions AS (
    SELECT p.*,
      r.realm_governing_token_mint,
      cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'lockupSaturationSecs' as numeric) as lockup_saturation_seconds,
      cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'maxExtraLockupVoteWeightScaledFactor' as numeric) / 1000000000 as max_extra_lockup_vote_weight_scaled_factor,
      -- Exclude genesis multiplers for the current epoch since those will have been purged.
      CASE WHEN (floor(p.genesis_end / (60 * 60 * 24)) * (60 * 60 * 24) + 60 * 60 * 24) > current_ts THEN cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'genesisVotePowerMultiplier' as numeric) ELSE 1 END as genesis_multiplier,      GREATEST(
        cast(
          p.end_ts - 
          CASE WHEN lockup_kind = 'constant' THEN start_ts ELSE current_ts END
          as numeric
        ),
        0
      )
       as seconds_remaining
    FROM (
      SELECT *,
        lockup->>'kind' as lockup_kind,
        cast(lockup->>'endTs' as numeric) as end_ts,
        cast(lockup->>'startTs' as numeric) as start_ts,
        -- 1683727980 as current_ts
        FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)) as current_ts
      FROM positions 
    ) p
    JOIN registrars r on p.registrar = r.address
  ),
  positions_with_vehnt AS (
    SELECT realm_governing_token_mint as mint,
      address,
      genesis_end,
      num_active_votes,
      lockup_kind,
      registrar,
      refreshed_at,
      created_at,
      amount_deposited_native,
      ve_tokens,
      initial_ve_tokens,
      CASE WHEN lockup_kind = 'constant' THEN 
        0
      ELSE 
        CASE WHEN current_ts < floor(genesis_end / (60 * 60 * 24)) * (60 * 60 * 24) THEN
          -- genesis
          (ve_tokens - (
              amount_deposited_native * (
                LEAST(
                  (end_ts - genesis_end) / lockup_saturation_seconds,
                  1
                ) * (
                  max_extra_lockup_vote_weight_scaled_factor
                ) * genesis_multiplier
              )
            )
          ) / (genesis_end - current_ts)
        ELSE
          -- normal
          ve_tokens / (end_ts - current_ts) 
        END
      END as fall_rate,
      start_ts,
      end_ts,
      current_ts,
      seconds_remaining
    FROM (
      SELECT *,
        amount_deposited_native * (
           (
            max_extra_lockup_vote_weight_scaled_factor
          ) * genesis_multiplier * LEAST(
            seconds_remaining / lockup_saturation_seconds,
            1
          )
        ) as ve_tokens,
        amount_deposited_native * (
          (
            max_extra_lockup_vote_weight_scaled_factor
          ) * genesis_multiplier * LEAST(
            (end_ts - start_ts) / lockup_saturation_seconds,
            1
          )
        ) as initial_ve_tokens
      FROM readable_positions
    ) a
  ),
  subdao_delegations AS (
    SELECT
      count(*) as delegations,
      min(current_ts) as current_ts,
      sum(p.fall_rate) as real_fall_rate,
      s.vehnt_fall_rate / 1000000000000 as approx_fall_rate,
      s.dnt_mint as mint,
      SUM(ve_tokens) as real_ve_tokens,
      (
        s.vehnt_delegated - (
          (min(current_ts) - s.vehnt_last_calculated_ts)
           * s.vehnt_fall_rate
        )
      ) / 1000000000000 as approx_ve_tokens,
      s.vehnt_delegated as vehnt_delegated_snapshot,
      s.vehnt_last_calculated_ts as vehnt_last_calculated_ts
    FROM positions_with_vehnt p
    JOIN delegated_positions d on d.position = p.address
    JOIN sub_daos s on s.address = d.sub_dao
    -- Remove positions getting purged this epoch or expired this epoch
    WHERE
      (
        lockup_kind = 'constant'
        or end_ts >= (
          floor(current_ts / (60 * 60 * 24)) * (60 * 60 * 24)
        ) + 60 * 60 * 24
      )
      AND d.expiration_ts >= (floor(current_ts / (60 * 60 * 24)) * (60 * 60 * 24)) + 60 * 60 * 24
    GROUP BY s.dnt_mint, s.vehnt_fall_rate, s.vehnt_delegated, s.vehnt_last_calculated_ts, s.vehnt_last_calculated_ts
  )
SELECT 
  mint,
  delegations,
    real_ve_tokens as real_ve_tokens,
    approx_ve_tokens as approx_ve_tokens,
    real_fall_rate as real_fall_rate,
    approx_fall_rate as approx_fall_rate
FROM subdao_delegations;
  `);
  result[0].forEach((result) => {
    const {
      real_ve_tokens,
      approx_ve_tokens,
      real_fall_rate,
      approx_fall_rate,
      mint,
      delegations,
    } = result as any;
    realVeTokensGauge.labels(mint).set(toNumber(new BN(real_ve_tokens.split(".")[0]), 8));
    approxVeTokensGauge
      .labels(mint)
      .set(toNumber(new BN(approx_ve_tokens.split(".")[0]), 8));
    realFallRateGauge
      .labels(mint)
      .set(toNumber(new BN(real_fall_rate.split(".")[0]), 8));
    approxFallRateGauge
      .labels(mint)
      .set(toNumber(new BN(approx_fall_rate.split(".")[0]), 8));
    delegationsGauge.labels(mint).set(Number(delegations));
  });
}