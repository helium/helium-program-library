use crate::state::*;
use crate::utils::resize_to_fit;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

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
    space = std::cmp::max(8 + std::mem::size_of::<LazyDistributorV0>(), lazy_distributor.data.borrow_mut().len()),
    seeds = ["lazy-distributor".as_bytes(), args.collection.as_ref(), rewards_mint.key().as_ref()],
    bump,
  )]
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  pub rewards_mint: Box<Account<'info, Mint>>,
  #[account(
    init,
    payer = payer,
    seeds = ["lazy-distributor-rewards".as_bytes(), lazy_distributor.key().as_ref()],
    bump,
    token::mint = rewards_mint,
    token::authority = lazy_distributor,
  )]
  pub rewards_account: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
  ctx: Context<InitializeLazyDistributorV0>,
  args: InitializeLazyDistributorV0Args,
) -> Result<()> {
  ctx.accounts.lazy_distributor.set_inner(LazyDistributorV0 {
    rewards_account: ctx.accounts.rewards_account.key(),
    rewards_mint: ctx.accounts.rewards_mint.key(),
    oracles: args.oracles,
    collection: args.collection,
    version: 0,
    authority: args.authority,
    bump_seed: ctx.bumps["lazy_distributor"],
  });

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.lazy_distributor,
  )?;

  Ok(())
}
