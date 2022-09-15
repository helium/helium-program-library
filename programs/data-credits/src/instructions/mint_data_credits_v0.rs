use anchor_lang::prelude::*;
use anchor_spl::token::{
  self, Burn, FreezeAccount, Mint, MintTo, ThawAccount, Token, TokenAccount,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct MintDataCreditsV0Args {
  auth_bump: u8,
  amount: u64, // how big does this int need to be?
}

#[derive(Accounts)]
#[instruction(args: MintDataCreditsV0Args)]
pub struct MintDataCreditsV0<'info> {
  // hnt tokens from this account are burned
  #[account(mut,
    constraint = burner.mint == hnt_mint.key(),
    constraint = burner.amount >= args.amount,
    has_one = owner
  )]
  pub burner: Box<Account<'info, TokenAccount>>,
  #[account(mut,
    constraint = recipient.mint == dc_mint.key()
  )]
  pub recipient: Box<Account<'info, TokenAccount>>,

  pub authority: UncheckedAccount<'info>,

  pub owner: Signer<'info>,

  pub hnt_mint: Box<Account<'info, Mint>>,
  pub dc_mint: Box<Account<'info, Mint>>,
  pub token_program: Program<'info, Token>,
}

impl<'info> MintDataCreditsV0<'info> {
  fn burn_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Burn<'info>> {
    let cpi_accounts = Burn {
      mint: self.hnt_mint.to_account_info(),
      from: self.burner.to_account_info(),
      authority: self.owner.to_account_info(),
    };

    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }

  fn thaw_ctx(
    &self,
    authority: AccountInfo<'info>,
    auth_bump: u8,
  ) -> CpiContext<'_, '_, '_, 'info, ThawAccount<'info>> {
    let cpi_accounts = ThawAccount {
      account: self.recipient.to_account_info(),
      mint: self.dc_mint.to_account_info(),
      authority: authority,
    };
    let signer_seeds: &[&[&[u8]]] = &[&[b"dc_auth", &[auth_bump]]];
    CpiContext::new_with_signer(
      self.token_program.to_account_info(),
      cpi_accounts,
      signer_seeds,
    )
  }

  fn mint_ctx(
    &self,
    authority: AccountInfo<'info>,
    auth_bump: u8,
  ) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
    let cpi_accounts = MintTo {
      mint: self.dc_mint.to_account_info(),
      to: self.recipient.to_account_info(),
      authority: authority,
    };
    let signer_seeds: &[&[&[u8]]] = &[&[b"dc_auth", &[auth_bump]]];
    CpiContext::new_with_signer(
      self.token_program.to_account_info(),
      cpi_accounts,
      signer_seeds,
    )
  }

  fn freeze_ctx(
    &self,
    authority: AccountInfo<'info>,
    auth_bump: u8,
  ) -> CpiContext<'_, '_, '_, 'info, FreezeAccount<'info>> {
    let cpi_accounts = FreezeAccount {
      account: self.recipient.to_account_info(),
      mint: self.dc_mint.to_account_info(),
      authority: authority,
    };
    let signer_seeds: &[&[&[u8]]] = &[&[b"dc_auth", &[auth_bump]]];
    CpiContext::new_with_signer(
      self.token_program.to_account_info(),
      cpi_accounts,
      signer_seeds,
    )
  }
}

pub fn handler(ctx: Context<MintDataCreditsV0>, args: MintDataCreditsV0Args) -> Result<()> {
  // burn the hnt tokens
  token::burn(ctx.accounts.burn_ctx(), args.amount);

  // unfreeze the recipient if necessary
  token::thaw_account(
    ctx
      .accounts
      .thaw_ctx(ctx.accounts.authority.to_account_info(), args.auth_bump),
  )?;

  // mint the new tokens to recipient
  token::mint_to(
    ctx
      .accounts
      .mint_ctx(ctx.accounts.authority.to_account_info(), args.auth_bump),
    args.amount,
  )?;

  // freeze the recipient
  token::freeze_account(
    ctx
      .accounts
      .freeze_ctx(ctx.accounts.authority.to_account_info(), args.auth_bump),
  )?;
  Ok(())
}
