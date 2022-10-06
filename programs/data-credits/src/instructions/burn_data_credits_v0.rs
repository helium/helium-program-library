use crate::DataCreditsV0;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, FreezeAccount, Mint, ThawAccount, Token, TokenAccount};
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct BurnDataCreditsV0Args {
  pub amount: u64,
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
  #[account(
    mut,
    seeds = ["dc".as_bytes()],
    bump,
  )]
  /// CHECK: Verified by cpi
  pub authority: Box<Account<'info, DataCreditsV0>>,
  /// CHECK: Verified by cpi
  #[account(
    mut,
    seeds = ["account_payer".as_bytes()],
    bump,
  )]
  pub account_payer: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
}

impl<'info> TrackDcBurnV0Wrapper<'info> {
  fn unwrap(self: &TrackDcBurnV0Wrapper<'info>) -> TrackDcBurnV0<'info> {
    TrackDcBurnV0 {
      sub_dao_epoch_info: self.sub_dao_epoch_info.to_account_info(),
      sub_dao: self.sub_dao.to_account_info(),
      system_program: self.system_program.to_account_info(),
      clock: self.clock.to_account_info(),
      rent: self.rent.to_account_info(),
      account_payer: self.account_payer.to_account_info(),
    }
  }
}

#[derive(Accounts)]
#[instruction(args: BurnDataCreditsV0Args)]
pub struct BurnDataCreditsV0<'info> {
  pub tracker_accounts: TrackDcBurnV0Wrapper<'info>,
  #[account(seeds=["dc".as_bytes()], bump=data_credits.data_credits_bump, has_one=dc_mint)]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,

  // dc tokens from this account are burned
  #[account(mut,
    constraint = burner.mint == dc_mint.key(),
    has_one = owner
  )]
  pub burner: Box<Account<'info, TokenAccount>>,

  pub owner: Signer<'info>,

  pub helium_sub_daos_program: Program<'info, HeliumSubDaos>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,
  pub token_program: Program<'info, Token>,
}

impl<'info> BurnDataCreditsV0<'info> {
  fn burn_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Burn<'info>> {
    let cpi_accounts = Burn {
      mint: self.dc_mint.to_account_info(),
      from: self.burner.to_account_info(),
      authority: self.owner.to_account_info(),
    };

    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }

  fn thaw_ctx(&self) -> CpiContext<'_, '_, '_, 'info, ThawAccount<'info>> {
    let cpi_accounts = ThawAccount {
      account: self.burner.to_account_info(),
      mint: self.dc_mint.to_account_info(),
      authority: self.data_credits.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }

  fn freeze_ctx(&self) -> CpiContext<'_, '_, '_, 'info, FreezeAccount<'info>> {
    let cpi_accounts = FreezeAccount {
      account: self.burner.to_account_info(),
      mint: self.dc_mint.to_account_info(),
      authority: self.data_credits.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<BurnDataCreditsV0>, args: BurnDataCreditsV0Args) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[&[b"dc", &[ctx.accounts.data_credits.data_credits_bump]]];

  // unfreeze the burner if necessary
  if ctx.accounts.burner.is_frozen() {
    token::thaw_account(ctx.accounts.thaw_ctx().with_signer(signer_seeds))?;
  }

  // burn the dc tokens
  token::burn(ctx.accounts.burn_ctx(), args.amount)?;

  // freeze the burner
  token::freeze_account(ctx.accounts.freeze_ctx().with_signer(signer_seeds))?;

  let payer_seeds: &[&[&[u8]]] = &[&[
    b"account_payer",
    &[ctx.accounts.data_credits.account_payer_bump],
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
      bump: ctx.accounts.data_credits.account_payer_bump,
    },
  )?;
  Ok(())
}
