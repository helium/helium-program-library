use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateLazyDistributorArgsV0 {
  pub oracles: Option<Vec<OracleConfigV0>>,
  pub authority: Option<Pubkey>,
  pub approver: Option<Option<Pubkey>>,
}

#[derive(Accounts)]
#[instruction(args: UpdateLazyDistributorArgsV0)]
pub struct UpdateLazyDistributorV0<'info> {
  #[account(
    mut,
    seeds = ["lazy_distributor".as_bytes(), rewards_mint.key().as_ref()],
    bump,
    has_one = authority,
    has_one = rewards_mint
  )]
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  pub rewards_mint: Box<Account<'info, Mint>>,
  pub authority: Signer<'info>,
}

pub fn handler(
  ctx: Context<UpdateLazyDistributorV0>,
  args: UpdateLazyDistributorArgsV0,
) -> Result<()> {
  let ld = &mut ctx.accounts.lazy_distributor;
  if let Some(oracles) = args.oracles {
    ld.oracles = oracles;
  }
  if let Some(authority) = args.authority {
    ld.authority = authority;
  }

  if let Some(approver) = args.approver {
    ld.approver = approver;
  }

  Ok(())
}
