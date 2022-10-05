use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeLazyDistributorV0Args {
  pub collection: Pubkey,
  pub oracles: Vec<OracleConfigV0>,
  pub authority: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitializeLazyDistributorV0Args)]
pub struct InitializeLazyDistributorV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = 60 + std::mem::size_of::<LazyDistributorV0>() + std::mem::size_of_val(&*args.oracles),
    seeds = ["lazy_distributor".as_bytes(), args.collection.as_ref(), rewards_mint.key().as_ref()],
    bump,
  )]
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    constraint = rewards_mint.mint_authority.unwrap() == lazy_distributor.key()
  )]
  pub rewards_mint: Box<Account<'info, Mint>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
  ctx: Context<InitializeLazyDistributorV0>,
  args: InitializeLazyDistributorV0Args,
) -> Result<()> {
  ctx.accounts.lazy_distributor.set_inner(LazyDistributorV0 {
    rewards_mint: ctx.accounts.rewards_mint.key(),
    oracles: args.oracles,
    collection: args.collection,
    version: 0,
    authority: args.authority,
    bump_seed: ctx.bumps["lazy_distributor"],
  });

  Ok(())
}
