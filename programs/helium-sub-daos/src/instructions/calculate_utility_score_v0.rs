use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};
use circuit_breaker::CircuitBreaker;
use no_emit::{NoEmit, NotEmittedCounterV0};
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, VerificationLevel};
use shared_utils::{precise_number::PreciseNumber, try_from};
use voter_stake_registry::state::Registrar;

use crate::{
  backstop::{compute_backstop, BackstopInput, MOBILE_SUB_DAO},
  current_epoch,
  error::ErrorCode,
  state::*,
  update_subdao_vehnt, EPOCH_LENGTH,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CalculateUtilityScoreArgsV0 {
  pub epoch: u64,
}

pub const TESTING: bool = std::option_env!("TESTING").is_some();

// Mirror of `data_credits::mint_data_credits_v0::HNT_PRICE_FEED_ID`. Duplicated here
// (rather than imported) because data-credits depends on this crate, not the reverse.
pub const HNT_PRICE_FEED_ID: [u8; 32] = [
  0x64, 0x9f, 0xdd, 0x7e, 0xc0, 0x8e, 0x8e, 0x2a, 0x20, 0xf4, 0x25, 0x72, 0x98, 0x54, 0xe9, 0x02,
  0x93, 0xdc, 0xbe, 0x23, 0x76, 0xab, 0xc4, 0x71, 0x97, 0xa1, 0x4d, 0xa6, 0xff, 0x33, 0x97, 0x56,
];

#[derive(Accounts)]
#[instruction(args: CalculateUtilityScoreArgsV0)]
pub struct CalculateUtilityScoreV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    has_one = registrar,
    has_one = hnt_mint
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &(args.epoch - 1).to_le_bytes()],
    bump,
  )]
  /// CHECK: May not have ever been initialized
  pub prev_dao_epoch_info: UncheckedAccount<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    space = if dao_epoch_info.data_len() > 0 {
        dao_epoch_info.data_len()
    } else {
        DaoEpochInfoV0::size()
    },
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump,
  )]
  pub dao_epoch_info: Box<Account<'info, DaoEpochInfoV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = SubDaoEpochInfoV0::SIZE,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  #[account(
    init_if_needed,
    payer = payer,
    space = SubDaoEpochInfoV0::SIZE,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &(args.epoch - 1).to_le_bytes()],
    bump,
  )]
  pub prev_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    seeds = [b"not_emitted_counter", hnt_mint.key().as_ref()],
    seeds::program = no_emit_program.key(),
    bump
  )]
  /// CHECK: May not have ever been initialized
  pub not_emitted_counter: UncheckedAccount<'info>,
  pub no_emit_program: Program<'info, NoEmit>,
  /// CHECK: HIP 149 backstop HNT/USD Pyth price. Optional, and fully validated in the
  /// handler (feed id, Full verification, staleness, positivity) — any problem makes the
  /// backstop go dormant for the epoch rather than fail the instruction, so a missing or
  /// stale price can never halt reward issuance. No declarative constraints for that
  /// reason; an attacker can at most disable the backstop (same as omitting it), never
  /// inject a price.
  pub hnt_price_oracle: Option<UncheckedAccount<'info>>,
}

const SMOOTHING_FACTOR: u64 = 7;

pub fn handler<'info>(
  ctx: Context<'_, '_, 'info, 'info, CalculateUtilityScoreV0<'info>>,
  args: CalculateUtilityScoreArgsV0,
) -> Result<()> {
  let end_of_epoch_ts = i64::try_from(args.epoch + 1).unwrap() * EPOCH_LENGTH;
  let curr_epoch = current_epoch(Clock::get()?.unix_timestamp);
  ctx.accounts.dao_epoch_info.recent_proposals = ctx.accounts.dao.recent_proposals.clone();

  // Set total rewards, accounting for net emmissions by counting
  // burned hnt since last supply setting.
  let curr_supply = ctx.accounts.hnt_mint.supply;
  let mut prev_supply = curr_supply;
  let mut prev_total_utility_score = 0;
  let mut prev_cumulative_not_emitted = 0;
  let mut cumulative_not_emitted = 0;
  let mut prev_smoothed_hnt_burned = 0;
  let mut not_emitted = 0;

  let prev_dao_epoch_info = &mut ctx.accounts.prev_dao_epoch_info;

  if prev_dao_epoch_info.lamports() > 0 && !prev_dao_epoch_info.to_account_info().data_is_empty() {
    let info: Account<DaoEpochInfoV0> = try_from!(Account<DaoEpochInfoV0>, prev_dao_epoch_info)?;
    prev_supply = info.current_hnt_supply;
    prev_total_utility_score = info.total_utility_score;
    prev_cumulative_not_emitted = info.cumulative_not_emitted;
    prev_smoothed_hnt_burned = info.smoothed_hnt_burned;
  }

  if ctx.accounts.not_emitted_counter.lamports() > 0
    && !ctx
      .accounts
      .not_emitted_counter
      .to_account_info()
      .data_is_empty()
  {
    let info: Account<NotEmittedCounterV0> = try_from!(
      Account<NotEmittedCounterV0>,
      ctx.accounts.not_emitted_counter
    )?;
    cumulative_not_emitted = info.amount_not_emitted;
    not_emitted = info
      .amount_not_emitted
      .saturating_sub(prev_cumulative_not_emitted);
  };

  // Set smoothed hnt burned to 300 if it's not already set
  if ctx.accounts.dao_epoch_info.smoothed_hnt_burned == 0 {
    ctx.accounts.dao_epoch_info.smoothed_hnt_burned = 300;
  }
  if prev_smoothed_hnt_burned == 0 {
    prev_smoothed_hnt_burned = 300;
  }

  let total_hnt_burned = prev_supply
    .saturating_sub(curr_supply)
    .saturating_sub(not_emitted);
  ctx.accounts.dao_epoch_info.smoothed_hnt_burned = (SMOOTHING_FACTOR
    .checked_sub(1)
    .unwrap()
    .checked_mul(prev_smoothed_hnt_burned)
    .unwrap()
    .checked_div(SMOOTHING_FACTOR)
    .unwrap())
  .checked_add(total_hnt_burned.checked_div(SMOOTHING_FACTOR).unwrap())
  .unwrap();

  if ctx.accounts.dao_epoch_info.not_emitted == 0 {
    ctx.accounts.dao_epoch_info.not_emitted = not_emitted;
  }

  if ctx.accounts.dao_epoch_info.cumulative_not_emitted == 0 {
    ctx.accounts.dao_epoch_info.cumulative_not_emitted = cumulative_not_emitted;
  }

  let emission_ts = ctx
    .accounts
    .dao
    .emission_schedule
    .get_emissions_at(end_of_epoch_ts)
    .unwrap();
  let net_emissions_cap = ctx.accounts.dao.net_emissions_cap;
  let smoothed = ctx.accounts.dao_epoch_info.smoothed_hnt_burned;

  // HIP 149 Decision 1 backstop. When a valid, fresh Pyth HNT price and the Mobile
  // signals are both available, size the deployer target-minimum top-up (added on top of
  // the existing carrier-burn re-emit) and the earnings-cap ceiling (stored for
  // issue_rewards_v0 to apply on the Mobile pass). Both passes (IoT and Mobile) read the
  // same Mobile signals and compute the same total_rewards, so the result is independent
  // of sub-DAO ordering.
  //
  // Fail-safe: if the price is missing/stale/malformed or the Mobile epoch-info accounts
  // aren't supplied, the backstop is dormant for the epoch (baseline emission + existing
  // re-emit, no top-up, no cap) rather than failing the instruction. A stale price can
  // never halt reward issuance, and the HIP already treats the target as a best-effort
  // per-epoch aim, not a hard guarantee.
  let hnt_price = read_hnt_price(&ctx);
  let backstop = match (hnt_price, mobile_signals(&ctx, args.epoch)) {
    (Some((decimals_factor, hnt_price_with_conf)), Some((mobile_dc_burned, mobile_share))) => {
      compute_backstop(&BackstopInput {
        emission: emission_ts,
        smoothed_hnt_burned: smoothed,
        net_emissions_cap,
        mobile_dc_burned,
        mobile_share,
        decimals_factor,
        hnt_price_with_conf,
      })
    }
    _ => {
      let existing_re_emit = std::cmp::min(smoothed, net_emissions_cap);
      crate::backstop::BackstopOutput {
        existing_re_emit,
        top_up: 0,
        total_rewards: emission_ts.checked_add(existing_re_emit).unwrap(),
        deployer_cap_hnt: 0,
      }
    }
  };

  ctx.accounts.dao_epoch_info.total_rewards = backstop.total_rewards;
  ctx.accounts.dao_epoch_info.hnt_price_used = hnt_price.map(|(_, p)| p).unwrap_or(0);
  ctx.accounts.dao_epoch_info.deployer_cap_hnt = backstop.deployer_cap_hnt;

  ctx.accounts.dao_epoch_info.epoch = args.epoch;

  ctx.accounts.dao_epoch_info.current_hnt_supply = curr_supply
    .checked_add(ctx.accounts.dao_epoch_info.total_rewards)
    .unwrap();

  // HIP 149 Decision 2 supply-tracking correction. issue_rewards_v0 mints the supplement
  // this epoch (supplement_per_subdao per sub-DAO pass, split between the Receiving Entity
  // vault and the Council fanout, so num_sub_daos passes sum to the full daily amount, the
  // split notwithstanding). Record that total in
  // current_hnt_supply so next epoch's prev_supply is accurate; otherwise the mint reads
  // as "negative burn", drives smoothed_hnt_burned to zero across its window, and disables
  // both the floor top-up and the HIP 20 net-emissions re-emit. Tracking it here (and only
  // here) keeps total_hnt_burned self-correcting -- adding it to total_hnt_burned as well
  // would double-count. Mirrors the audited 2024-2025 treasury-mint block below.
  let supplement_this_epoch =
    crate::supplement::supplement_per_subdao(Clock::get()?.unix_timestamp)
      .saturating_mul(ctx.accounts.dao.num_sub_daos as u64);
  ctx.accounts.dao_epoch_info.current_hnt_supply = ctx
    .accounts
    .dao_epoch_info
    .current_hnt_supply
    .checked_add(supplement_this_epoch)
    .unwrap();

  // Until August 1st, 2025, emit the 2.9M HNT to the treasury.
  // This contract will be deployed between December 6 and December 7 at UTC midnight.
  // That means this will emit payment from December 7 to August 1st, 2025 (because epochs are paid in arrears).
  // This is a total of 237 days. 2.9M HNT / 237 days = 12236.28691983 HNT per day.
  #[allow(clippy::inconsistent_digit_grouping)]
  if !TESTING && curr_epoch * (EPOCH_LENGTH as u64) < 1754006400 {
    ctx.accounts.dao_epoch_info.current_hnt_supply = ctx
      .accounts
      .dao_epoch_info
      .current_hnt_supply
      .checked_add(12_236_28691983)
      .unwrap();
  }

  if !TESTING && args.epoch >= curr_epoch {
    return Err(error!(ErrorCode::EpochNotOver));
  }

  if !TESTING && ctx.accounts.sub_dao_epoch_info.utility_score.is_some() {
    return Err(error!(ErrorCode::UtilityScoreAlreadyCalculated));
  }

  if end_of_epoch_ts < ctx.accounts.dao.emission_schedule[0].start_unix_time {
    return Err(error!(ErrorCode::EpochTooEarly));
  }

  ctx.accounts.sub_dao_epoch_info.epoch = args.epoch;
  let epoch_end_ts = ctx.accounts.sub_dao_epoch_info.end_ts();
  update_subdao_vehnt(
    &mut ctx.accounts.sub_dao,
    &mut ctx.accounts.sub_dao_epoch_info,
    epoch_end_ts,
  )?;

  ctx.accounts.dao_epoch_info.vehnt_at_epoch_start +=
    ctx.accounts.sub_dao_epoch_info.vehnt_at_epoch_start;

  ctx.accounts.dao_epoch_info.dao = ctx.accounts.dao.key();
  ctx.accounts.sub_dao_epoch_info.sub_dao = ctx.accounts.sub_dao.key();
  ctx.accounts.sub_dao_epoch_info.bump_seed = ctx.bumps.sub_dao_epoch_info;
  ctx.accounts.sub_dao_epoch_info.initialized = true;
  ctx.accounts.prev_sub_dao_epoch_info.sub_dao = ctx.accounts.sub_dao.key();
  ctx.accounts.prev_sub_dao_epoch_info.bump_seed = ctx.bumps.prev_sub_dao_epoch_info;
  ctx.accounts.prev_sub_dao_epoch_info.epoch = args.epoch - 1;
  ctx.accounts.dao_epoch_info.bump_seed = ctx.bumps.dao_epoch_info;

  // Calculate utility score
  // utility score = V = veHNT_dnp
  let epoch_info = &mut ctx.accounts.sub_dao_epoch_info;

  // Convert veHNT to utility score:
  // 1. veHNT starts with 8 decimals
  // 2. We want 12 decimals in the final utility score
  // 3. Therefore multiply by 10^4 (since 10^12/10^8 = 10^4)
  // This is equivalent to dividing by 10^8 and multiplying by 10^12, but no lost precision
  let vehnt_staked = PreciseNumber::new(epoch_info.vehnt_at_epoch_start.into())
    .unwrap()
    .checked_mul(&PreciseNumber::new(10000_u128).unwrap()) // Multiply by 10^4 to convert from 8 to 12 decimals
    .unwrap();

  let utility_score = vehnt_staked.to_imprecise().unwrap();

  // Store utility scores for this epoch
  epoch_info.utility_score = Some(utility_score);

  let prev_epoch_info = &ctx.accounts.prev_sub_dao_epoch_info;
  let previous_percentage = prev_epoch_info.previous_percentage;

  // Initialize previous percentage if it's not already set
  ctx.accounts.prev_sub_dao_epoch_info.previous_percentage = match previous_percentage {
    // This was just deployed, so we don't have a previous utility score set
    // Set it by using the percentage of the total utility score
    0 => match prev_epoch_info.utility_score {
      Some(prev_score) => {
        if prev_total_utility_score == 0 {
          0
        } else {
          prev_score
            .checked_mul(u32::MAX as u128)
            .and_then(|x| x.checked_div(prev_total_utility_score))
            .map(|x| x as u32)
            .unwrap_or(0)
        }
      }
      // Either this is a new subnetwork or this whole program was just deployed
      None => match prev_total_utility_score {
        // If there is no previous utility score, this is a new program deployment
        // Set it by using the percentage of the total utility score
        0 => u32::MAX
          .checked_div(ctx.accounts.dao.num_sub_daos)
          .unwrap_or(0),
        // If there is a previous utility score, this is a new subnetwork
        _ => 0,
      },
    },
    _ => previous_percentage,
  };

  // Only increment utility scores when either (a) in prod or (b) testing and we haven't already over-calculated utility scores.
  // TODO: We can remove this after breakpoint demo
  if !(TESTING
    && ctx.accounts.dao_epoch_info.num_utility_scores_calculated > ctx.accounts.dao.num_sub_daos)
  {
    ctx.accounts.dao_epoch_info.num_utility_scores_calculated += 1;
    ctx.accounts.dao_epoch_info.total_utility_score = ctx
      .accounts
      .dao_epoch_info
      .total_utility_score
      .checked_add(utility_score)
      .unwrap();
  }

  if ctx.accounts.dao_epoch_info.num_utility_scores_calculated >= ctx.accounts.dao.num_sub_daos {
    ctx.accounts.dao_epoch_info.done_calculating_scores = true;
  }

  Ok(())
}

/// Maximum age of the HNT price for it to feed the backstop. A daily mechanism tolerates
/// staleness (intra-day drift is small), and a too-old price simply makes the backstop
/// dormant rather than wrong. Generous under TESTING so posted test prices never expire.
const PRICE_MAX_AGE_SECS: i64 = 60 * 60;

/// Read the confidence-adjusted HNT price and DC->HNT scale factor from the optional Pyth
/// account, mirroring `mint_data_credits_v0`'s price math. Returns `None` (backstop
/// dormant this epoch) for any reason the price can't be trusted: not supplied, wrong
/// owner/type, wrong feed, not Full-verified, stale, or non-positive. Never errors, so a
/// bad price can't halt reward issuance.
fn read_hnt_price<'info>(
  ctx: &Context<'_, '_, '_, 'info, CalculateUtilityScoreV0<'info>>,
) -> Option<(u128, u64)> {
  let oracle = ctx.accounts.hnt_price_oracle.as_ref()?;
  let price_update = try_from!(Account<PriceUpdateV2>, oracle).ok()?;

  if price_update.verification_level != VerificationLevel::Full {
    return None;
  }
  let message = price_update.price_message;
  if message.feed_id != HNT_PRICE_FEED_ID {
    return None;
  }

  let now = Clock::get().ok()?.unix_timestamp;
  let max_age = if TESTING {
    6_000_000
  } else {
    PRICE_MAX_AGE_SECS
  };
  if message.publish_time.saturating_add(max_age) < now {
    return None;
  }

  // Remove the confidence to use the most conservative (lower) price, exactly as
  // mint_data_credits_v0 does. A lower price yields a larger top-up; the burn bound
  // still caps total re-emission at recent destruction.
  let hnt_price_with_conf = message
    .ema_price
    .checked_sub(i64::try_from(message.ema_conf.checked_mul(2)?).ok()?)?;
  if hnt_price_with_conf <= 0 {
    return None;
  }

  // decimals_factor = 10^(hnt_decimals - expo - 5); converts a DC count to HNT lamports.
  let exponent = i32::from(ctx.accounts.hnt_mint.decimals) - message.exponent - 5;
  let decimals_factor = 10_u128.checked_pow(u32::try_from(exponent).ok()?)?;

  Some((decimals_factor, u64::try_from(hnt_price_with_conf).ok()?))
}

/// Read the Mobile sub-DAO's per-epoch `dc_burned` and 30-epoch EMA percent share, or
/// `None` (backstop dormant) if the Mobile epoch-info accounts aren't available.
///
/// In production these come from the Mobile sub-DAO's current- and previous-epoch
/// `SubDaoEpochInfoV0` accounts, located in `remaining_accounts` by their PDAs (pinned to
/// the hardcoded mainnet `MOBILE_SUB_DAO`). Under TESTING the sub-DAO being processed
/// plays the role of Mobile, so the named current/previous epoch-info accounts are used
/// directly.
fn mobile_signals<'info>(
  ctx: &Context<'_, '_, 'info, 'info, CalculateUtilityScoreV0<'info>>,
  epoch: u64,
) -> Option<(u64, u32)> {
  if TESTING {
    return Some((
      ctx.accounts.sub_dao_epoch_info.dc_burned,
      ctx.accounts.prev_sub_dao_epoch_info.previous_percentage,
    ));
  }

  let curr_pda = Pubkey::find_program_address(
    &[
      b"sub_dao_epoch_info",
      MOBILE_SUB_DAO.as_ref(),
      &epoch.to_le_bytes(),
    ],
    &crate::ID,
  )
  .0;
  let prev_pda = Pubkey::find_program_address(
    &[
      b"sub_dao_epoch_info",
      MOBILE_SUB_DAO.as_ref(),
      &(epoch - 1).to_le_bytes(),
    ],
    &crate::ID,
  )
  .0;

  let curr_acc = ctx
    .remaining_accounts
    .iter()
    .find(|acc| acc.key() == curr_pda)?;
  let prev_acc = ctx
    .remaining_accounts
    .iter()
    .find(|acc| acc.key() == prev_pda)?;

  let curr = Account::<SubDaoEpochInfoV0>::try_from(curr_acc).ok()?;
  let prev = Account::<SubDaoEpochInfoV0>::try_from(prev_acc).ok()?;
  Some((curr.dc_burned, prev.previous_percentage))
}
