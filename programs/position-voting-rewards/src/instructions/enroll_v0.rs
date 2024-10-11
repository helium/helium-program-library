use std::array;

use anchor_lang::{prelude::*, Discriminator};
use anchor_spl::token::{Mint, TokenAccount};
use voter_stake_registry::{
  cpi::{accounts::FreezePositionV0, freeze_position_v0},
  state::{LockupKind, PositionV0, Registrar},
  VoterStakeRegistry,
};

use self::borsh::BorshSerialize;
use crate::{
  create_account::{create_and_serialize_account_signed, AccountMaxSize},
  error::ErrorCode,
  id,
  state::{EnrolledPositionV0, RecentProposal, VeTokenTrackerV0, VsrEpochInfoV0},
  util::{calculate_vetoken_info, current_epoch, VetokenInfo},
  vetoken_tracker_seeds,
};

#[derive(Accounts)]
pub struct EnrollV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    mut,
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    seeds::program = vsr_program.key(),
    bump = position.bump_seed,
    has_one = mint,
    has_one = registrar,
    constraint = position.lockup.kind == LockupKind::Constant || position.lockup.end_ts > registrar.clock_unix_timestamp()
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
  pub vetoken_tracker: Box<Account<'info, VeTokenTrackerV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 60 + VsrEpochInfoV0::INIT_SPACE,
    seeds = ["vsr_epoch_info".as_bytes(), vetoken_tracker.key().as_ref(), &current_epoch(registrar.clock_unix_timestamp()).to_le_bytes()],
    bump,
    constraint = vsr_epoch_info.key() != closing_time_vsr_epoch_info.key() @ ErrorCode::NoEnrollEndingPosition
  )]
  pub vsr_epoch_info: Box<Account<'info, VsrEpochInfoV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 60 + VsrEpochInfoV0::INIT_SPACE,
    seeds = ["vsr_epoch_info".as_bytes(), vetoken_tracker.key().as_ref(), &current_epoch(position.lockup.end_ts).to_le_bytes()],
    bump,
  )]
  pub closing_time_vsr_epoch_info: Box<Account<'info, VsrEpochInfoV0>>,
  #[account(
    mut,
    seeds = [
      "vsr_epoch_info".as_bytes(), 
      vetoken_tracker.key().as_ref(),
      &current_epoch(
        // Avoid passing an extra account if the end is 0 (no genesis on this position).
        // Pass instead closing time epoch info, txn account deduplication will reduce the overall tx size
        if position.genesis_end <= registrar.clock_unix_timestamp() {
          position.lockup.end_ts
        } else {
          position.genesis_end
        }
      ).to_le_bytes()
    ],
    bump,
  )]
  /// CHECK: Verified when needed in the inner instr
  pub genesis_end_vsr_epoch_info: UncheckedAccount<'info>,

  #[account(
    init,
    space = 60 + 8 + std::mem::size_of::<EnrolledPositionV0>(),
    payer = payer,
    seeds = ["enrolled_position".as_bytes(), position.key().as_ref()],
    bump,
  )]
  pub enrolled_position: Box<Account<'info, EnrolledPositionV0>>,

  pub vsr_program: Program<'info, VoterStakeRegistry>,
  pub system_program: Program<'info, System>,
}

pub struct VsrEpochInfoV0WithDescriminator {
  pub vsr_epoch_info: VsrEpochInfoV0,
}

impl BorshSerialize for VsrEpochInfoV0WithDescriminator {
  fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
    VsrEpochInfoV0::DISCRIMINATOR.serialize(writer)?;
    self.vsr_epoch_info.serialize(writer)
  }
}

impl AccountMaxSize for VsrEpochInfoV0WithDescriminator {
  fn get_max_size(&self) -> Option<usize> {
    Some(60 + VsrEpochInfoV0::INIT_SPACE)
  }
}

pub fn handler(ctx: Context<EnrollV0>) -> Result<()> {
  // load the vetokens information
  let position = &mut ctx.accounts.position;
  let registrar = &ctx.accounts.registrar;
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();

  let vetokens_info = calculate_vetoken_info(curr_ts, position, voting_mint_config)?;
  let VetokenInfo {
    has_genesis,
    vetokens_at_curr_ts,
    pre_genesis_end_fall_rate,
    post_genesis_end_fall_rate,
    genesis_end_fall_rate_correction,
    genesis_end_vetoken_correction,
    end_fall_rate_correction,
    end_vetoken_correction,
  } = vetokens_info;

  msg!("Vehnt calculations: {:?}", vetokens_info);

  let curr_epoch = current_epoch(curr_ts);

  let vetoken_tracker = &mut ctx.accounts.vetoken_tracker;
  let enrolled_position = &mut ctx.accounts.enrolled_position;

  // Update the veHnt at start of epoch
  ctx.accounts.vsr_epoch_info.epoch = current_epoch(curr_ts);
  vetoken_tracker.update_vetokens(&mut ctx.accounts.vsr_epoch_info, curr_ts)?;

  vetoken_tracker.total_vetokens = vetoken_tracker
    .total_vetokens
    .checked_add(vetokens_at_curr_ts)
    .unwrap();
  vetoken_tracker.vetoken_fall_rate = if has_genesis {
    vetoken_tracker
      .vetoken_fall_rate
      .checked_add(pre_genesis_end_fall_rate)
      .unwrap()
  } else {
    vetoken_tracker
      .vetoken_fall_rate
      .checked_add(post_genesis_end_fall_rate)
      .unwrap()
  };

  ctx
    .accounts
    .closing_time_vsr_epoch_info
    .fall_rates_from_closing_positions = ctx
    .accounts
    .closing_time_vsr_epoch_info
    .fall_rates_from_closing_positions
    .checked_add(end_fall_rate_correction)
    .unwrap();

  ctx
    .accounts
    .closing_time_vsr_epoch_info
    .vetokens_in_closing_positions = ctx
    .accounts
    .closing_time_vsr_epoch_info
    .vetokens_in_closing_positions
    .checked_add(end_vetoken_correction)
    .unwrap();
  ctx.accounts.closing_time_vsr_epoch_info.vetoken_tracker = vetoken_tracker.key();
  ctx.accounts.closing_time_vsr_epoch_info.epoch = current_epoch(position.lockup.end_ts);
  ctx.accounts.closing_time_vsr_epoch_info.bump_seed = ctx.bumps["closing_time_vsr_epoch_info"];

  let genesis_end_is_closing =
    ctx.accounts.genesis_end_vsr_epoch_info.key() == ctx.accounts.closing_time_vsr_epoch_info.key();
  if position.genesis_end > curr_ts
    && (genesis_end_fall_rate_correction > 0 || genesis_end_vetoken_correction > 0)
  {
    // If the end account doesn't exist, init it. Otherwise just set the correcitons
    if !genesis_end_is_closing && ctx.accounts.genesis_end_vsr_epoch_info.data_len() == 0 {
      msg!("Genesis end doesn't exist, initting");
      let genesis_end_epoch = current_epoch(position.genesis_end);
      // Anchor doesn't natively support dynamic account creation using remaining_accounts
      // and we have to take it on the manual drive
      create_and_serialize_account_signed(
        &ctx.accounts.payer.to_account_info(),
        &ctx.accounts.genesis_end_vsr_epoch_info.to_account_info(),
        &VsrEpochInfoV0WithDescriminator {
          vsr_epoch_info: VsrEpochInfoV0 {
            epoch: genesis_end_epoch,
            bump_seed: ctx.bumps["genesis_end_vsr_epoch_info"],
            vetoken_tracker: vetoken_tracker.key(),
            vetokens_at_epoch_start: 0,
            vetokens_in_closing_positions: genesis_end_vetoken_correction,
            fall_rates_from_closing_positions: genesis_end_fall_rate_correction,
            rewards_issued_at: None,
            initialized: false,
            registrar: ctx.accounts.registrar.key(),
            rewards_amount: 0,
            recent_proposals: array::from_fn(|_| RecentProposal::default()),
          },
        },
        &[
          "vsr_epoch_info".as_bytes(),
          vetoken_tracker.key().as_ref(),
          &genesis_end_epoch.to_le_bytes(),
        ],
        &id(),
        &ctx.accounts.system_program.to_account_info(),
        &Rent::get()?,
        0,
      )?;
    } else {
      // closing can be the same account as genesis end. Make sure to use the proper account
      let mut parsed: Account<VsrEpochInfoV0>;
      let genesis_end_vsr_epoch_info: &mut Account<VsrEpochInfoV0> = if genesis_end_is_closing {
        &mut ctx.accounts.closing_time_vsr_epoch_info
      } else {
        parsed = Account::try_from(&ctx.accounts.genesis_end_vsr_epoch_info.to_account_info())?;
        &mut parsed
      };

      // EDGE CASE: The genesis end could be this epoch. Do not override what was done with update_subdao_vetokens
      if genesis_end_vsr_epoch_info.key() == ctx.accounts.vsr_epoch_info.key() {
        genesis_end_vsr_epoch_info.fall_rates_from_closing_positions = ctx
          .accounts
          .vsr_epoch_info
          .fall_rates_from_closing_positions;
        genesis_end_vsr_epoch_info.vetokens_in_closing_positions =
          ctx.accounts.vsr_epoch_info.vetokens_in_closing_positions;
      } else {
        genesis_end_vsr_epoch_info.fall_rates_from_closing_positions = genesis_end_vsr_epoch_info
          .fall_rates_from_closing_positions
          .checked_add(genesis_end_fall_rate_correction)
          .unwrap();

        genesis_end_vsr_epoch_info.vetokens_in_closing_positions = genesis_end_vsr_epoch_info
          .vetokens_in_closing_positions
          .checked_add(genesis_end_vetoken_correction)
          .unwrap();
      }

      genesis_end_vsr_epoch_info.exit(&id())?;
    }
  }

  enrolled_position.start_ts = curr_ts;
  enrolled_position.last_claimed_epoch = curr_epoch;
  enrolled_position.vetoken_tracker = ctx.accounts.vetoken_tracker.key();
  enrolled_position.position = ctx.accounts.position.key();
  enrolled_position.bump_seed = ctx.bumps["enrolled_position"];

  ctx.accounts.vsr_epoch_info.vetoken_tracker = ctx.accounts.vetoken_tracker.key();
  ctx.accounts.vsr_epoch_info.bump_seed = *ctx.bumps.get("vsr_epoch_info").unwrap();

  freeze_position_v0(CpiContext::new_with_signer(
    ctx.accounts.vsr_program.to_account_info(),
    FreezePositionV0 {
      authority: ctx.accounts.vetoken_tracker.to_account_info(),
      registrar: ctx.accounts.registrar.to_account_info(),
      position: ctx.accounts.position.to_account_info(),
    },
    &[vetoken_tracker_seeds!(ctx.accounts.vetoken_tracker)],
  ))?;

  Ok(())
}
