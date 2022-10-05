use crate::DataCreditsV0;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, FreezeAccount, Mint, ThawAccount, Token, TokenAccount};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct BurnDataCreditsV0Args {
  amount: u64,
}

#[derive(Accounts)]
#[instruction(args: BurnDataCreditsV0Args)]
pub struct BurnDataCreditsV0<'info> {
  #[account(seeds=["dc".as_bytes()], bump=data_credits.data_credits_bump, has_one=dc_mint)]
  pub data_credits: Box<Account<'info, DataCreditsV0>>,

  // dc tokens from this account are burned
  #[account(mut,
    constraint = burner.mint == dc_mint.key(),
    has_one = owner
  )]
  pub burner: Box<Account<'info, TokenAccount>>,

  pub owner: Signer<'info>,

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
  Ok(())
}
