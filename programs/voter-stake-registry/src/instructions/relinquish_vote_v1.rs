use crate::error::VsrError;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use proposal::{ProposalConfigV0, ProposalV0};

use crate::{registrar_seeds, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct RelinquishVoteArgsV1 {
  pub choice: u16,
}

#[derive(Accounts)]
pub struct RelinquishVoteV1<'info> {
  /// CHECK: You're getting sol why do you care?
  /// Account to receive sol refund if marker is closed
  #[account(mut)]
  pub refund: AccountInfo<'info>,
  #[account(
    mut,
    seeds = [b"marker", mint.key().as_ref(), proposal.key().as_ref()],
    bump = marker.bump_seed,
    has_one = registrar,
    has_one = mint
  )]
  pub marker: Box<Account<'info, VoteMarkerV0>>,
  pub registrar: Box<Account<'info, Registrar>>,
  pub voter: Signer<'info>,
  #[account(
    mut,
    has_one = mint,
    has_one = registrar
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    associated_token::authority = voter,
    associated_token::mint = mint,
    constraint = token_account.amount == 1,
  )]
  pub token_account: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    has_one = proposal_config,
    owner = proposal_program.key(),
  )]
  pub proposal: Account<'info, ProposalV0>,
  #[account(
    has_one = on_vote_hook,
    has_one = state_controller,
    owner = proposal_program.key()
  )]
  pub proposal_config: Account<'info, ProposalConfigV0>,
  /// CHECK: Checked via cpi
  #[account(mut)]
  pub state_controller: AccountInfo<'info>,
  /// CHECK: Checked via has_one
  pub on_vote_hook: AccountInfo<'info>,
  /// CHECK: Checked via constraint
  #[account(
    constraint = *proposal.to_account_info().owner == proposal_program.key()
  )]
  pub proposal_program: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RelinquishVoteV1>, args: RelinquishVoteArgsV1) -> Result<()> {
  let marker = &mut ctx.accounts.marker;
  marker.proposal = ctx.accounts.proposal.key();
  marker.voter = ctx.accounts.voter.key();
  ctx.accounts.position.num_active_votes -= 1;

  require!(
    marker.choices.iter().any(|choice| *choice == args.choice),
    VsrError::NoVoteForThisChoice
  );

  marker.choices = marker
    .choices
    .clone()
    .into_iter()
    .filter(|c| *c != args.choice)
    .collect::<Vec<_>>();

  proposal::cpi::vote_v0(
    CpiContext::new_with_signer(
      ctx.accounts.proposal_program.to_account_info(),
      proposal::cpi::accounts::VoteV0 {
        voter: ctx.accounts.voter.to_account_info(),
        vote_controller: ctx.accounts.registrar.to_account_info(),
        state_controller: ctx.accounts.state_controller.to_account_info(),
        proposal_config: ctx.accounts.proposal_config.to_account_info(),
        proposal: ctx.accounts.proposal.to_account_info(),
        on_vote_hook: ctx.accounts.on_vote_hook.to_account_info(),
      },
      &[registrar_seeds!(ctx.accounts.registrar)],
    ),
    proposal::VoteArgsV0 {
      remove_vote: true,
      choice: args.choice,
      weight: marker.weight,
    },
  )?;

  if marker.choices.is_empty() {
    marker.close(ctx.accounts.refund.to_account_info())?;
  }

  Ok(())
}
