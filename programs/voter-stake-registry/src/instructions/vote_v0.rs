use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use modular_governance::proposal::accounts::{ProposalConfigV0, ProposalV0};
use shared_utils::resize_to_fit_pda;

use crate::{error::VsrError, registrar_seeds, state::*};

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
    space = 8 + 32 + std::mem::size_of::<VoteMarkerV0>() + 1 + 2 * proposal.choices.len(),
    seeds = [b"marker", mint.key().as_ref(), proposal.key().as_ref()],
    bump
  )]
  pub marker: Box<Account<'info, VoteMarkerV0>>,
  #[account(mut)]
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

pub fn handler(ctx: Context<VoteV0>, args: VoteArgsV0) -> Result<()> {
  let marker = &mut ctx.accounts.marker;
  if marker.rent_refund == Pubkey::default() {
    marker.rent_refund = ctx.accounts.payer.key();
  }
  marker.proposal = ctx.accounts.proposal.key();
  marker.bump_seed = ctx.bumps.marker;
  marker.voter = ctx.accounts.voter.key();
  marker.mint = ctx.accounts.mint.key();
  marker.registrar = ctx.accounts.registrar.key();
  marker.proxy_index = 0;

  // Don't allow voting for the same choice twice.
  require!(
    marker.choices.iter().all(|choice| *choice != args.choice),
    VsrError::NftAlreadyVoted
  );
  require_gt!(
    ctx.accounts.proposal.max_choices_per_voter,
    marker.choices.len() as u16,
    VsrError::MaxChoicesExceeded
  );

  marker.choices.push(args.choice);

  ctx.accounts.position.num_active_votes += 1;

  let voting_mint_config =
    &ctx.accounts.registrar.voting_mints[usize::from(ctx.accounts.position.voting_mint_config_idx)];

  // Use the original voting weight for this nft until all votes removed
  // This prevents inconsistensies with decaying positions
  let weight = if marker.weight > 0 {
    marker.weight
  } else {
    ctx.accounts.position.voting_power(
      voting_mint_config,
      ctx.accounts.registrar.clock_unix_timestamp(),
    )?
  };
  marker.weight = weight;

  modular_governance::proposal::cpi::vote_v0(
    CpiContext::new_with_signer(
      ctx.accounts.proposal_program.to_account_info(),
      modular_governance::proposal::cpi::accounts::VoteV0 {
        voter: ctx.accounts.voter.to_account_info(),
        vote_controller: ctx.accounts.registrar.to_account_info(),
        state_controller: ctx.accounts.state_controller.to_account_info(),
        proposal_config: ctx.accounts.proposal_config.to_account_info(),
        proposal: ctx.accounts.proposal.to_account_info(),
        on_vote_hook: ctx.accounts.on_vote_hook.to_account_info(),
      },
      &[registrar_seeds!(ctx.accounts.registrar)],
    ),
    modular_governance::proposal::types::VoteArgsV0 {
      remove_vote: false,
      choice: args.choice,
      weight,
    },
  )?;

  ctx.accounts.position.add_recent_proposal(
    ctx.accounts.proposal.key(),
    ctx.accounts.proposal.created_at,
  );
  ctx.accounts.position.registrar_paid_rent = u64::try_from(
    i64::try_from(ctx.accounts.position.registrar_paid_rent).unwrap()
      + resize_to_fit_pda(
        &ctx.accounts.registrar.to_account_info(),
        &ctx.accounts.position,
      )?,
  )
  .unwrap();
  msg!(
    "Proposals are now {:?}",
    ctx.accounts.position.recent_proposals
  );

  Ok(())
}
