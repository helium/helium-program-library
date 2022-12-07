use crate::{DataCreditsV0, InUseDataCreditsV0};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use helium_sub_daos::{
  cpi::{accounts::TrackDcBurnV0, track_dc_burn_v0},
  current_epoch, DaoV0, SubDaoV0, TrackDcBurnArgsV0,
};

#[derive(Debug, Clone)]
pub struct HeliumSubDaos;

impl anchor_lang::Id for HeliumSubDaos {
  fn id() -> Pubkey {
    helium_sub_daos::ID
  }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct BurnInUseDataCreditsArgsV0 {
  pub amount: u64,
}

#[derive(Accounts)]
pub struct BurnInUseDataCreditsV0<'info> {
  /// CHECK: Verified by cpi
  #[account(
    mut,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(),  &current_epoch(clock.unix_timestamp).to_le_bytes()],
    seeds::program = helium_sub_daos_program.key(),
    bump
  )]
  pub sub_dao_epoch_info: AccountInfo<'info>,
  #[account(
    has_one = dao
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    has_one = dc_mint,
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
  pub authority: AccountInfo<'info>,
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
    has_one = data_credits
  )]
  pub in_use_data_credits: Box<Account<'info, InUseDataCreditsV0>>,

  // dc tokens from this account are burned
  #[account(mut)]
  pub escrow_account: Box<Account<'info, TokenAccount>>,

  #[account(mut)]
  pub manager: Signer<'info>,

  pub token_program: Program<'info, Token>,
  pub helium_sub_daos_program: Program<'info, HeliumSubDaos>,
  pub system_program: Program<'info, System>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
}

impl<'info> BurnInUseDataCreditsV0<'info> {
  fn track_context(self: &BurnInUseDataCreditsV0<'info>) -> TrackDcBurnV0<'info> {
    TrackDcBurnV0 {
      sub_dao_epoch_info: self.sub_dao_epoch_info.to_account_info(),
      sub_dao: self.sub_dao.to_account_info(),
      dao: self.dao.to_account_info(),
      system_program: self.system_program.to_account_info(),
      clock: self.clock.to_account_info(),
      rent: self.rent.to_account_info(),
      account_payer: self.authority.to_account_info(),
      dc_mint: self.dc_mint.to_account_info(),
    }
  }
}

pub fn handler(
  ctx: Context<BurnInUseDataCreditsV0>,
  args: BurnInUseDataCreditsArgsV0,
) -> Result<()> {
  // burn the dc tokens
  token::burn(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      token::Burn {
        mint: ctx.accounts.dc_mint.to_account_info(),
        from: ctx.accounts.escrow_account.to_account_info(),
        authority: ctx.accounts.in_use_data_credits.to_account_info(),
      },
      &[&[
        b"in_use_dc",
        ctx.accounts.sub_dao.key().as_ref(),
        ctx.accounts.in_use_data_credits.owner.as_ref(),
        &[ctx.accounts.in_use_data_credits.bump],
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
