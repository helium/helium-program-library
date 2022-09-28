use anchor_lang::{
  prelude::*,
  solana_program::program::{invoke_signed}
};
use anchor_spl::{
  associated_token::AssociatedToken,  
  token::{self, Mint, MintTo, Token, TokenAccount},
};
use mpl_token_metadata::{instruction::{create_metadata_accounts_v3, create_master_edition_v3}, state::Collection, ID as TOKEN_METADATA_ID};
use crate::state::*;
use crate::{error::ErrorCode};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct IssueHotspotV0Args {
  pub maker: Pubkey,
  pub name: String,
  pub symbol: String,
  pub metadata_url: String,
}

#[derive(Accounts)]
#[instruction(args: IssueHotspotV0Args)]
pub struct IssueHotspotV0<'info> {  
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(mut)]
  pub dc_fee_payer: Signer<'info>,  
  #[account(mut)]
  pub hotspot_owner: Signer<'info>,
  pub collection: Box<Account<'info, Mint>>,

  #[account(
    seeds = ["hotspot_config".as_bytes(), collection.key().as_ref()],
    bump = hotspot_config.bump_seed,
    has_one = collection,
  )]
  pub hotspot_config: Box<Account<'info, HotspotConfigV0>>,

  #[account(
    mut,
    seeds = ["hotspot_issuer".as_bytes(), hotspot_config.key().as_ref(), args.maker.as_ref()],
    bump = hotspot_issuer.bump_seed,
    has_one = hotspot_config,    
  )]
  pub hotspot_issuer: Box<Account<'info, HotspotIssuerV0>>,

  #[account(
    init,
    payer = payer,
    mint::decimals = 0,
    mint::authority = hotspot_issuer,
    mint::freeze_authority = hotspot_issuer,
    seeds = [
      "hotspot".as_bytes(), 
      hotspot_owner.key().as_ref(),
      hotspot_issuer.key().as_ref(),
      hotspot_issuer.count.to_le_bytes().as_ref(),
      args.symbol.as_bytes(),
    ],
    bump
  )]
  pub hotspot: Box<Account<'info, Mint>>,

  /// CHECK: This is not dangerous because we don't read or write from this account
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), hotspot.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub metadata: UncheckedAccount<'info>,
  /// CHECK: This is not dangerous because we don't read or write from this account
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), hotspot.key().as_ref(), "edition".as_bytes()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub master_edition: UncheckedAccount<'info>,  

  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = hotspot,
    associated_token::authority = hotspot_owner,
  )]
  pub recipient: Box<Account<'info, TokenAccount>>,

  /// CHECK: This is not dangerous because we don't read or write from this account
  #[account(address = TOKEN_METADATA_ID @ ErrorCode::InvalidMetadataProgram)]
  pub token_metadata_program: UncheckedAccount<'info>,
  pub associated_token_program: Program<'info, AssociatedToken>,  
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,    
}

impl<'info> IssueHotspotV0<'info> {
  fn mint_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
    let cpi_accounts = MintTo {
      mint: self.hotspot.to_account_info(),
      to: self.recipient.to_account_info(),
      authority: self.hotspot_issuer.to_account_info(),
    };
    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(
  ctx: Context<IssueHotspotV0>,
  args: IssueHotspotV0Args,
) -> Result<()> {
  require!(args.name.len() <= 32, ErrorCode::InvalidStringLength);
  require!(args.symbol.len() <= 10, ErrorCode::InvalidStringLength);
  require!(args.metadata_url.len() <= 200, ErrorCode::InvalidStringLength);

  let signer_seeds: &[&[&[u8]]] = &[&[
    b"hotspot_issuer",
    ctx.accounts.hotspot_config.to_account_info().key.as_ref(),
    args.maker.as_ref(),
    &[ctx.accounts.hotspot_issuer.bump_seed],
  ]];

  // TODO: CPI call to burn hotspot_config.dc_fee from maker

  token::mint_to(
    ctx.accounts.mint_ctx().with_signer(signer_seeds),
    1
  )?;

  let account_infos = vec![
    ctx.accounts.metadata.to_account_info(),
    ctx.accounts.hotspot.to_account_info(),
    ctx.accounts.hotspot_issuer.to_account_info(),
    ctx.accounts.master_edition.to_account_info(),
    ctx.accounts.payer.to_account_info(),
    ctx.accounts.token_program.to_account_info(),
    ctx.accounts.system_program.to_account_info(),
    ctx.accounts.rent.to_account_info(),
  ];

  invoke_signed(&create_metadata_accounts_v3(
      ctx.accounts.token_metadata_program.key(),
      ctx.accounts.metadata.key(),
      ctx.accounts.hotspot.key(),
      ctx.accounts.hotspot_issuer.key(),
      ctx.accounts.payer.key(),
      ctx.accounts.hotspot_issuer.key(),
      args.name,
      args.symbol,
      args.metadata_url,
      None,
      0,
      false,
      true,
      Some(Collection {
        key: ctx.accounts.collection.key(),
        verified: false,
      }),
      None,
      None,
    ),
    account_infos.as_slice(),
    signer_seeds,
  )?;
  
  invoke_signed(
    &create_master_edition_v3(
      ctx.accounts.token_metadata_program.key(),
      ctx.accounts.master_edition.key(),
      ctx.accounts.hotspot.key(),
      ctx.accounts.hotspot_issuer.key(),
      ctx.accounts.hotspot_issuer.key(),
      ctx.accounts.metadata.key(),
      ctx.accounts.payer.key(),
      Some(0)
    ),
    account_infos.as_slice(),
    signer_seeds,
  )?;

  // TODO: CPI call to increment count of dao/subdao

  // increment count on hotspot_issuer
  ctx.accounts.hotspot_issuer.count += 1;

  Ok(())
}
