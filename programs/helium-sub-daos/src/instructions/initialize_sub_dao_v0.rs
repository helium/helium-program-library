use crate::state::*;
use crate::utils::resize_to_fit;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeSubDaoArgsV0 {
  pub authority: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitializeSubDaoArgsV0)]
pub struct InitializeSubDaoV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    mut,
    has_one = authority,
    has_one = mint
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  pub authority: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = std::cmp::max(8 + std::mem::size_of::<SubDaoV0>(), sub_dao.data.borrow_mut().len()),
    seeds = ["sub_dao".as_bytes(), sub_dao_mint.key().as_ref()],
    bump,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub mint: Box<Account<'info, Mint>>,
  pub sub_dao_mint: Box<Account<'info, Mint>>,
  pub hotspot_collection: Box<Account<'info, Mint>>,
  #[account(
    has_one = mint
  )]
  pub treasury: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeSubDaoV0>, args: InitializeSubDaoArgsV0) -> Result<()> {
  ctx.accounts.dao.num_sub_daos += 1;
  ctx.accounts.sub_dao.set_inner(SubDaoV0 {
    dao: ctx.accounts.dao.key(),
    hotspot_collection: ctx.accounts.hotspot_collection.key(),
    mint: ctx.accounts.sub_dao_mint.key(),
    treasury: ctx.accounts.treasury.key(),
    authority: args.authority,
    bump_seed: ctx.bumps["sub_dao"],
    total_devices: 0,
  });

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.sub_dao,
  )?;

  Ok(())
}
