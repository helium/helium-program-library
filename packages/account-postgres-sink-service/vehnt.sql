
WITH
  readable_positions AS (
    SELECT p.*,
      r.realm_governing_token_mint,
      cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'lockupSaturationSecs' as numeric) as lockup_saturation_seconds,
      cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'maxExtraLockupVoteWeightScaledFactor' as numeric) / 1000000000 as max_extra_lockup_vote_weight_scaled_factor,
      CASE WHEN p.genesis_end > current_ts THEN cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'genesisVotePowerMultiplier' as numeric) ELSE 1 END as genesis_multiplier,
      cast(
          p.end_ts - 
          CASE WHEN lockup_kind = 'constant' THEN start_ts ELSE current_ts END
          as numeric
        ) as seconds_remaining
    FROM (
      SELECT *,
        lockup->>'kind' as lockup_kind,
        cast(lockup->>'endTs' as numeric) as end_ts,
        cast(lockup->>'startTs' as numeric) as start_ts,
        -- 1680892887 as current_ts
        FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)) as current_ts
      FROM vsr.positions 
    ) p
    JOIN vsr.registrars r on p.registrar = r.address
  ),
  positions_with_vehnt AS (
    SELECT realm_governing_token_mint as mint,
      address,
      num_active_votes,
      registrar,
      refreshed_at,
      created_at,
      amount_deposited_native,
      ve_tokens,
      initial_ve_tokens,
      CASE WHEN lockup_kind = 'constant' THEN 0 ELSE ve_tokens / (end_ts - current_ts) END as fall_rate,
      start_ts,
      end_ts,
      current_ts
    FROM (
      SELECT *,
        amount_deposited_native * (
          LEAST(
            seconds_remaining / lockup_saturation_seconds,
            1
          ) * (
            max_extra_lockup_vote_weight_scaled_factor
          ) * genesis_multiplier
        ) as ve_tokens,
        amount_deposited_native * (
          LEAST(
            (end_ts - start_ts) / lockup_saturation_seconds,
            1
          ) * (
            max_extra_lockup_vote_weight_scaled_factor
          ) * genesis_multiplier 
        ) as initial_ve_tokens
      FROM readable_positions
    ) a
  ),
  subdao_delegations AS (
    SELECT
      count(*) as delegations,
      sum(p.fall_rate) as real_fall_rate,
      min(s.vehnt_fall_rate) / 1000000000000 as approx_fall_rate,
      s.dnt_mint as mint,
      SUM(ve_tokens) as real_ve_tokens,
      (
        MIN(s.vehnt_delegated) - (
          (min(current_ts) - min(s.vehnt_last_calculated_ts))
           * min(s.vehnt_fall_rate)
        )
      ) / 1000000000000 as approx_ve_tokens,
      MIN(s.vehnt_delegated) as vehnt_delegated_snapshot,
      min(s.vehnt_last_calculated_ts) as vehnt_last_calculated_ts
    FROM positions_with_vehnt p
    JOIN hsd.delegated_positions d on d.position = p.address
    JOIN hsd.sub_daos s on s.address = d.sub_dao
    GROUP BY s.dnt_mint
  )
SELECT 
  mint,
  delegations,
  real_ve_tokens,
  approx_ve_tokens,
  real_fall_rate,
  approx_fall_rate,
  approx_fall_rate - real_fall_rate as fall_rate_diff,
  approx_ve_tokens - real_ve_tokens as ve_tokens_diff
FROM subdao_delegations
