use crate::error::ErrorCode;
use crate::state::*;
use crate::token_metadata::{
  create_master_edition_v3, create_metadata_account_v3, verify_sized_collection_item, Collection,
  CreateMasterEdition, CreateMasterEditionArgs, CreateMetadataAccount, CreateMetadataAccountArgs,
  VerifySizedCollectionItem, VerifySizedCollectionItemArgs,
};
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{self, Mint, MintTo, Token, TokenAccount},
};
use angry_purple_tiger::AnimalName;
use data_credits::HeliumSubDaos;
use data_credits::{
  cpi::{
    accounts::{BurnCommonV0, BurnFromIssuanceV0},
    burn_from_issuance_v0,
  },
  BurnFromIssuanceArgsV0, DataCreditsV0,
};
use helium_sub_daos::{
  cpi::{accounts::TrackAddedDeviceV0, track_added_device_v0},
  TrackAddedDeviceArgsV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct IssueHotspotArgsV0 {
  pub ecc_compact: Vec<u8>,
  pub uri: String,
  pub is_full_hotspot: bool,
}

#[derive(Accounts)]
#[instruction(args: IssueHotspotArgsV0)]
pub struct IssueHotspotV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub dc_fee_payer: Signer<'info>,
  pub maker: Signer<'info>,
  /// CHECK: Hotspot nft sent here
  pub hotspot_owner: AccountInfo<'info>,
  #[account(mut)]
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
    has_one = collection,
    has_one = dc_mint,
    has_one = sub_dao
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
      collection.key().as_ref(),
      &args.ecc_compact,
    ],
    bump
  )]
  pub hotspot: Box<Account<'info, Mint>>,
  #[account(
    init,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<HotspotStorageV0>(),
    seeds = [
      "storage".as_bytes(),
      hotspot.key().as_ref()
    ],
    bump
  )]
  pub storage: Box<Account<'info, HotspotStorageV0>>,
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

  /// CHECK: Verified by cpi  
  #[account(
    seeds=[
      "dc".as_bytes(),
      dc_mint.key().as_ref()
    ],
    seeds::program = data_credits_program.key(),
    bump,
    has_one = dc_mint
  )]
  pub dc: Account<'info, DataCreditsV0>,
  #[account(mut)]
  /// CHECK: Verified by cpi
  pub dc_mint: AccountInfo<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    associated_token::mint = dc_mint,
    associated_token::authority = dc_fee_payer,
  )]
  pub dc_burner: Box<Account<'info, TokenAccount>>,

  /// CHECK: Verified by cpi    
  #[account(mut)]
  pub sub_dao_epoch_info: AccountInfo<'info>,
  /// CHECK: Verified by cpi
  #[account(mut)]
  pub sub_dao: AccountInfo<'info>,

  /// CHECK: Verified by constraint  
  #[account(address = mpl_token_metadata::ID)]
  pub token_metadata_program: AccountInfo<'info>,
  /// CHECK: Verified by constraint  
  #[account(address = data_credits::ID)]
  pub data_credits_program: AccountInfo<'info>,
  pub helium_sub_daos_program: Program<'info, HeliumSubDaos>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub clock: Sysvar<'info, Clock>,
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
  fn burn_dc_ctx(&self) -> CpiContext<'_, '_, '_, 'info, BurnFromIssuanceV0<'info>> {
    let cpi_accounts = BurnFromIssuanceV0 {
      burn_accounts: BurnCommonV0 {
        data_credits: self.dc.to_account_info(),
        burner: self.dc_burner.to_account_info(),
        owner: self.dc_fee_payer.to_account_info(),
        dc_mint: self.dc_mint.to_account_info(),
        token_program: self.token_program.to_account_info(),
        associated_token_program: self.associated_token_program.to_account_info(),
        rent: self.rent.to_account_info(),
        system_program: self.system_program.to_account_info(),
      },
      authority: self.hotspot_config.to_account_info(),
    };
    CpiContext::new(self.data_credits_program.to_account_info(), cpi_accounts)
  }
  fn add_device_ctx(&self) -> CpiContext<'_, '_, '_, 'info, TrackAddedDeviceV0<'info>> {
    let cpi_accounts = TrackAddedDeviceV0 {
      payer: self.payer.to_account_info(),
      sub_dao_epoch_info: self.sub_dao_epoch_info.to_account_info(),
      sub_dao: self.sub_dao.to_account_info(),
      authority: self.hotspot_config.to_account_info(),
      system_program: self.system_program.to_account_info(),
      clock: self.clock.to_account_info(),
      rent: self.rent.to_account_info(),
    };
    CpiContext::new(self.helium_sub_daos_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<IssueHotspotV0>, args: IssueHotspotArgsV0) -> Result<()> {
  let decoded = bs58::encode(args.ecc_compact.clone()).into_string();
  let animal_name: AnimalName = decoded
    .parse()
    .map_err(|_| error!(ErrorCode::InvalidEccCompact))?;

  let signer_seeds: &[&[&[u8]]] = &[&[
    b"hotspot_issuer",
    ctx.accounts.hotspot_config.to_account_info().key.as_ref(),
    ctx.accounts.maker.to_account_info().key.as_ref(),
    &[ctx.accounts.hotspot_issuer.bump_seed],
  ]];

  let hotspot_config_seeds: &[&[&[u8]]] = &[&[
    b"hotspot_config",
    ctx.accounts.hotspot_config.sub_dao.as_ref(),
    ctx.accounts.hotspot_config.symbol.as_bytes(),
    &[ctx.accounts.hotspot_config.bump_seed],
  ]];
  burn_from_issuance_v0(
    ctx.accounts.burn_dc_ctx().with_signer(hotspot_config_seeds),
    BurnFromIssuanceArgsV0 {
      amount: ctx.accounts.hotspot_config.dc_fee,
      symbol: ctx.accounts.hotspot_config.symbol.clone(),
      sub_dao: ctx.accounts.hotspot_config.sub_dao,
      authority_bump: ctx.accounts.hotspot_config.bump_seed,
    },
  )?;

  token::mint_to(ctx.accounts.mint_ctx().with_signer(signer_seeds), 1)?;

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
      signer_seeds,
    ),
    CreateMetadataAccountArgs {
      name: animal_name.to_string(),
      symbol: String::from("HOTSPOT"),
      uri: args.uri,
      collection: Some(Collection {
        key: ctx.accounts.collection.key(),
        verified: false,
      }),
      collection_details: None,
    },
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
      signer_seeds,
    ),
    CreateMasterEditionArgs {
      max_supply: Some(0),
    },
  )?;

  verify_sized_collection_item(
    CpiContext::new_with_signer(
      ctx.accounts.token_metadata_program.clone(),
      VerifySizedCollectionItem {
        metadata: ctx.accounts.metadata.to_account_info().clone(),
        collection_authority: ctx.accounts.hotspot_config.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        collection_mint: ctx.accounts.collection.to_account_info().clone(),
        collection_metadata: ctx.accounts.collection_metadata.to_account_info().clone(),
        collection_master_edition_account: ctx
          .accounts
          .collection_master_edition
          .to_account_info()
          .clone(),
      },
      hotspot_config_seeds,
    ),
    VerifySizedCollectionItemArgs {
      collection_authority_record: None,
    },
  )?;

  track_added_device_v0(
    ctx
      .accounts
      .add_device_ctx()
      .with_signer(hotspot_config_seeds),
    TrackAddedDeviceArgsV0 {
      authority_bump: ctx.accounts.hotspot_config.bump_seed,
      symbol: ctx.accounts.hotspot_config.symbol.clone(),
    },
  )?;

  ctx.accounts.hotspot_issuer.count += 1;

  ctx.accounts.storage.set_inner(HotspotStorageV0 {
    ecc_compact: args.ecc_compact,
    location: None,
    elevation: None,
    gain: None,
    location_asserted: false,
    elevation_asserted: false,
    gain_asserted: false,
    authority: ctx.accounts.hotspot.key(),
    is_full_hotspot: args.is_full_hotspot,

    bump_seed: ctx.bumps["storage"],
  });

  Ok(())
}
