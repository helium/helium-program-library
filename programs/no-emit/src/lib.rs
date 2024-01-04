use anchor_lang::prelude::*;

#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("noEmmgLmQdk6DLiPV8CSwQv3qQDyGEhz9m5A4zhtByv");

use anchor_spl::token::{Mint, Token, TokenAccount};

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "No Emit",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",


  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/no-emit",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[account]
#[derive(Default, InitSpace)]
pub struct NotEmittedCounterV0 {
  pub amount_not_emitted: u64,
  pub bump_seed: u8,
}

#[derive(Accounts)]
pub struct NoEmitV0<'info> {
  #[account(mut)]
  payer: Signer<'info>,
  /// CHECK: Burn account
  #[account(
    seeds = [b"not_emitted"],
    bump
  )]
  pub no_emit_wallet: AccountInfo<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    seeds = [b"not_emitted_counter", mint.key().as_ref()],
    bump,
    space = 60 + NotEmittedCounterV0::INIT_SPACE
  )]
  pub not_emitted_counter: Account<'info, NotEmittedCounterV0>,
  #[account(
    mut,
    associated_token::mint = mint,
    associated_token::authority = no_emit_wallet,
  )]
  pub token_account: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    // Don't allow burning NFTs, those could be the rewardable entities.
    constraint = mint.decimals != 0
  )]
  pub mint: Box<Account<'info, Mint>>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,
}

#[program]
pub mod no_emit {
  use anchor_spl::token::{burn, Burn};

  use super::*;

  pub fn no_emit_v0(ctx: Context<NoEmitV0>) -> Result<()> {
    ctx.accounts.not_emitted_counter.bump_seed = ctx.bumps["not_emitted_counter"];
    ctx.accounts.not_emitted_counter.amount_not_emitted = ctx
      .accounts
      .not_emitted_counter
      .amount_not_emitted
      .checked_add(ctx.accounts.token_account.amount)
      .unwrap();
    burn(
      CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Burn {
          mint: ctx.accounts.mint.to_account_info(),
          from: ctx.accounts.token_account.to_account_info(),
          authority: ctx.accounts.no_emit_wallet.to_account_info(),
        },
        &[&[b"not_emitted", &[ctx.bumps["no_emit_wallet"]]]],
      ),
      ctx.accounts.token_account.amount,
    )?;

    Ok(())
  }
}
