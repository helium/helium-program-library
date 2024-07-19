use anchor_lang::prelude::*;

use crate::{DevAddrConstraintV0, NetIdV0, OrganizationV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeDevaddrConstraintArgsV0 {
  pub num_blocks: u32,
  /// Override the default start address for the devaddr constraint.
  /// WARNING: This is dangerous and can create unvalidated overlap,
  /// this should not happen under Helium managed net ids
  pub start_addr: Option<u64>,
}

#[derive(Accounts)]
#[instruction(args: InitializeDevaddrConstraintArgsV0)]
pub struct InitializeDevaddrConstraintV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub authority: Signer<'info>,
  #[account(
    has_one = authority,
  )]
  pub net_id: Box<Account<'info, NetIdV0>>,
  #[account(
    has_one = net_id
  )]
  pub organization: Box<Account<'info, OrganizationV0>>,
  #[account(
    init,
    payer = payer,
    seeds = [b"devaddr_constraint", organization.key().as_ref(), &args.start_addr.unwrap_or(net_id.current_addr_offset).to_le_bytes()[..]],
    bump,
    space = 8 + DevAddrConstraintV0::INIT_SPACE + 60
  )]
  pub devaddr_constraint: Box<Account<'info, DevAddrConstraintV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<InitializeDevaddrConstraintV0>,
  args: InitializeDevaddrConstraintArgsV0,
) -> Result<()> {
  let start_addr = args
    .start_addr
    .unwrap_or(ctx.accounts.net_id.current_addr_offset);
  let end_addr = start_addr + (args.num_blocks * 8) as u64;
  if end_addr > ctx.accounts.net_id.current_addr_offset {
    ctx.accounts.net_id.current_addr_offset = end_addr;
  }
  ctx
    .accounts
    .devaddr_constraint
    .set_inner(DevAddrConstraintV0 {
      routing_manager: ctx.accounts.net_id.routing_manager,
      net_id: ctx.accounts.net_id.key(),
      organization: ctx.accounts.organization.key(),
      start_addr: start_addr,
      end_addr,
      bump_seed: ctx.bumps["devaddr_constraint"],
    });
  Ok(())
}
