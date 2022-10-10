use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{set_authority, SetAuthority};
use anchor_spl::token::{Mint, Token};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeDaoArgsV0 {
  pub authority: Pubkey,
  pub reward_per_epoch: u64,
}

#[derive(Accounts)]
#[instruction(args: InitializeDaoArgsV0)]
pub struct InitializeDaoV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = 8 + std::mem::size_of::<DaoV0>() + 60,
    seeds = ["dao".as_bytes(), mint.key().as_ref()],
    bump,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(mut)]
  pub mint: Box<Account<'info, Mint>>,
  pub mint_authority: Signer<'info>,
  pub freeze_authority: Signer<'info>,
  pub dc_mint: Box<Account<'info, Mint>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeDaoV0>, args: InitializeDaoArgsV0) -> Result<()> {
  set_authority(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      SetAuthority {
        account_or_mint: ctx.accounts.mint.to_account_info(),
        current_authority: ctx.accounts.mint_authority.to_account_info(),
      },
    ),
    AuthorityType::MintTokens,
    Some(ctx.accounts.dao.key()),
  )?;
  set_authority(
    CpiContext::new(
      ctx.accounts.token_program.to_account_info(),
      SetAuthority {
        account_or_mint: ctx.accounts.mint.to_account_info(),
        current_authority: ctx.accounts.freeze_authority.to_account_info(),
      },
    ),
    AuthorityType::FreezeAccount,
    Some(ctx.accounts.dao.key()),
  )?;

  ctx.accounts.dao.set_inner(DaoV0 {
    dc_mint: ctx.accounts.dc_mint.key(),
    mint: ctx.accounts.mint.key(),
    authority: args.authority,
    num_sub_daos: 0,
    reward_per_epoch: args.reward_per_epoch,
    bump_seed: ctx.bumps["dao"],
  });

  Ok(())
}
