use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use proposal::{ProposalConfigV0, ProposalV0};

use crate::{state::*, token_voter_seeds};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct VoteArgsV0 {
  pub choice: u16,
}

#[derive(Accounts)]
pub struct VoteV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<TokenVoterV0>(),
    seeds = [b"marker", token_voter.key().as_ref(), mint.key().as_ref(), proposal.key().as_ref()],
    bump
  )]
  pub marker: Account<'info, VoteMarkerV0>,
  pub token_voter: Account<'info, TokenVoterV0>,
  pub voter: Signer<'info>,
  #[account(
    mut,
    has_one = mint,
    has_one = token_voter
  )]
  pub receipt: Box<Account<'info, ReceiptV0>>,
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

pub fn handler(ctx: Context<VoteV0>, args: VoteArgsV0) -> Result<()> {
  let marker = &mut ctx.accounts.marker;
  marker.proposal = ctx.accounts.proposal.key();
  marker.bump_seed = ctx.bumps["marker"];
  marker.voter = ctx.accounts.voter.key();
  marker.mint = ctx.accounts.mint.key();
  marker.token_voter = ctx.accounts.token_voter.key();

  // Don't allow voting for the same choice twice.
  require!(
    marker.choices.iter().all(|choice| *choice != args.choice),
    ErrorCode::AlreadyVoted
  );
  require_gt!(
    ctx.accounts.proposal.max_choices_per_voter,
    marker.choices.len() as u16,
    ErrorCode::MaxChoicesExceeded
  );

  marker.choices.push(args.choice);

  ctx.accounts.receipt.num_active_votes += 1;

  proposal::cpi::vote_v0(
    CpiContext::new_with_signer(
      ctx.accounts.proposal_program.to_account_info(),
      proposal::cpi::accounts::VoteV0 {
        vote_controller: ctx.accounts.token_voter.to_account_info(),
        state_controller: ctx.accounts.state_controller.to_account_info(),
        proposal_config: ctx.accounts.proposal_config.to_account_info(),
        proposal: ctx.accounts.proposal.to_account_info(),
        on_vote_hook: ctx.accounts.on_vote_hook.to_account_info(),
      },
      &[token_voter_seeds!(ctx.accounts.token_voter)],
    ),
    proposal::VoteArgsV0 {
      remove_vote: false,
      choice: args.choice,
      weight: u128::from(ctx.accounts.receipt.amount),
    },
  )?;

  Ok(())
}
