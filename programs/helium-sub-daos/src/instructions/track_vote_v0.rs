use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use proposal::ProposalV0;
use voter_stake_registry::{
  state::{PositionV0, Registrar, VoteMarkerV0},
  VoterStakeRegistry,
};

use crate::{
  error::ErrorCode,
  state::{DaoEpochInfoV0, DaoV0, DelegatedPositionV0},
};

#[derive(Accounts)]
pub struct TrackVoteV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    constraint = proposal.namespace == dao.proposal_namespace
  )]
  pub proposal: Account<'info, ProposalV0>,
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    mut,
    has_one = mint,
    has_one = registrar,
    constraint = position.registrar == dao.registrar
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub mint: Box<Account<'info, Mint>>,
  /// CHECK: Checked by seeds
  #[account(
    seeds = [b"marker", mint.key().as_ref(), proposal.key().as_ref()],
    bump,
    seeds::program = vsr_program
  )]
  pub marker: UncheckedAccount<'info>,
  #[account(mut)]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(mut,
    has_one = dao,
    seeds = ["enrolled_position".as_bytes(), position.key().as_ref()],
    bump = enrolled_position.bump_seed,
  )]
  pub enrolled_position: Box<Account<'info, DelegatedPositionV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 60 + DaoEpochInfoV0::INIT_SPACE,
    seeds = ["vsr_epoch_info".as_bytes(), dao.key().as_ref(), &current_epoch(registrar.clock_unix_timestamp()).to_le_bytes()],
    bump,
  )]
  pub vsr_epoch_info: Account<'info, DaoEpochInfoV0>,
  pub vsr_program: Program<'info, VoterStakeRegistry>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<TrackVoteV0>) -> Result<()> {
  ctx.accounts.vsr_epoch_info.epoch = current_epoch(ctx.accounts.registrar.clock_unix_timestamp());
  ctx.accounts.vsr_epoch_info.dao = ctx.accounts.dao.key();
  ctx.accounts.vsr_epoch_info.registrar = ctx.accounts.registrar.key();
  ctx.accounts.vsr_epoch_info.bump_seed = *ctx.bumps.get("vsr_epoch_info").unwrap();

  ctx.accounts.dao.add_recent_proposal(
    ctx.accounts.proposal.key(),
    ctx.accounts.proposal.created_at,
  );
  ctx.accounts.vsr_epoch_info.recent_proposals = ctx.accounts.dao.recent_proposals.clone();
  ctx.accounts.dao.update_vetokens(
    &mut ctx.accounts.vsr_epoch_info,
    ctx.accounts.registrar.clock_unix_timestamp(),
  )?;
  let data = ctx.accounts.marker.data.try_borrow().unwrap();
  let has_data = !data.is_empty();
  drop(data);
  let mut voted = has_data;
  if has_data {
    let marker: Account<VoteMarkerV0> = Account::try_from(&ctx.accounts.marker.to_account_info())?;
    require_eq!(
      marker.registrar,
      ctx.accounts.position.registrar,
      ErrorCode::InvalidMarker
    );
    voted = !marker.choices.is_empty();
  }
  if voted {
    ctx.accounts.enrolled_position.add_recent_proposal(
      ctx.accounts.proposal.key(),
      ctx.accounts.proposal.created_at,
    );
    msg!(
      "Proposals are now {:?}",
      ctx.accounts.enrolled_position.recent_proposals
    );
  } else {
    ctx
      .accounts
      .enrolled_position
      .remove_recent_proposal(ctx.accounts.proposal.key());
  }
  Ok(())
}
