CREATE OR REPLACE VIEW positions_with_vetokens AS (
  WITH
  readable_positions AS (
    SELECT p.*,
      r.realm_governing_token_mint,
      cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'lockupSaturationSecs' as numeric) as lockup_saturation_seconds,
      cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'maxExtraLockupVoteWeightScaledFactor' as numeric) / 1000000000 as max_extra_lockup_vote_weight_scaled_factor,
      CASE WHEN p.genesis_end > current_ts THEN cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'genesisVotePowerMultiplier' as numeric) ELSE 1 END as genesis_multiplier,
      GREATEST(
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
      mint as asset,
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
        CASE WHEN current_ts < genesis_end THEN
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
  )
  SELECT * FROM positions_with_vehnt
)
