use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::TokenAccount;
use anchor_spl::token::{Mint, Token};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeLazyDistributorArgsV0 {
  pub oracles: Vec<OracleConfigV0>,
  pub authority: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitializeLazyDistributorArgsV0)]
pub struct InitializeLazyDistributorV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = 60 + std::mem::size_of::<LazyDistributorV0>() + std::mem::size_of_val(&*args.oracles),
    seeds = ["lazy_distributor".as_bytes(), rewards_mint.key().as_ref()],
    bump,
  )]
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(mut)]
  pub rewards_mint: Box<Account<'info, Mint>>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = rewards_mint,
    associated_token::authority = lazy_distributor
  )]
  pub rewards_escrow: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
  ctx: Context<InitializeLazyDistributorV0>,
  args: InitializeLazyDistributorArgsV0,
) -> Result<()> {
  ctx.accounts.lazy_distributor.set_inner(LazyDistributorV0 {
    rewards_mint: ctx.accounts.rewards_mint.key(),
    rewards_escrow: ctx.accounts.rewards_escrow.key(),
    oracles: args.oracles,
    version: 0,
    authority: args.authority,
    bump_seed: ctx.bumps["lazy_distributor"],
  });

  Ok(())
}
