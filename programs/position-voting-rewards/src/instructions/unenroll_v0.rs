use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use voter_stake_registry::{
  state::{LockupKind, PositionV0, Registrar},
  VoterStakeRegistry,
};

use crate::{
  id,
  state::*,
  util::{calculate_vetoken_info, current_epoch, VetokenInfo},
};

#[derive(Accounts)]
pub struct UnenrollV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    seeds::program = vsr_program.key(),
    bump = position.bump_seed,
    has_one = mint,
    has_one = registrar,
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    token::mint = mint,
    token::authority = position_authority,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,
  #[account(mut)]
  pub position_authority: Signer<'info>,
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    mut,
    has_one = registrar,
  )]
  pub vetoken_tracker: Account<'info, VeTokenTrackerV0>,

  #[account(
    mut,
    has_one = vetoken_tracker,
    seeds = ["enrolled_position".as_bytes(), position.key().as_ref()],
    bump = enrolled_position.bump_seed,
    has_one = position,
  )]
  pub enrolled_position: Account<'info, EnrolledPositionV0>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 60 + VsrEpochInfoV0::INIT_SPACE,
    seeds = ["vsr_epoch_info".as_bytes(), vetoken_tracker.key().as_ref(), &current_epoch(registrar.clock_unix_timestamp()).to_le_bytes()],
    bump,
  )]
  pub vsr_epoch_info: Box<Account<'info, VsrEpochInfoV0>>,
  // We know these two accounts are initialized because
  // They were used when delegate_v0 was called
  #[account(
    mut,
    seeds = ["vsr_epoch_info".as_bytes(), vetoken_tracker.key().as_ref(), &current_epoch(position.lockup.end_ts).to_le_bytes()],
    bump = closing_time_vsr_epoch_info.bump_seed,
  )]
  pub closing_time_vsr_epoch_info: Box<Account<'info, VsrEpochInfoV0>>,
  #[account(
    mut,
    seeds = [
      "vsr_epoch_info".as_bytes(), 
      vetoken_tracker.key().as_ref(),
      &current_epoch(
        // If the genesis piece is no longer in effect (has been purged), 
        // no need to pass an extra account here. Just pass the closing time sdei and
        // do not change it.
        if position.genesis_end <= registrar.clock_unix_timestamp() {
          position.lockup.end_ts
        } else {
          position.genesis_end
        }
      ).to_le_bytes()
    ],
    bump = genesis_end_vsr_epoch_info.bump_seed,
  )]
  pub genesis_end_vsr_epoch_info: Box<Account<'info, VsrEpochInfoV0>>,

  pub vsr_program: Program<'info, VoterStakeRegistry>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UnenrollV0>) -> Result<()> {
  // load the vetokens information
  let position = &mut ctx.accounts.position;
  let registrar = &ctx.accounts.registrar;
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();
  let vetokens_at_curr_ts = position.voting_power(voting_mint_config, curr_ts)?;
  let vetokens_info = calculate_vetoken_info(
    ctx.accounts.enrolled_position.start_ts,
    position,
    voting_mint_config,
  )?;
  ctx.accounts.enrolled_position.is_rewards_enrolled = false;

  let VetokenInfo {
    pre_genesis_end_fall_rate,
    post_genesis_end_fall_rate,
    genesis_end_fall_rate_correction,
    genesis_end_vetoken_correction: genesis_end_vetokens_correction,
    end_fall_rate_correction,
    end_vetoken_correction: end_vetokens_correction,
    ..
  } = vetokens_info;

  msg!("Vehnt calculations: {:?}", vetokens_info);

  // don't allow unstake without claiming available rewards
  // make sure to account for when the position ends
  // unless we're testing, in which case we don't care
  let curr_epoch = current_epoch(curr_ts);
  let to_claim_to_epoch =
    if position.lockup.end_ts < curr_ts && position.lockup.kind == LockupKind::Cliff {
      current_epoch(position.lockup.end_ts) - 1
    } else {
      curr_epoch - 1
    };
  assert!((ctx.accounts.enrolled_position.last_claimed_epoch >= to_claim_to_epoch) || TESTING);

  let enrolled_position = &mut ctx.accounts.enrolled_position;
  let vetoken_tracker = &mut ctx.accounts.vetoken_tracker;

  ctx.accounts.vsr_epoch_info.epoch = current_epoch(curr_ts);
  vetoken_tracker.update_vetokens(&mut ctx.accounts.vsr_epoch_info, curr_ts)?;

  // Update the ending epochs with this new info
  if ctx.accounts.closing_time_vsr_epoch_info.epoch > curr_epoch {
    ctx
      .accounts
      .closing_time_vsr_epoch_info
      .fall_rates_from_closing_positions = ctx
      .accounts
      .closing_time_vsr_epoch_info
      .fall_rates_from_closing_positions
      .checked_sub(end_fall_rate_correction)
      .unwrap();

    ctx
      .accounts
      .closing_time_vsr_epoch_info
      .vetokens_in_closing_positions = ctx
      .accounts
      .closing_time_vsr_epoch_info
      .vetokens_in_closing_positions
      .saturating_sub(end_vetokens_correction);
  }

  // Closing time and genesis end can be the same account
  let mut parsed: Account<VsrEpochInfoV0>;
  let end_and_genesis_same =
    ctx.accounts.genesis_end_vsr_epoch_info.key() == ctx.accounts.closing_time_vsr_epoch_info.key();
  let genesis_end_vsr_epoch_info: &mut Account<VsrEpochInfoV0> = if end_and_genesis_same {
    &mut ctx.accounts.closing_time_vsr_epoch_info
  } else {
    parsed = Account::try_from(&ctx.accounts.genesis_end_vsr_epoch_info.to_account_info())?;
    &mut parsed
  };

  // Once start ts passes, everything gets purged. We only
  // need this correction when the epoch has not passed
  if position.genesis_end > curr_ts && ctx.accounts.genesis_end_vsr_epoch_info.start_ts() > curr_ts
  {
    genesis_end_vsr_epoch_info.fall_rates_from_closing_positions = genesis_end_vsr_epoch_info
      .fall_rates_from_closing_positions
      .checked_sub(genesis_end_fall_rate_correction)
      .unwrap();

    genesis_end_vsr_epoch_info.vetokens_in_closing_positions = genesis_end_vsr_epoch_info
      .vetokens_in_closing_positions
      .saturating_sub(genesis_end_vetokens_correction);

    genesis_end_vsr_epoch_info.exit(&id())?;
    ctx.accounts.genesis_end_vsr_epoch_info.reload()?;
  }

  // Only subtract from the stake if the position ends after the end of this epoch. Otherwise,
  // the position was already purged due to the vsr_epoch_info closing info logic.
  if position.lockup.end_ts >= ctx.accounts.vsr_epoch_info.end_ts()
    || position.lockup.kind == LockupKind::Constant
  {
    msg!(
      "Current vetokens {}, removing {} from the subdao",
      vetoken_tracker.total_vetokens,
      vetokens_at_curr_ts
    );
    // remove this stake information from the subdao
    vetoken_tracker.total_vetokens = vetoken_tracker
      .total_vetokens
      .saturating_sub(vetokens_at_curr_ts);

    vetoken_tracker.vetoken_fall_rate = vetoken_tracker
      .vetoken_fall_rate
      .checked_sub(if curr_ts >= position.genesis_end {
        post_genesis_end_fall_rate
      } else {
        pre_genesis_end_fall_rate
      })
      .unwrap();
  }
  // If the position was staked before this epoch, remove it.
  if current_epoch(enrolled_position.start_ts) < curr_epoch {
    let vetokens_at_start =
      position.voting_power(voting_mint_config, ctx.accounts.vsr_epoch_info.start_ts())?;
    msg!(
      "Removing {} vetokens from this epoch for this subdao, which currently has {} vetokens",
      vetokens_at_start,
      ctx.accounts.vsr_epoch_info.vetokens_at_epoch_start
    );
    ctx.accounts.vsr_epoch_info.vetokens_at_epoch_start = ctx
      .accounts
      .vsr_epoch_info
      .vetokens_at_epoch_start
      .saturating_sub(vetokens_at_start);
  }

  ctx.accounts.vsr_epoch_info.vetoken_tracker = ctx.accounts.vetoken_tracker.key();
  ctx.accounts.vsr_epoch_info.bump_seed = *ctx.bumps.get("vsr_epoch_info").unwrap();
  ctx.accounts.vsr_epoch_info.initialized = true;

  // EDGE CASE: When the closing time epoch infos are the same as the current epoch info,
  // update_subdao_vetokens will have already removed the fall rates and vetokens from the sub dao.
  // Unfortunately, these changes aren't persisted across the various clones of the account, only
  // on the main vsr_epoch_info. When the accounts are exited after this call, they will save
  // with non-zero fall rates and vetokens in closing positions, causing a double-count.
  // Example txs here:
  // https://explorer.solana.com/tx/2Mcj4y7K5rE5ioFLKGBynNyX6S56NkfhQscdB3tB9M7wBsWFxWFg6R7vLGRnohsCyLt1U2ba166GUwd9DhU9Af9H
  // https://explorer.solana.com/tx/T1TLfyfZyE6iJE9BhjMXkMVRtEUsS1jP3Q9AbNKvvtDpe5HxmVmqp9yT4H7HjdLKt6Q553Vrc7JcQCJeqpqZkK3
  if ctx.accounts.closing_time_vsr_epoch_info.key() == ctx.accounts.vsr_epoch_info.key() {
    ctx
      .accounts
      .closing_time_vsr_epoch_info
      .vetokens_in_closing_positions = 0;
    ctx
      .accounts
      .closing_time_vsr_epoch_info
      .fall_rates_from_closing_positions = 0;
  }

  if ctx.accounts.genesis_end_vsr_epoch_info.key() == ctx.accounts.vsr_epoch_info.key() {
    ctx
      .accounts
      .genesis_end_vsr_epoch_info
      .vetokens_in_closing_positions = 0;
    ctx
      .accounts
      .genesis_end_vsr_epoch_info
      .fall_rates_from_closing_positions = 0;
  }

  // If the lockup is expired or no tokens staked, close the enrollment.
  if ctx.accounts.position.lockup.expired(curr_ts)
    || ctx.accounts.position.amount_deposited_native == 0
  {
    ctx
      .accounts
      .enrolled_position
      .close(ctx.accounts.position_authority.to_account_info())?;
  }
  Ok(())
}
