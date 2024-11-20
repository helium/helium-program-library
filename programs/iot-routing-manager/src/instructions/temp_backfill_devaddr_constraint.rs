use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};
use std::str::FromStr;

use crate::{DevaddrConstraintV0, IotRoutingManagerV0, NetIdV0, OrganizationV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TempBackfillDevaddrConstraintArgs {
  pub num_blocks: u32,
  pub start_addr: u64,
}

#[derive(Accounts)]
#[instruction(args: TempBackfillDevaddrConstraintArgs)]
pub struct TempBackfillDevaddrConstraint<'info> {
  #[account(
    mut,
    address = Pubkey::from_str("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW").unwrap()
  )]
  pub payer: Signer<'info>,
  #[account(mut)]
  pub net_id: Box<Account<'info, NetIdV0>>,
  #[account(
    has_one = iot_mint,
  )]
  pub routing_manager: Box<Account<'info, IotRoutingManagerV0>>,
  #[account(
    has_one = net_id,
    has_one = routing_manager,
    constraint = organization.approved @ ErrorCode::OrganizationNotApproved,
  )]
  pub organization: Box<Account<'info, OrganizationV0>>,
  #[account(mut)]
  pub iot_mint: Box<Account<'info, Mint>>,
  #[account(
    init,
    payer = payer,
    seeds = [b"devaddr_constraint", organization.key().as_ref(), &args.start_addr.to_le_bytes()[..]],
    bump,
    space = 8 + DevaddrConstraintV0::INIT_SPACE + 60
  )]
  pub devaddr_constraint: Box<Account<'info, DevaddrConstraintV0>>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<TempBackfillDevaddrConstraint>,
  args: TempBackfillDevaddrConstraintArgs,
) -> Result<()> {
  let start_addr = args.start_addr;
  let end_addr = start_addr + (args.num_blocks * 8) as u64;

  // Increment end_addr by 1
  // Since start_addr and end_addr of multiple devaddrs cant overlap
  if end_addr > ctx.accounts.net_id.current_addr_offset {
    ctx.accounts.net_id.current_addr_offset = end_addr + 1;
  }

  ctx
    .accounts
    .devaddr_constraint
    .set_inner(DevaddrConstraintV0 {
      routing_manager: ctx.accounts.net_id.routing_manager,
      net_id: ctx.accounts.net_id.key(),
      organization: ctx.accounts.organization.key(),
      start_addr,
      end_addr,
      bump_seed: ctx.bumps["devaddr_constraint"],
    });
  Ok(())
}
