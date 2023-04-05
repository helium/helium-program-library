

CREATE OR REPLACE VIEW positions_with_vehnt AS (
  SELECT r.realm_governing_token_mint as mint,
    p.address,
    p.num_active_votes,
    p.registrar,
    p.refreshed_at,
    p.created_at,
    amount_deposited_native,
    amount_deposited_native * (LEAST(
      cast( -- Remaining seconds
        cast(p.lockup->>'endTs' as numeric) - 
        CASE WHEN p.lockup->>'kind' = 'constant' THEN cast(p.lockup->>'startTs' as numeric) ELSE EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) END
        as numeric
      )
        -- Max total seconds
        / cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'lockupSaturationSecs' as numeric),
      1
    ) * (
      cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'maxExtraLockupVoteWeightScaledFactor' as numeric) / 1000000000
    ) * CASE WHEN p.genesis_end > EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) THEN cast(r.voting_mints[p.voting_mint_config_idx + 1]->>'genesisVotePowerMultiplier' as numeric) ELSE 1 END
  ) as ve_tokens
  FROM vsr.positions p
  JOIN vsr.registrars r on p.registrar = r.address
)

CREATE OR REPLACE VIEW subdao_delegations AS (
  SELECT
    s.dnt_mint as mint,
    SUM(ve_tokens) as ve_tokens,
    (MIN(s.vehnt_delegated) - ((EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) - min(s.vehnt_last_calculated_ts)) * min(s.vehnt_fall_rate))) / 1000000000000 as approx_vehnt,
    MIN(s.vehnt_delegated) as vehnt_delegated_snapshot,
    min(s.vehnt_fall_rate) as vehnt_fall_rate,
    min(s.vehnt_last_calculated_ts) as vehnt_last_calculated_ts
  FROM positions_with_vehnt p
  JOIN hsd.delegated_positions d on d.position = p.address
  JOIN hsd.sub_daos s on s.address = d.sub_dao
  GROUP BY s.dnt_mint
)