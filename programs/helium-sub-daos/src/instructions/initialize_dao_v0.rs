use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount, Token};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeDaoArgsV0 {
  pub authority: Pubkey,
  pub reward_per_epoch: u64,
}

#[derive(Accounts)]
#[instruction(args: InitializeDaoArgsV0)]
pub struct InitializeDaoV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = 8 + std::mem::size_of::<DaoV0>() + 60,
    seeds = ["dao".as_bytes(), mint.key().as_ref()],
    bump,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    constraint = mint_authority.key() == mint.mint_authority.unwrap()
  )]
  pub mint: Box<Account<'info, Mint>>,
  pub mint_authority: Signer<'info>,
  #[account(
    init,
    payer = payer,
    seeds = ["dao_treasury".as_bytes(), dao.key().as_ref()],
    bump,
    token::mint = mint,
    token::authority = dao,
  )]
  pub treasury: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeDaoV0>, args: InitializeDaoArgsV0) -> Result<()> {
  ctx.accounts.dao.set_inner(DaoV0 {
    mint: ctx.accounts.mint.key(),
    treasury: ctx.accounts.treasury.key(),
    authority: args.authority,
    num_sub_daos: 0,
    reward_per_epoch: args.reward_per_epoch,
    bump_seed: ctx.bumps["dao"],
    treasury_bump_seed: ctx.bumps["treasury"]
  });

  Ok(())
}
