use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use data_credits::{
  cpi::{
    accounts::{BurnCommonV0, BurnWithoutTrackingV0},
    burn_without_tracking_v0,
  },
  program::DataCredits,
  BurnWithoutTrackingArgsV0, DataCreditsV0,
};

use crate::{DevaddrConstraintV0, IotRoutingManagerV0, NetIdV0, OrganizationV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeDevaddrConstraintArgsV0 {
  pub num_blocks: u32,
}

#[derive(Accounts)]
#[instruction(args: InitializeDevaddrConstraintArgsV0)]
pub struct InitializeDevaddrConstraintV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub authority: Signer<'info>,
  #[account(mut)]
  pub net_id: Box<Account<'info, NetIdV0>>,
  #[account(
    has_one = dc_mint,
  )]
  pub routing_manager: Box<Account<'info, IotRoutingManagerV0>>,
  #[account(
    has_one = net_id,
    has_one = routing_manager,
    has_one = authority,
    constraint = organization.approved @ ErrorCode::OrganizationNotApproved,
  )]
  pub organization: Box<Account<'info, OrganizationV0>>,
  #[account(
    seeds=[
      "dc".as_bytes(),
      dc_mint.key().as_ref(),
    ],
    seeds::program = data_credits_program.key(),
    bump = data_credits.data_credits_bump,
    has_one = dc_mint
  )]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    associated_token::mint = dc_mint,
    associated_token::authority = payer,
  )]
  pub payer_dc_account: Box<Account<'info, TokenAccount>>,
  #[account(
    init,
    payer = payer,
    seeds = ["devaddr_constraint".as_bytes(), organization.key().as_ref(), &net_id.current_addr_offset.to_le_bytes()[..]],
    bump,
    space = 8 + DevaddrConstraintV0::INIT_SPACE + 60
  )]
  pub devaddr_constraint: Box<Account<'info, DevaddrConstraintV0>>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub data_credits_program: Program<'info, DataCredits>,
}

pub fn handler(
  ctx: Context<InitializeDevaddrConstraintV0>,
  args: InitializeDevaddrConstraintArgsV0,
) -> Result<()> {
  let start_addr = ctx.accounts.net_id.current_addr_offset;
  let end_addr = start_addr + (args.num_blocks * 8) as u64;

  // Increment end_addr by 1
  // Since start_addr and end_addr of multiple devaddrs cant overlap
  if end_addr > ctx.accounts.net_id.current_addr_offset {
    ctx.accounts.net_id.current_addr_offset = end_addr + 1;
  }

  let dc_fee: u64 = ctx
    .accounts
    .routing_manager
    .devaddr_fee_usd
    .checked_mul(100_000)
    .and_then(|result| result.checked_div(1_000_000))
    .ok_or(ErrorCode::ArithmeticError)?;

  burn_without_tracking_v0(
    CpiContext::new(
      ctx.accounts.data_credits_program.to_account_info(),
      BurnWithoutTrackingV0 {
        burn_accounts: BurnCommonV0 {
          data_credits: ctx.accounts.data_credits.to_account_info(),
          owner: ctx.accounts.payer.to_account_info(),
          dc_mint: ctx.accounts.dc_mint.to_account_info(),
          burner: ctx.accounts.payer_dc_account.to_account_info(),
          associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
          token_program: ctx.accounts.token_program.to_account_info(),
          system_program: ctx.accounts.system_program.to_account_info(),
        },
      },
    ),
    BurnWithoutTrackingArgsV0 { amount: dc_fee },
  )?;

  ctx
    .accounts
    .devaddr_constraint
    .set_inner(DevaddrConstraintV0 {
      routing_manager: ctx.accounts.net_id.routing_manager,
      net_id: ctx.accounts.net_id.key(),
      organization: ctx.accounts.organization.key(),
      start_addr,
      end_addr,
      bump_seed: ctx.bumps.devaddr_constraint,
    });
  Ok(())
}
