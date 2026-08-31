use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use circuit_breaker::{
  cpi::{accounts::MintV0, mint_v0},
  CircuitBreaker, MintArgsV0, MintWindowedCircuitBreakerV0,
};
use shared_utils::precise_number::{InnerUint, PreciseNumber};

use crate::{
  current_epoch, dao_seeds, error::ErrorCode, state::*, OrArithError, EPOCH_LENGTH, TESTING,
};

const SMOOTHING_FACTOR: u128 = 30;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct IssueRewardsArgsV0 {
  pub epoch: u64,
}

#[derive(Accounts)]
#[instruction(args: IssueRewardsArgsV0)]
pub struct IssueRewardsV0<'info> {
  #[account(
    has_one = hnt_mint,
    has_one = delegator_pool,
    has_one = rewards_escrow,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    has_one = dao,
    has_one = treasury,
    has_one = dnt_mint,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    mut,
    has_one = dao,
    constraint = dao_epoch_info.num_utility_scores_calculated >= dao.num_sub_daos @ ErrorCode::MissingUtilityScores,
    seeds = ["dao_epoch_info".as_bytes(), dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump = dao_epoch_info.bump_seed,
    constraint = !dao_epoch_info.done_issuing_rewards
  )]
  pub dao_epoch_info: Box<Account<'info, DaoEpochInfoV0>>,
  #[account(
    mut,
    has_one = sub_dao,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &args.epoch.to_le_bytes()],
    bump = sub_dao_epoch_info.bump_seed,
    constraint = TESTING || sub_dao_epoch_info.rewards_issued_at.is_none()
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    mut,
    seeds = ["mint_windowed_breaker".as_bytes(), hnt_mint.key().as_ref()],
    seeds::program = circuit_breaker_program.key(),
    bump = hnt_circuit_breaker.bump_seed
  )]
  pub hnt_circuit_breaker: Box<Account<'info, MintWindowedCircuitBreakerV0>>,
  #[account(mut)]
  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub dnt_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub treasury: Box<Account<'info, TokenAccount>>,
  #[account(mut)]
  pub rewards_escrow: Box<Account<'info, TokenAccount>>,
  #[account(mut)]
  pub delegator_pool: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub circuit_breaker_program: Program<'info, CircuitBreaker>,
  #[account(
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &(args.epoch - 1).to_le_bytes()],
    bump = prev_sub_dao_epoch_info.bump_seed,
  )]
  pub prev_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  // HIP 149 Decision 2 supplement vault (the Receiving Entity's Squads vault HNT account).
  // Optional so pre-supplement callers/tests need not pass it; required only when the
  // supplement window is active (enforced in the handler). Validated there: key equals
  // SUPPLEMENT_VAULT_TOKEN_ACCOUNT (relaxed under TESTING). The HNT mint is enforced by the
  // mint CPI.
  #[account(mut)]
  pub supplement_vault: Option<Box<Account<'info, TokenAccount>>>,
  // HIP 149 Decision 4 Council-compensation fanout (a mini_fanout PDA-owned HNT account that
  // splits the 1.25% carve-out among the seated community members). Optional/required on the
  // same terms as supplement_vault. Validated in the handler: key equals
  // COUNCIL_FANOUT_TOKEN_ACCOUNT (relaxed under TESTING).
  #[account(mut)]
  pub council_vault: Option<Box<Account<'info, TokenAccount>>>,
}

fn to_prec(n: Option<u128>) -> Option<PreciseNumber> {
  Some(PreciseNumber {
    value: InnerUint::from(n?),
  })
}

impl<'info> IssueRewardsV0<'info> {
  /// CpiContext to mint HNT (through the HNT circuit breaker, signed by the DAO) to
  /// `to`. All HNT mints in this instruction differ only in the destination.
  fn mint_hnt_to_ctx(
    &self,
    to: AccountInfo<'info>,
  ) -> CpiContext<'_, '_, '_, 'info, MintV0<'info>> {
    let cpi_accounts = MintV0 {
      mint: self.hnt_mint.to_account_info(),
      to,
      mint_authority: self.dao.to_account_info(),
      circuit_breaker: self.hnt_circuit_breaker.to_account_info(),
      token_program: self.token_program.to_account_info(),
    };

    CpiContext::new(self.circuit_breaker_program.to_account_info(), cpi_accounts)
  }

  pub fn mint_delegation_rewards_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintV0<'info>> {
    self.mint_hnt_to_ctx(self.delegator_pool.to_account_info())
  }

  pub fn mint_treasury_emissions_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintV0<'info>> {
    self.mint_hnt_to_ctx(self.treasury.to_account_info())
  }

  pub fn mint_rewards_emissions_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintV0<'info>> {
    self.mint_hnt_to_ctx(self.rewards_escrow.to_account_info())
  }
}

pub fn handler(ctx: Context<IssueRewardsV0>, args: IssueRewardsArgsV0) -> Result<()> {
  let curr_ts = Clock::get()?.unix_timestamp;
  let curr_ts_epoch = current_epoch(curr_ts);
  let end_of_epoch_ts = i64::try_from(args.epoch + 1).unwrap() * EPOCH_LENGTH;

  if !TESTING && args.epoch >= curr_ts_epoch {
    return Err(error!(ErrorCode::EpochNotOver));
  }

  let utility_score = to_prec(ctx.accounts.sub_dao_epoch_info.utility_score)
    .ok_or_else(|| error!(ErrorCode::NoUtilityScore))?;
  let total_utility_score = to_prec(Some(ctx.accounts.dao_epoch_info.total_utility_score))
    .ok_or_else(|| error!(ErrorCode::NoUtilityScore))?;

  let percent_share_pre_smooth = utility_score
    .checked_div(&total_utility_score)
    .or_arith_error()?;

  // Convert previous percentage from u32 to PreciseNumber (divide by u32::MAX)
  let prev_percentage =
    PreciseNumber::new(ctx.accounts.prev_sub_dao_epoch_info.previous_percentage as u128)
      .or_arith_error()?
      .checked_div(&PreciseNumber::new(u32::MAX as u128).or_arith_error()?)
      .or_arith_error()?;

  let percent_share = prev_percentage
    .checked_mul(&PreciseNumber::new(SMOOTHING_FACTOR - 1).or_arith_error()?)
    .or_arith_error()?
    .checked_div(&PreciseNumber::new(SMOOTHING_FACTOR).or_arith_error()?)
    .or_arith_error()?
    .checked_add(
      &percent_share_pre_smooth
        .checked_mul(&PreciseNumber::new(1).or_arith_error()?)
        .or_arith_error()?
        .checked_div(&PreciseNumber::new(SMOOTHING_FACTOR).or_arith_error()?)
        .or_arith_error()?,
    )
    .or_arith_error()?;

  ctx.accounts.sub_dao_epoch_info.previous_percentage = percent_share
    .checked_mul(&PreciseNumber::new(u32::MAX as u128).or_arith_error()?)
    .or_arith_error()?
    .to_imprecise()
    .ok_or_else(|| error!(ErrorCode::ArithmeticError))?
    .try_into()
    .unwrap();

  // The backstop top-up is minted whole into the Mobile data rewards escrow below, so it
  // takes no HST cut, no sub-DAO share and no delegator slice: what is split here is the
  // rest of the epoch's DAO-level mint. Every pass subtracts it, so IoT never receives a
  // share of HNT minted to support Mobile deployers.
  let (total_emissions, backstop_top_up) = crate::backstop::split_total_rewards(
    ctx.accounts.dao_epoch_info.total_rewards,
    ctx
      .accounts
      .dao
      .emission_schedule
      .get_emissions_at(end_of_epoch_ts)
      .ok_or_else(|| error!(ErrorCode::ArithmeticError))?,
    ctx.accounts.dao_epoch_info.smoothed_hnt_burned,
    ctx.accounts.dao.net_emissions_cap,
  );
  let hst_percent = ctx
    .accounts
    .dao
    .hst_emission_schedule
    .get_percent_at(end_of_epoch_ts)
    .unwrap();
  // Subdaos get the remainder after hst
  let emissions = 100_u64
    .checked_sub(hst_percent.into())
    .unwrap()
    .checked_mul(total_emissions)
    .unwrap()
    .checked_div(100)
    .unwrap();
  let total_rewards = PreciseNumber::new(emissions.into()).or_arith_error()?;
  let rewards_prec = percent_share.checked_mul(&total_rewards).or_arith_error()?;
  let rewards_amount: u64 = rewards_prec
    .floor() // Ensure we never overspend the defined rewards
    .or_arith_error()?
    .to_imprecise()
    .ok_or_else(|| error!(ErrorCode::ArithmeticError))?
    .try_into()
    .unwrap();
  let delegation_rewards_amount: u64 = (rewards_amount as u128)
    .checked_mul(u128::from(ctx.accounts.dao.delegator_rewards_percent))
    .unwrap()
    // Same scale the backstop's baseline reads delegator_rewards_percent at, so the amount
    // the band is sized against and the amount minted here cannot drift apart.
    .checked_div(PERCENT_SCALE as u128)
    .unwrap()
    .try_into()
    .unwrap();

  // The Mobile sub-DAO pass carries both halves of the deployer earnings band, from the
  // ceiling calculate_utility_score_v0 stored and the top-up split out of total_rewards
  // above:
  //
  // - The target minimum is delivered by minting the top-up straight into the rewards
  //   escrow, so all of it reaches deployers instead of a fraction surviving the splits.
  // - The earnings cap holds deployers at no more than three times the carrier-paid USD:
  //   any HNT in the data bucket and top-up above the ceiling is redirected from the
  //   escrow to the shared delegator pool. That redirect is a bucket-to-bucket move, so
  //   the HNT is paid to veHNT delegators instead of deployers and staker claims already
  //   key off the DAO-level delegation_rewards_issued. A zero ceiling (no carrier burn
  //   this epoch, or no price oracle) disables it.
  let is_mobile = TESTING || ctx.accounts.sub_dao.key() == crate::backstop::MOBILE_SUB_DAO;
  // The top-up is a DAO-level amount, sized once per epoch and recorded once in
  // total_rewards, so exactly one pass may mint it. In production is_mobile already selects
  // one pass. Under TESTING it selects every sub-DAO, so pin it to the epoch's first pass
  // there (num_rewards_issued is incremented after the mints below): N sub-DAOs would
  // otherwise mint N top-ups against the one the epoch recorded.
  //
  // The `!TESTING ||` is load-bearing and must not be simplified away. This instruction is
  // permissionless and the passes may arrive in any order, so in production the Mobile pass
  // is not necessarily the first: gating on num_rewards_issued alone would mint no top-up
  // whenever any other sub-DAO settled first, silently under-delivering the floor against a
  // total_rewards that already counted it.
  let is_top_up_pass =
    is_mobile && (!TESTING || ctx.accounts.dao_epoch_info.num_rewards_issued == 0);
  let top_up = if is_top_up_pass { backstop_top_up } else { 0 };
  // What the escrow mint would be before the cap redirect: the deployer portion of the
  // split (rewards_amount - delegator slice) plus the direct top-up.
  let deployer_pool = rewards_amount
    .checked_sub(delegation_rewards_amount)
    .unwrap()
    .checked_add(top_up)
    .unwrap();
  let staker_overflow: u64 = if is_mobile {
    crate::backstop::staker_overflow(deployer_pool, ctx.accounts.dao_epoch_info.deployer_cap_hnt)
  } else {
    0
  };

  let delegation_pool_amount = delegation_rewards_amount
    .checked_add(staker_overflow)
    .unwrap();

  if delegation_pool_amount > 0 {
    msg!("Minting {} delegation rewards", delegation_pool_amount);
    mint_v0(
      ctx
        .accounts
        .mint_delegation_rewards_ctx()
        .with_signer(&[dao_seeds!(ctx.accounts.dao)]),
      MintArgsV0 {
        amount: delegation_pool_amount, // delegator slice + any earnings-cap overflow
      },
    )?;
  }

  // Includes the backstop top-up on the Mobile pass, so the Mobile verifier picks it up
  // through hnt_rewards_issued as part of the data pool it distributes pro-rata.
  let escrow_amount = deployer_pool.checked_sub(staker_overflow).unwrap();
  msg!("Minting {} to rewards escrow", escrow_amount);
  mint_v0(
    ctx
      .accounts
      .mint_rewards_emissions_ctx()
      .with_signer(&[dao_seeds!(ctx.accounts.dao)]),
    MintArgsV0 {
      amount: escrow_amount,
    },
  )?;

  ctx.accounts.sub_dao_epoch_info.hnt_rewards_issued = escrow_amount;
  ctx.accounts.dao_epoch_info.num_rewards_issued += 1;
  ctx.accounts.sub_dao_epoch_info.rewards_issued_at = Some(Clock::get()?.unix_timestamp);
  ctx.accounts.dao_epoch_info.delegation_rewards_issued += delegation_pool_amount;
  ctx.accounts.sub_dao_epoch_info.delegation_rewards_issued = delegation_pool_amount;
  ctx.accounts.dao_epoch_info.done_issuing_rewards =
    ctx.accounts.dao.num_sub_daos == ctx.accounts.dao_epoch_info.num_rewards_issued;

  // HIP 149 Decision 2 + 4: mint this sub-DAO's slice of the operations-and-growth supplement
  // while the supplement window is active. Each sub-DAO pass mints supplement_per_subdao, so
  // num_sub_daos passes sum to the full daily rate (which calculate_utility_score_v0 records
  // in current_hnt_supply). The slice is split, per HIP 149 Decision 4, into a 1.25% Council
  // compensation carve-out (to the Council fanout) and the remainder (to the Receiving Entity
  // vault); the two sum to supplement_per_subdao, so the supply-tracking correction is
  // unchanged and total minted is unaffected. Both mints go through the HNT circuit breaker
  // like the reward mints, so the breaker must be sized for the full supplement. Dormant (no
  // mint, vaults not required) whenever the hardcoded window is inactive.
  let supplement = crate::supplement::supplement_per_subdao(curr_ts);
  if supplement > 0 {
    let council_amount = crate::supplement::council_cut(supplement);
    let vault_amount = supplement.saturating_sub(council_amount);

    // Receiving Entity vault (the 98.75% remainder).
    let vault = ctx
      .accounts
      .supplement_vault
      .as_ref()
      .ok_or_else(|| error!(ErrorCode::SupplementVaultMissing))?;
    require!(
      TESTING || vault.key() == crate::supplement::SUPPLEMENT_VAULT_TOKEN_ACCOUNT,
      ErrorCode::InvalidSupplementVault
    );
    // Council fanout (the 1.25% carve-out). Always required while active, even if the
    // tapered amount rounds the carve-out to zero, so the destination is unambiguous.
    let council = ctx
      .accounts
      .council_vault
      .as_ref()
      .ok_or_else(|| error!(ErrorCode::CouncilVaultMissing))?;
    require!(
      TESTING || council.key() == crate::supplement::COUNCIL_FANOUT_TOKEN_ACCOUNT,
      ErrorCode::InvalidCouncilVault
    );

    msg!("Minting {vault_amount} supplement, {council_amount} Council compensation");
    mint_v0(
      ctx
        .accounts
        .mint_hnt_to_ctx(vault.to_account_info())
        .with_signer(&[dao_seeds!(ctx.accounts.dao)]),
      MintArgsV0 {
        amount: vault_amount,
      },
    )?;
    if council_amount > 0 {
      mint_v0(
        ctx
          .accounts
          .mint_hnt_to_ctx(council.to_account_info())
          .with_signer(&[dao_seeds!(ctx.accounts.dao)]),
        MintArgsV0 {
          amount: council_amount,
        },
      )?;
    }
  }

  Ok(())
}
