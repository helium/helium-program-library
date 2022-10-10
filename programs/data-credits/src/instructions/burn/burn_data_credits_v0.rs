use super::common::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{self};
use helium_sub_daos::{
  cpi::{accounts::TrackDcBurnV0, track_dc_burn_v0},
  current_epoch, TrackDcBurnArgsV0,
};

#[derive(Debug, Clone)]
pub struct HeliumSubDaos;

impl anchor_lang::Id for HeliumSubDaos {
  fn id() -> Pubkey {
    helium_sub_daos::ID
  }
}

#[derive(Accounts)]
pub struct TrackDcBurnV0Wrapper<'info> {
  /// CHECK: Verified by cpi
  #[account(
    mut,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(),  &current_epoch(clock.unix_timestamp).to_le_bytes()], // Break into 30m epochs
    seeds::program = helium_sub_daos::ID,
    bump
  )]
  pub sub_dao_epoch_info: AccountInfo<'info>,
  /// CHECK: Verified by cpi
  pub sub_dao: AccountInfo<'info>,
  /// CHECK: Verified by cpi
  #[account(
    mut,
    seeds = ["account_payer".as_bytes()],
    bump,
  )]
  pub authority: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct BurnDataCreditsArgsV0 {
  pub amount: u64,
}

#[derive(Accounts)]
pub struct BurnDataCreditsV0<'info> {
  pub tracker_accounts: TrackDcBurnV0Wrapper<'info>,
  pub burn_accounts: BurnCommonV0<'info>,
  pub helium_sub_daos_program: Program<'info, HeliumSubDaos>,
}

impl<'info> TrackDcBurnV0Wrapper<'info> {
  fn unwrap(self: &TrackDcBurnV0Wrapper<'info>) -> TrackDcBurnV0<'info> {
    TrackDcBurnV0 {
      sub_dao_epoch_info: self.sub_dao_epoch_info.to_account_info(),
      sub_dao: self.sub_dao.to_account_info(),
      system_program: self.system_program.to_account_info(),
      clock: self.clock.to_account_info(),
      rent: self.rent.to_account_info(),
      account_payer: self.authority.to_account_info(),
    }
  }
}

pub fn handler(ctx: Context<BurnDataCreditsV0>, args: BurnDataCreditsArgsV0) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[&[
    "dc".as_bytes(),
    ctx
      .accounts
      .burn_accounts
      .dc_mint
      .to_account_info()
      .key
      .as_ref(),
    &[ctx.accounts.burn_accounts.data_credits.data_credits_bump],
  ]];
  // unfreeze the burner if necessary
  if ctx.accounts.burn_accounts.burner.is_frozen() {
    token::thaw_account(
      ctx
        .accounts
        .burn_accounts
        .thaw_ctx()
        .with_signer(signer_seeds),
    )?;
  }

  // burn the dc tokens
  token::burn(
    ctx
      .accounts
      .burn_accounts
      .burn_ctx()
      .with_signer(signer_seeds),
    args.amount,
  )?;

  // freeze the burner
  token::freeze_account(
    ctx
      .accounts
      .burn_accounts
      .freeze_ctx()
      .with_signer(signer_seeds),
  )?;

  let payer_seeds: &[&[&[u8]]] = &[&[
    b"account_payer",
    &[ctx.accounts.burn_accounts.data_credits.account_payer_bump],
  ]];
  let cpi_accounts = ctx.accounts.tracker_accounts.unwrap();
  track_dc_burn_v0(
    CpiContext::new_with_signer(
      ctx.accounts.helium_sub_daos_program.to_account_info(),
      cpi_accounts,
      payer_seeds,
    ),
    TrackDcBurnArgsV0 {
      dc_burned: args.amount,
      bump: ctx.accounts.burn_accounts.data_credits.account_payer_bump,
    },
  )?;
  Ok(())
}
