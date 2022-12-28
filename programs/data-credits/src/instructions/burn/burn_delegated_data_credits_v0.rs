use crate::{DataCreditsV0, DelegatedDataCreditsV0};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use helium_sub_daos::{
  cpi::{accounts::TrackDcBurnV0, track_dc_burn_v0}, DaoV0, SubDaoV0, TrackDcBurnArgsV0,
};

#[derive(Debug, Clone)]
pub struct HeliumSubDaos;

impl anchor_lang::Id for HeliumSubDaos {
  fn id() -> Pubkey {
    helium_sub_daos::ID
  }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct BurnDelegatedDataCreditsArgsV0 {
  pub amount: u64,
}

#[derive(Accounts)]
pub struct BurnDelegatedDataCreditsV0<'info> {
  /// CHECK: Verified by cpi
  #[account(mut)]
  pub sub_dao_epoch_info: AccountInfo<'info>,
  #[account(
    mut,
    has_one = dao,
    has_one = dc_burn_authority
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub dc_burn_authority: Signer<'info>,
  /// CHECK: Used by cpi
  pub registrar: AccountInfo<'info>,
  #[account(
    has_one = dc_mint,
    has_one = registrar
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,
  /// CHECK: Verified by cpi
  #[account(
    mut,
    seeds = ["account_payer".as_bytes()],
    bump,
  )]
  pub account_payer: AccountInfo<'info>,
  #[account(
    seeds=[
      "dc".as_bytes(),
      dc_mint.key().as_ref(),
    ],
    bump = data_credits.data_credits_bump,
    has_one = dc_mint
  )]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,
  #[account(
    has_one = escrow_account,
    has_one = sub_dao,
    has_one = data_credits,
  )]
  pub delegated_data_credits: Box<Account<'info, DelegatedDataCreditsV0>>,

  // dc tokens from this account are burned
  #[account(mut)]
  pub escrow_account: Box<Account<'info, TokenAccount>>,

  pub token_program: Program<'info, Token>,
  pub helium_sub_daos_program: Program<'info, HeliumSubDaos>,
  pub system_program: Program<'info, System>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
}

impl<'info> BurnDelegatedDataCreditsV0<'info> {
  fn track_context(self: &BurnDelegatedDataCreditsV0<'info>) -> TrackDcBurnV0<'info> {
    TrackDcBurnV0 {
      sub_dao_epoch_info: self.sub_dao_epoch_info.to_account_info(),
      sub_dao: self.sub_dao.to_account_info(),
      dao: self.dao.to_account_info(),
      system_program: self.system_program.to_account_info(),
      registrar: self.registrar.to_account_info(),
      rent: self.rent.to_account_info(),
      account_payer: self.account_payer.to_account_info(),
      dc_mint: self.dc_mint.to_account_info(),
    }
  }
}

pub fn handler(
  ctx: Context<BurnDelegatedDataCreditsV0>,
  args: BurnDelegatedDataCreditsArgsV0,
) -> Result<()> {
  // burn the dc tokens
  token::burn(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      token::Burn {
        mint: ctx.accounts.dc_mint.to_account_info(),
        from: ctx.accounts.escrow_account.to_account_info(),
        authority: ctx.accounts.delegated_data_credits.to_account_info(),
      },
      &[&[
        b"delegated_data_credits",
        ctx.accounts.sub_dao.key().as_ref(),
        &hash(ctx.accounts.delegated_data_credits.router_key.as_bytes()).to_bytes(),
        &[ctx.accounts.delegated_data_credits.bump],
      ]],
    ),
    args.amount,
  )?;

  let payer_seeds: &[&[&[u8]]] = &[&[
    b"account_payer",
    &[ctx.accounts.data_credits.account_payer_bump],
  ]];
  let cpi_accounts = ctx.accounts.track_context();
  track_dc_burn_v0(
    CpiContext::new_with_signer(
      ctx.accounts.helium_sub_daos_program.to_account_info(),
      cpi_accounts,
      payer_seeds,
    ),
    TrackDcBurnArgsV0 {
      dc_burned: args.amount,
      bump: ctx.accounts.data_credits.account_payer_bump,
    },
  )?;
  Ok(())
}
