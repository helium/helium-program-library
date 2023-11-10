use anchor_lang::prelude::*;

#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("burnhwK2QgaJnK93i82g8dH1zDjbpwxMukyVit9xYXo");

use anchor_spl::token::{Mint, Token, TokenAccount};

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Rewards Burn",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",


  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/rewards-burn",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

#[derive(Accounts)]
pub struct BurnV0<'info> {
  /// CHECK: Burn account
  #[account(
    seeds = [b"burn"],
    bump
  )]
  pub burn: AccountInfo<'info>,
  #[account(
    mut,
    associated_token::mint = mint,
    associated_token::authority = burn,
  )]
  pub token_account: Box<Account<'info, TokenAccount>>,
  #[account(
    // Don't allow burning NFTs, those could be the rewardable entities.
    constraint = mint.decimals != 0
  )]
  pub mint: Box<Account<'info, Mint>>,
  pub token_program: Program<'info, Token>,
}

#[program]
pub mod rewards_burn {
  use anchor_spl::token::{burn, Burn};

  use super::*;

  pub fn burn_v0(ctx: Context<BurnV0>) -> Result<()> {
    burn(
      CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Burn {
          mint: ctx.accounts.mint.to_account_info(),
          from: ctx.accounts.token_account.to_account_info(),
          authority: ctx.accounts.burn.to_account_info(),
        },
        &[&[b"burn", &[ctx.bumps["burn"]]]],
      ),
      ctx.accounts.token_account.amount,
    )?;

    Ok(())
  }
}
