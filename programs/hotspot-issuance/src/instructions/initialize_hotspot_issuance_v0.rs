use crate::state::*;
use crate::utils::resize_to_fit;
use anchor_lang::{
  prelude::*,
  solana_program::program::{invoke, invoke_signed},
};
use anchor_spl::token::{Mint, Token};
use mpl_token_metadata::instruction::create_metadata_accounts_v3;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeHotspotIssuanceV0Args {
  pub collection_name: String,
  pub collection_symbol: String,
  pub collection_metadata_uri: String,
  pub onboarding_server: Pubkey,
  pub authority: Pubkey,
}

#[derive(Accounts)]
pub struct InitializeHotspotIssuanceV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    mint::decimals = 0,
    mint::authority = hotspot_issuance,
    mint::freeze_authority = hotspot_issuance,
  )]
  pub collection_mint: Box<Account<'info, Mint>>,
  /// CHECK: This is not dangerous because we don't read or write from this account
  #[account(mut)]
  pub collection_metadata: UncheckedAccount<'info>,
  #[account(
    init,
    payer = payer,
    space = std::cmp::max(8 + std::mem::size_of::<HotspotIssuanceV0>(), hotspot_issuance.data.borrow_mut().leng()),
    seeds = [b"hotspot_issuance", collection_mint.key().as_ref()],
    bump,
  )]
  pub hotspot_issuance: Box<Account<'info, HotspotIssuanceV0>>,

  pub system_program: Program<'info, System>,
  /// CHECK: This is not dangerous because we don't read or write from this account
  pub token_metadata_program: UncheckedAccount<'info>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
  ctx: Context<InitializeHotspotIssuanceV0>,
  args: InitializeHotspotIssuanceV0Args,
) -> Result<()> {
  let account_info = vec![
    ctx.accounts.collection_metadata.to_account_info(),
    ctx.accounts.collection_mint.to_account_info(),
    ctx.accounts.hotspot_issuance.to_account_info(),
    ctx.accounts.payer.to_account_info(),
    ctx.accounts.token_metadata_program.to_account_info(),
    ctx.accounts.token_program.to_account_info(),
    ctx.accounts.system_program.to_account_info(),
    ctx.accounts.rent.to_account_info(),
  ];

  let seeds: &[&[&[u8]]] = &[&[
    b"hotspot_issuance",
    ctx.accounts.collection_mint.to_account_info().key.as_ref(),
    &[ctx.bumps["hotspot_issuance"]],
  ]];

  invoke_signed(
    &create_metadata_accounts_v3(
      ctx.accounts.token_metadata_program.key(),
      ctx.accounts.collection_metadata.key(),
      ctx.accounts.collection_mint.key(),
      ctx.accounts.hotspot_issuance.key(),
      ctx.accounts.payer.key(),
      ctx.accounts.hotspot_issuance.key(),
      args.collection_name,
      args.collection_symbol,
      args.collection_metadata_uri,
      None,
      0,
      true,
      false,
      Some(Collection {
        key: ctx.accounts.collection_mint.key(),
        verified: true,
      }),
      None,
      None,
    ),
    account_info.as_slice(),
    seeds,
  )?;

  ctx.accounts.hotspot_issuance.set_inner(HotspotIssuanceV0 {
    count: 0,
    onboarding_server: args.onboarding_server,
    collection_mint: ctx.accounts.collection_mint.key(),
    authority: args.authority,
    bump_seed: ctx.bumps["hotspot_issuance"],
  });

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts_lazy_distributor,
  )?;

  Ok(())
}
