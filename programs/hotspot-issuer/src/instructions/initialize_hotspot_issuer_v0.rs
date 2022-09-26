use crate::state::*;
use crate::{error::ErrorCode, utils::resize_to_fit};
use anchor_lang::{
  prelude::*,
  solana_program::program::{invoke_signed},
};
use anchor_spl::token::{Mint, Token};
use mpl_token_metadata::{instruction::{create_metadata_accounts_v3}, state::CollectionDetails, ID as TOKEN_METADATA_ID};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeHotspotIssuerV0Args {
  pub name: String,
  pub symbol: String,
  pub uri: String,
  pub dc_amount: u128,
  pub onboarding_server: Pubkey,
  pub authority: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitializeHotspotIssuerV0Args)]
pub struct InitializeHotspotIssuerV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    mint::decimals = 0,
    mint::authority = hotspot_issuer,
    mint::freeze_authority = hotspot_issuer,
    seeds = ["collection".as_bytes(), args.symbol.as_bytes()],
    bump
  )]
  pub collection: Box<Account<'info, Mint>>,
  /// CHECK: This is not dangerous because we don't read or write from this account
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), collection.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub metadata: UncheckedAccount<'info>,
  #[account(
    init,
    payer = payer,
    space = std::cmp::max(8 + std::mem::size_of::<HotspotIssuerV0>(), hotspot_issuer.data.borrow_mut().len()),
    seeds = ["hotspot_issuer".as_bytes(), collection.key().as_ref()],
    bump,
  )]
  pub hotspot_issuer: Box<Account<'info, HotspotIssuerV0>>,

  /// CHECK: This is not dangerous because we don't read or write from this account
  #[account(address = TOKEN_METADATA_ID @ ErrorCode::InvalidMetadataProgram)]
  pub token_metadata_program: UncheckedAccount<'info>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
  ctx: Context<InitializeHotspotIssuerV0>,
  args: InitializeHotspotIssuerV0Args,
) -> Result<()> {
  require!(args.name.len() <= 32, ErrorCode::InvalidStringLength);
  require!(args.symbol.len() <= 10, ErrorCode::InvalidStringLength);
  require!(args.uri.len() <= 200, ErrorCode::InvalidStringLength);

  let account_info = vec![
    ctx.accounts.metadata.to_account_info(),
    ctx.accounts.collection.to_account_info(),
    ctx.accounts.payer.to_account_info(),
    ctx.accounts.hotspot_issuer.to_account_info(),
    ctx.accounts.token_metadata_program.to_account_info(),
    ctx.accounts.token_program.to_account_info(),
    ctx.accounts.system_program.to_account_info(),
    ctx.accounts.rent.to_account_info(),
  ];

  let signer_seeds: &[&[&[u8]]] = &[&[
    b"hotspot_issuer",
    ctx.accounts.collection.to_account_info().key.as_ref(),
    &[ctx.bumps["hotspot_issuer"]],
  ]];

  invoke_signed(
    &create_metadata_accounts_v3(
      ctx.accounts.token_metadata_program.key(),
      ctx.accounts.metadata.key(),
      ctx.accounts.collection.key(),
      ctx.accounts.hotspot_issuer.key(),
      ctx.accounts.payer.key(),
      ctx.accounts.hotspot_issuer.key(),
      args.name,
      args.symbol,
      args.uri,
      None,
      0,
      true,
      false,
      None,
      None,
      Some(CollectionDetails::V1 { size: 0 }),
    ),
    account_info.as_slice(),
    signer_seeds,
  )?;

  ctx.accounts.hotspot_issuer.set_inner(HotspotIssuerV0 {
    count: 0,
    dc_amount: args.dc_amount,
    onboarding_server: args.onboarding_server,
    collection: ctx.accounts.collection.key(),
    authority: args.authority,
    bump_seed: ctx.bumps["hotspot_issuer"],
    collection_bump_seed: ctx.bumps["collection"],
  });

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.hotspot_issuer,
  )?;

  Ok(())
}
