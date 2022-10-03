
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,  
  token::{self, Mint, MintTo, Token, TokenAccount},
};
use crate::state::*;
use crate::{error::ErrorCode};
use data_credits::{DataCreditsV0, BurnDataCreditsV0, BurnDataCreditsV0Args};
use crate::token_metadata::{
  Collection,
  create_metadata_account_v3, CreateMetadataAccount, CreateMetadataAccountArgs,
  create_master_edition_v3, CreateMasterEdition, CreateMasterEditionArgs,
  verify_sized_collection_item, VerifySizedCollectionItem, VerifySizedCollectionItemArgs
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct IssueHotspotV0Args {
  pub name: String,
  pub symbol: String,
  pub metadata_url: String,
}

#[derive(Accounts)]
#[instruction(args: IssueHotspotV0Args)]
pub struct IssueHotspotV0<'info> {  
  #[account(mut)]
  pub payer: Signer<'info>,
  pub onboarding_server: Signer<'info>,
  pub maker: Signer<'info>,
  
  /// CHECK: Hotspot nft sent here
  pub hotspot_owner: AccountInfo<'info>,
  pub collection: Box<Account<'info, Mint>>,

  /// CHECK: Handled by cpi
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), collection.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub collection_metadata: UncheckedAccount<'info>,
  /// CHECK: Handled By cpi account
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), collection.key().as_ref(), "edition".as_bytes()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub collection_master_edition: UncheckedAccount<'info>,  

  #[account(
    seeds = ["hotspot_config".as_bytes(), collection.key().as_ref()],
    bump = hotspot_config.bump_seed,
    has_one = collection,
    has_one = onboarding_server
  )]
  pub hotspot_config: Box<Account<'info, HotspotConfigV0>>,

  #[account(
    mut,
    seeds = ["hotspot_issuer".as_bytes(), hotspot_config.key().as_ref(), maker.key().as_ref()],
    bump = hotspot_issuer.bump_seed,
    has_one = hotspot_config,
    has_one = maker,
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

  /// CHECK: Handled by cpi
  #[account(
    mut,
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), hotspot.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub metadata: UncheckedAccount<'info>,

  /// CHECK: Handled by cpi
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
  pub recipient_token_account: Box<Account<'info, TokenAccount>>,
  
  
  #[account(
    mut,
    seeds = ["dc".as_bytes()],
    seeds::program = data_credits_program.key(),
    bump
  )]
  pub dc: Box<Account<'info, DataCreditsV0>>,
  #[account(mut)]
  pub dc_fee_payer: Signer<'info>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,  
  #[account(
    init_if_needed,
    payer = dc_fee_payer,
    associated_token::mint = dc_mint,
    associated_token::authority = dc_fee_payer
  )]
  pub dc_ata: Box<Account<'info, TokenAccount>>,
  #[account(
    mut,
    seeds = ["dc_token_auth".as_bytes()],
    seeds::program = data_credits_program.key(),
    bump
  )]
  pub dc_token_authority: AccountInfo<'info>,


  /// CHECK: Checked with constraints
  #[account(address = mpl_token_metadata::ID)]
  pub token_metadata_program: AccountInfo<'info>,
  /// CHECK: Checked with constraints  
  #[account(address = data_credits::ID)]
  pub data_credits_program: AccountInfo<'info>,
  pub associated_token_program: Program<'info, AssociatedToken>,  
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

impl<'info> IssueHotspotV0<'info> {
  fn mint_ctx(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
    let cpi_accounts = MintTo {
      mint: self.hotspot.to_account_info(),
      to: self.recipient_token_account.to_account_info(),
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
    ctx.accounts.maker.to_account_info().key.as_ref(),
    &[ctx.accounts.hotspot_issuer.bump_seed],
  ]];

  // TODO: CPI call to burn hotspot_config.dc_fee from maker

  token::mint_to(
    ctx.accounts.mint_ctx().with_signer(signer_seeds),
    1
  )?;

  create_metadata_account_v3(
    CpiContext::new_with_signer(
      ctx.accounts.token_metadata_program.clone(),
      CreateMetadataAccount {
        metadata_account: ctx.accounts.metadata.to_account_info().clone(),
        mint: ctx.accounts.hotspot.to_account_info().clone(),
        mint_authority: ctx.accounts.hotspot_issuer.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        update_authority: ctx.accounts.hotspot_issuer.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
        rent: ctx.accounts.rent.to_account_info().clone(),
      },
      signer_seeds
    ),
    CreateMetadataAccountArgs {
      name: args.name,
      symbol: args.symbol,
      uri: args.metadata_url,
      collection: Some(Collection {
        key: ctx.accounts.collection.key(),
        verified: false
      }),
      collection_details: None
    }
  )?;
  
  create_master_edition_v3(
    CpiContext::new_with_signer(
      ctx.accounts.token_metadata_program.clone(),
      CreateMasterEdition {
        edition: ctx.accounts.master_edition.to_account_info().clone(),
        mint: ctx.accounts.hotspot.to_account_info().clone(),
        update_authority: ctx.accounts.hotspot_issuer.to_account_info().clone(),
        mint_authority: ctx.accounts.hotspot_issuer.to_account_info().clone(),
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        token_program: ctx.accounts.token_program.to_account_info().clone(),        
        system_program: ctx.accounts.system_program.to_account_info().clone(),        
        rent: ctx.accounts.rent.to_account_info().clone(),
      }, 
      signer_seeds
    ), 
    CreateMasterEditionArgs {
      max_supply: Some(0)
    }
  )?;

  let verify_signer_seeds: &[&[&[u8]]] = &[&[
    b"hotspot_config",
    ctx.accounts.collection.to_account_info().key.as_ref(),
    &[ctx.accounts.hotspot_config.bump_seed],    
  ]];  

  verify_sized_collection_item(
    CpiContext::new_with_signer(
      ctx.accounts.token_metadata_program.clone(),
      VerifySizedCollectionItem {
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        collection_authority: ctx.accounts.hotspot_config.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        collection_mint: ctx.accounts.collection.to_account_info().clone(),
        collection_metadata: ctx.accounts.collection_metadata.to_account_info().clone(),
        collection_master_edition_account: ctx.accounts.collection_master_edition.to_account_info().clone(),
      },
      verify_signer_seeds
    ),
    VerifySizedCollectionItemArgs {
      collection_authority_record: None
    }
  )?;

  // TODO: CPI call to increment count of dao/subdao

  ctx.accounts.hotspot_issuer.count += 1;

  Ok(())
}
