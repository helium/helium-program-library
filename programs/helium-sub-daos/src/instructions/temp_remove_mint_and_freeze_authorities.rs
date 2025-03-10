use anchor_lang::prelude::*;
use anchor_spl::token::{
  set_authority, spl_token::instruction::AuthorityType, Mint, SetAuthority, Token,
};
use solana_program::pubkey;

use crate::{dao_seeds, sub_dao_seeds, DaoV0, SubDaoV0};

const MOBILE_MINT: Pubkey = pubkey!("mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6");
const IOT_MINT: Pubkey = pubkey!("iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns");

#[derive(Accounts)]
pub struct RemoveMintAndFreezeAuthorities<'info> {
  pub authority: Signer<'info>,
  #[account(
    has_one = hnt_mint,
    has_one = authority
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(mut)]
  pub hnt_mint: Box<Account<'info, Mint>>,
  #[account(
    has_one = dao
  )]
  pub iot_sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    has_one = dao
  )]
  pub mobile_sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    mut,
    constraint = mobile_mint.key() == mobile_sub_dao.dnt_mint,
    address = MOBILE_MINT
  )]
  pub mobile_mint: Box<Account<'info, Mint>>,
  #[account(
    mut,
    constraint = iot_mint.key() == iot_sub_dao.dnt_mint,
    address = IOT_MINT
  )]
  pub iot_mint: Box<Account<'info, Mint>>,
  pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<RemoveMintAndFreezeAuthorities>) -> Result<()> {
  // HNT Freeze Authority
  set_authority(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      SetAuthority {
        account_or_mint: ctx.accounts.hnt_mint.to_account_info(),
        current_authority: ctx.accounts.dao.to_account_info(),
      },
      &[dao_seeds!(ctx.accounts.dao)],
    ),
    AuthorityType::FreezeAccount,
    None,
  )?;

  // Mobile freeze authority
  set_authority(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      SetAuthority {
        account_or_mint: ctx.accounts.mobile_mint.to_account_info(),
        current_authority: ctx.accounts.mobile_sub_dao.to_account_info(),
      },
      &[sub_dao_seeds!(ctx.accounts.mobile_sub_dao)],
    ),
    AuthorityType::FreezeAccount,
    None,
  )?;

  // Iot freeze authority
  set_authority(
    CpiContext::new_with_signer(
      ctx.accounts.token_program.to_account_info(),
      SetAuthority {
        account_or_mint: ctx.accounts.iot_mint.to_account_info(),
        current_authority: ctx.accounts.iot_sub_dao.to_account_info(),
      },
      &[sub_dao_seeds!(ctx.accounts.iot_sub_dao)],
    ),
    AuthorityType::FreezeAccount,
    None,
  )?;

  Ok(())
}
