use crate::utils::current_epoch;
use crate::{state::*, update_subdao_vehnt};
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use std::str::FromStr;
use voter_stake_registry::state::Registrar;

pub const DC_KEY: &str = "credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TrackDcBurnArgsV0 {
  pub dc_burned: u64,
  pub bump: u8,
}

#[derive(Accounts)]
#[instruction(args: TrackDcBurnArgsV0)]
pub struct TrackDcBurnV0<'info> {
  #[account(
    init_if_needed,
    payer = account_payer,
    space = 60 + 8 + std::mem::size_of::<SubDaoEpochInfoV0>(),
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &current_epoch(registrar.clock_unix_timestamp()).to_le_bytes()],
    bump,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    mut,
    has_one = dao
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    has_one = dc_mint,
    has_one = registrar,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  pub dc_mint: Box<Account<'info, Mint>>,

  #[account(
    mut,
    seeds = ["account_payer".as_bytes()],
    seeds::program = Pubkey::from_str(DC_KEY).unwrap(),
    bump = args.bump,
  )]
  pub account_payer: Signer<'info>, // can't be a HSD PDA because init_if_needed can't be used
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<TrackDcBurnV0>, args: TrackDcBurnArgsV0) -> Result<()> {
  let curr_ts = ctx.accounts.registrar.clock_unix_timestamp();
  ctx.accounts.sub_dao_epoch_info.epoch = current_epoch(curr_ts);
  if let Err(e) = update_subdao_vehnt(
    &mut ctx.accounts.sub_dao,
    &mut ctx.accounts.sub_dao_epoch_info,
    curr_ts,
  ) {
    // This shouldn't usually happen, but failure can occur
    // if subdao epoch info isn't updated linearly. Dc burns should still be tracked
    // in this scenario.
    msg!("Failed to update sub_dao vehnt: {:?}", e);
  };

  ctx.accounts.sub_dao_epoch_info.initialized = true;
  ctx.accounts.sub_dao_epoch_info.sub_dao = ctx.accounts.sub_dao.key();
  ctx.accounts.sub_dao_epoch_info.dc_burned += args.dc_burned;
  ctx.accounts.sub_dao_epoch_info.bump_seed = *ctx.bumps.get("sub_dao_epoch_info").unwrap();

  Ok(())
}
