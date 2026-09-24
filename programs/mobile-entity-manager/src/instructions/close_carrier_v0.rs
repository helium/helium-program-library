use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};
use helium_sub_daos::SubDaoV0;

use crate::{carrier_seeds, error::ErrorCode, state::*};

/// Retires a carrier and returns its stake.
///
/// The carrier must already be revoked. Revoking takes the same signer, so this is a guard against
/// a mis-signed close rather than a second party's consent.
///
/// Retiring is final, and the name can never be registered again: `initialize_carrier_v0` takes
/// `collection` as `init` on a PDA of the carrier, and an SPL mint cannot be closed, so that mint
/// outlives the carrier and the `init` fails. The subscriber tree, its `TreeConfig`, that
/// collection and its metadata are all left standing with nothing able to sign for them.
///
/// Close every `IncentiveEscrowProgramV0` under this carrier first. Those accounts are reached
/// through the `CarrierV0`, so once it is gone they can never be closed. Nothing here enforces
/// that order: `CarrierV0` holds no count of them.
#[derive(Accounts)]
pub struct CloseCarrierV0<'info> {
  #[account(has_one = authority)]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub authority: Signer<'info>,
  /// CHECK: Receives the rent of every account this closes. Unconstrained, so the rent -- unlike
  /// the stake below -- goes wherever the sub-DAO names.
  #[account(mut)]
  pub rent_refund: SystemAccount<'info>,
  #[account(
    mut,
    close = rent_refund,
    has_one = sub_dao,
    has_one = escrow,
    constraint = !carrier.approved @ ErrorCode::CarrierApproved,
  )]
  pub carrier: Box<Account<'info, CarrierV0>>,
  #[account(mut)]
  pub escrow: Box<Account<'info, TokenAccount>>,
  /// The stake returns to the carrier's own authority. The sub-DAO decides that a carrier is
  /// retired; it does not decide where the stake goes, so retiring a carrier cannot take its
  /// stake somewhere the carrier does not control.
  #[account(
    mut,
    token::mint = escrow.mint,
    token::authority = carrier.update_authority,
  )]
  pub destination: Box<Account<'info, TokenAccount>>,
  pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CloseCarrierV0>) -> Result<()> {
  let amount = ctx.accounts.escrow.amount;
  let seeds = carrier_seeds!(ctx.accounts.carrier);

  token::transfer(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      Transfer {
        from: ctx.accounts.escrow.to_account_info(),
        to: ctx.accounts.destination.to_account_info(),
        authority: ctx.accounts.carrier.to_account_info(),
      },
      &[seeds],
    ),
    amount,
  )?;

  token::close_account(CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    CloseAccount {
      account: ctx.accounts.escrow.to_account_info(),
      destination: ctx.accounts.rent_refund.to_account_info(),
      authority: ctx.accounts.carrier.to_account_info(),
    },
    &[seeds],
  ))?;

  Ok(())
}
