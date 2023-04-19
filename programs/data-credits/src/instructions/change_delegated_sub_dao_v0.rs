use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{transfer, Mint, Token, TokenAccount, Transfer},
};
use helium_sub_daos::{DaoV0, SubDaoV0};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ChangeDelegatedSubDaoArgsV0 {
  amount: u64,
  router_key: String,
}

#[derive(Accounts)]
#[instruction(args: ChangeDelegatedSubDaoArgsV0)]
pub struct ChangeDelegatedSubDaoV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub authority: Signer<'info>,
  #[account(
    seeds = [
      "delegated_data_credits".as_bytes(),
      sub_dao.key().as_ref(),
      &hash(args.router_key.as_bytes()).to_bytes()
    ],
    bump,
  )]
  pub delegated_data_credits: Box<Account<'info, DelegatedDataCreditsV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<DataCreditsV0>(),
    seeds = [
      "delegated_data_credits".as_bytes(),
      destination_sub_dao.key().as_ref(),
      &hash(args.router_key.as_bytes()).to_bytes()
    ],
    bump,
  )]
  pub destination_delegated_data_credits: Box<Account<'info, DelegatedDataCreditsV0>>,
  #[account(
    has_one = dc_mint,
    seeds = ["dc".as_bytes(), dc_mint.key().as_ref()],
    bump = data_credits.data_credits_bump
  )]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,
  pub dc_mint: Box<Account<'info, Mint>>,
  #[account(
    has_one = dc_mint,
    has_one = authority
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    has_one = dao
  )]
  pub destination_sub_dao: Box<Account<'info, SubDaoV0>>,

  /// CHECK: Verified by cpi
  #[account(
    mut,
    seeds = ["escrow_dc_account".as_bytes(), delegated_data_credits.key().as_ref()],
    bump,
    token::mint = dc_mint,
    token::authority = delegated_data_credits
  )]
  pub escrow_account: Account<'info, TokenAccount>,

  #[account(
    init_if_needed,
    payer = payer,
    seeds = ["escrow_dc_account".as_bytes(), destination_delegated_data_credits.key().as_ref()],
    bump,
    token::mint = dc_mint,
    token::authority = destination_delegated_data_credits
  )]
  pub destination_escrow_account: Account<'info, TokenAccount>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<ChangeDelegatedSubDaoV0>,
  args: ChangeDelegatedSubDaoArgsV0,
) -> Result<()> {
  ctx
    .accounts
    .destination_delegated_data_credits
    .set_inner(DelegatedDataCreditsV0 {
      data_credits: ctx.accounts.data_credits.key(),
      router_key: args.router_key.clone(),
      sub_dao: ctx.accounts.destination_sub_dao.key(),
      escrow_account: ctx.accounts.destination_escrow_account.key(),
      bump: ctx.bumps["destination_delegated_data_credits"],
    });

  transfer(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      Transfer {
        from: ctx.accounts.escrow_account.to_account_info(),
        to: ctx.accounts.destination_escrow_account.to_account_info(),
        authority: ctx.accounts.delegated_data_credits.to_account_info(),
      },
      &[&[
        b"delegated_data_credits",
        ctx.accounts.sub_dao.key().as_ref(),
        &hash(args.router_key.as_bytes()).to_bytes(),
        &[ctx.accounts.delegated_data_credits.bump],
      ]],
    ),
    args.amount,
  )?;

  Ok(())
}
