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
use data_credits::{
  cpi::{accounts::BurnDataCreditsV0, burn_data_credits_v0},
  BurnDataCreditsV0Args, DataCreditsV0,
};
use helium_sub_daos::{
  cpi::{accounts::TrackAddedDeviceV0, track_added_device_v0},
  TrackAddedDeviceArgsV0,
};
use shared_utils::resize_to_fit;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct IssueHotspotV0Args {
  pub ecc_compact: Vec<u8>,
}

#[derive(Accounts)]
#[instruction(args: IssueHotspotV0Args)]
pub struct IssueHotspotV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub dc_fee_payer: Signer<'info>,
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
      &args.ecc_compact,
    ],
    bump
  )]
  pub hotspot: Box<Account<'info, Mint>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = std::cmp::max(8 + std::mem::size_of::<HotspotStorageV0>(), storage.data.borrow_mut().len()),
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
    seeds=["dc".as_bytes()],
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
  pub sub_dao: AccountInfo<'info>,

  /// CHECK: Verified by constraint  
  #[account(address = mpl_token_metadata::ID)]
  pub token_metadata_program: AccountInfo<'info>,
  /// CHECK: Verified by constraint  
  #[account(address = data_credits::ID)]
  pub data_credits_program: AccountInfo<'info>,
  /// CHECK: Verified by constraint  
  #[account(address = helium_sub_daos::ID)]
  pub sub_daos_program: AccountInfo<'info>,
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
  fn burn_dc_ctx(&self) -> CpiContext<'_, '_, '_, 'info, BurnDataCreditsV0<'info>> {
    let cpi_accounts = BurnDataCreditsV0 {
      data_credits: self.dc.to_account_info(),
      burner: self.dc_burner.to_account_info(),
      owner: self.dc_fee_payer.to_account_info(),
      dc_mint: self.dc_mint.to_account_info(),
      token_program: self.token_program.to_account_info(),
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
    CpiContext::new(self.sub_daos_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<IssueHotspotV0>, args: IssueHotspotV0Args) -> Result<()> {
  let decoded = bs58::encode(args.ecc_compact.clone()).into_string();
  let animal_name: AnimalName = decoded
    .parse()
    .map_err(|e| error!(ErrorCode::InvalidEccCompact))?;

  let signer_seeds: &[&[&[u8]]] = &[&[
    b"hotspot_issuer",
    ctx.accounts.hotspot_config.to_account_info().key.as_ref(),
    ctx.accounts.maker.to_account_info().key.as_ref(),
    &[ctx.accounts.hotspot_issuer.bump_seed],
  ]];

  burn_data_credits_v0(
    ctx.accounts.burn_dc_ctx(),
    BurnDataCreditsV0Args {
      amount: ctx.accounts.hotspot_config.dc_fee,
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
      signer_seeds
    ),
    CreateMetadataAccountArgs {
      name: animal_name.to_string(),
      symbol: String::from("HOTSPOT"),
      uri: String::from("https://c3zu2nc2m4x6zvqf5lofrtdbsa4niuh6drvzi7lq4n465ykbd3fa.arweave.net/FvNNNFpnL-zWBercWMxhkDjUUP4ca5R9cON57uFBHso/"),
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
      signer_seeds,
    ),
    CreateMasterEditionArgs {
      max_supply: Some(0),
    },
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
        collection_master_edition_account: ctx
          .accounts
          .collection_master_edition
          .to_account_info()
          .clone(),
      },
      verify_signer_seeds,
    ),
    VerifySizedCollectionItemArgs {
      collection_authority_record: None,
    },
  )?;

  track_added_device_v0(
    ctx.accounts.add_device_ctx().with_signer(&[&[
      b"hotspot_config",
      ctx.accounts.collection.key().as_ref(),
      &[ctx.accounts.hotspot_config.bump_seed],
    ]]),
    TrackAddedDeviceArgsV0 {
      authority_bump: ctx.accounts.hotspot_config.bump_seed,
    },
  )?;

  ctx.accounts.hotspot_issuer.count += 1;

  ctx.accounts.storage.set_inner(HotspotStorageV0 {
    ecc_compact: args.ecc_compact,
    location: None,
    authority: ctx.accounts.hotspot.key(),

    bump_seed: ctx.bumps["storage"],
  });

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.storage,
  )?;

  Ok(())
}
