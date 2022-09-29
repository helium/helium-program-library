use anchor_lang::{
  prelude::*,
  solana_program::program::{invoke_signed},
};
use anchor_spl::{
  associated_token::AssociatedToken,  
  token::{self, Mint, MintTo, Token, TokenAccount},
};
use mpl_token_metadata::{
  instruction::{create_metadata_accounts_v3, create_master_edition_v3}, 
  state::CollectionDetails, 
  ID as TOKEN_METADATA_ID
};
use crate::state::*;
use crate::{error::ErrorCode, utils::resize_to_fit};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeHotspotConfigV0Args {
  pub name: String,
  pub symbol: String,
  pub metadata_url: String,
  pub dc_fee: u64,
  pub onboarding_server: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: InitializeHotspotConfigV0Args)]
pub struct InitializeHotspotConfigV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    mint::decimals = 0,
    mint::authority = hotspot_config,
    mint::freeze_authority = hotspot_config,
    seeds = ["collection".as_bytes(), args.symbol.as_bytes()],
    bump
  )]
  pub collection: Box<Account<'info, Mint>>,
  /// CHECK: Handled by cpi
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), collection.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub metadata: UncheckedAccount<'info>,
  /// CHECK: Handled by cpi
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), collection.key().as_ref(), "edition".as_bytes()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub master_edition: UncheckedAccount<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = collection,
    associated_token::authority = hotspot_config,
  )]
  pub token_account: Box<Account<'info, TokenAccount>>,
  #[account(
    init,
    payer = payer,
    space = std::cmp::max(8 + std::mem::size_of::<HotspotConfigV0>(), hotspot_config.data.borrow_mut().len()),
    seeds = ["hotspot_config".as_bytes(), collection.key().as_ref()],
    bump,
  )]
  pub hotspot_config: Box<Account<'info, HotspotConfigV0>>,

  /// CHECK: This is not dangerous because we don't read or write from this account
  #[account(address = TOKEN_METADATA_ID @ ErrorCode::InvalidMetadataProgram)]
  pub token_metadata_program: UncheckedAccount<'info>,
  pub associated_token_program: Program<'info, AssociatedToken>,    
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,  
}

impl<'info> InitializeHotspotConfigV0<'info> {
  fn mint_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
    let cpi_accounts = MintTo {
      mint: self.collection.to_account_info(),
      to: self.token_account.to_account_info(),
      authority: self.hotspot_config.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(
  ctx: Context<InitializeHotspotConfigV0>,
  args: InitializeHotspotConfigV0Args,  
) -> Result<()> {
  require!(args.name.len() <= 32, ErrorCode::InvalidStringLength);
  require!(args.symbol.len() <= 10, ErrorCode::InvalidStringLength);
  require!(args.metadata_url.len() <= 200, ErrorCode::InvalidStringLength);

  let signer_seeds: &[&[&[u8]]] = &[&[
    b"hotspot_config",
    ctx.accounts.collection.to_account_info().key.as_ref(),
    &[ctx.bumps["hotspot_config"]],
  ]];

  token::mint_to(
    ctx.accounts.mint_ctx().with_signer(signer_seeds),
    1
  )?;

  let account_infos = vec![
    ctx.accounts.metadata.to_account_info(),
    ctx.accounts.collection.to_account_info(),
    ctx.accounts.hotspot_config.to_account_info(),
    ctx.accounts.master_edition.to_account_info(),
    ctx.accounts.payer.to_account_info(),
    ctx.accounts.token_program.to_account_info(),    
    ctx.accounts.system_program.to_account_info(),
    ctx.accounts.rent.to_account_info(),
  ];  

  invoke_signed(
    &create_metadata_accounts_v3(
      ctx.accounts.token_metadata_program.key(),
      ctx.accounts.metadata.key(),
      ctx.accounts.collection.key(),
      ctx.accounts.hotspot_config.key(),
      ctx.accounts.payer.key(),
      ctx.accounts.hotspot_config.key(),
      args.name,
      args.symbol,
      args.metadata_url,
      None,
      0,
      false,
      true,
      None,
      None,
      Some(CollectionDetails::V1 { size: 0 }),
    ),
    account_infos.as_slice(),
    signer_seeds,
  )?;

  invoke_signed(
    &create_master_edition_v3(
      ctx.accounts.token_metadata_program.key(),
      ctx.accounts.master_edition.key(),
      ctx.accounts.collection.key(),
      ctx.accounts.hotspot_config.key(),
      ctx.accounts.hotspot_config.key(),
      ctx.accounts.metadata.key(),
      ctx.accounts.payer.key(),
      Some(0)
    ),
    account_infos.as_slice(),
    signer_seeds,
  )?;

  ctx.accounts.hotspot_config.set_inner(HotspotConfigV0 {
    dc_fee: args.dc_fee,
    collection: ctx.accounts.collection.key(),
    onboarding_server: args.onboarding_server,
    authority: args.onboarding_server,
    
    bump_seed: ctx.bumps["hotspot_config"],
    collection_bump_seed: ctx.bumps["collection"],
  });

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.hotspot_config,
  )?;  

  Ok(())
}