use anchor_lang::prelude::*;
use nft_proxy::ProxyAssignmentV0;
use proposal::{ProposalConfigV0, ProposalV0};

use crate::{error::VsrError, registrar_seeds, state::*};

#[derive(Accounts)]
pub struct CountProxyVoteV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 8 + 32 + std::mem::size_of::<VoteMarkerV0>() + 1 + 2 * proposal.choices.len(),
    seeds = [b"marker", position.mint.key().as_ref(), proposal.key().as_ref()],
    bump
  )]
  pub marker: Box<Account<'info, VoteMarkerV0>>,
  #[account(mut)]
  pub registrar: Box<Account<'info, Registrar>>,
  /// CHECK: Checked via the has_one on proxy_marker
  pub voter: AccountInfo<'info>,
  #[account(
    seeds = ["proxy_marker".as_bytes(), voter.key().as_ref(), proposal.key().as_ref()],
    bump = proxy_marker.bump_seed,
    has_one = voter,
    has_one = proposal,
  )]
  pub proxy_marker: Account<'info, ProxyMarkerV0>,
  #[account(
    mut,
    has_one = registrar
  )]
  pub position: Box<Account<'info, PositionV0>>,
  #[account(
    has_one = voter,
    constraint = proxy_assignment.proxy_config == registrar.proxy_config,
    constraint = proxy_assignment.expiration_time > Clock::get().unwrap().unix_timestamp,
    // only the current or earlier proxies can change vote. Or if proposal not set, this was an `init` for the marker
    constraint = proxy_assignment.index <= marker.proxy_index || marker.proposal == Pubkey::default(),
    // Ensure this is actually for the position
    constraint = proxy_assignment.asset == position.mint,
  )]
  pub proxy_assignment: Box<Account<'info, ProxyAssignmentV0>>,
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

pub fn handler(ctx: Context<CountProxyVoteV0>) -> Result<()> {
  let marker = &mut ctx.accounts.marker;

  marker.proposal = ctx.accounts.proposal.key();
  marker.bump_seed = ctx.bumps["marker"];
  marker.voter = ctx.accounts.voter.key();
  marker.mint = ctx.accounts.position.mint;
  marker.registrar = ctx.accounts.registrar.key();
  marker.proxy_index = ctx.accounts.proxy_assignment.index;

  // Find choices to add and remove
  let choices_to_add = ctx
    .accounts
    .proxy_marker
    .choices
    .iter()
    .filter(|&choice| !marker.choices.contains(choice))
    .copied()
    .collect::<Vec<_>>();

  let choices_to_remove = marker
    .choices
    .iter()
    .filter(|&choice| !ctx.accounts.proxy_marker.choices.contains(choice))
    .copied()
    .collect::<Vec<_>>();

  if choices_to_add.is_empty() && choices_to_remove.is_empty() {
    return Err(error!(VsrError::NoChangesToCount));
  }

  // Calculate voting weight
  let voting_mint_config =
    &ctx.accounts.registrar.voting_mints[usize::from(ctx.accounts.position.voting_mint_config_idx)];

  let weight = if marker.weight > 0 {
    marker.weight
  } else {
    ctx.accounts.position.voting_power(
      voting_mint_config,
      ctx.accounts.registrar.clock_unix_timestamp(),
    )?
  };
  marker.weight = weight;
  marker.choices = ctx.accounts.proxy_marker.choices.clone();

  ctx.accounts.position.num_active_votes += choices_to_add.len() as u16;
  ctx.accounts.position.num_active_votes -= choices_to_remove.len() as u16;

  // Remove old votes
  for choice in choices_to_remove {
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
        choice,
        weight,
      },
    )?;
  }

  // Add new votes
  for choice in choices_to_add {
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
        remove_vote: false,
        choice,
        weight,
      },
    )?;
  }

  // Marker has not been allocated yet, need to handle rent payment
  if marker.rent_refund == Pubkey::default() {
    let rent = Rent::get()?;
    let reg_info = ctx.accounts.registrar.to_account_info();
    let min_rent = rent.minimum_balance(reg_info.data_len());
    let registrar_sol: u64 = reg_info.lamports();
    let marker_rent = rent.minimum_balance(marker.to_account_info().data_len());
    if registrar_sol > min_rent + marker_rent {
      **reg_info.lamports.borrow_mut() -= marker_rent;
      **ctx.accounts.payer.to_account_info().lamports.borrow_mut() += marker_rent;
      marker.rent_refund = ctx.accounts.registrar.key()
    } else {
      marker.rent_refund = ctx.accounts.payer.key();
    }
  }

  Ok(())
}
