use crate::error::ErrorCode;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
};
use data_credits::{
  cpi::{
    accounts::{BurnCommonV0, BurnWithoutTrackingV0},
    burn_without_tracking_v0,
  },
  BurnWithoutTrackingArgsV0, DataCreditsV0,
};
use mpl_token_metadata::state::{Metadata, TokenMetadataAccount};
use std::str::FromStr;

pub const TESTING: bool = std::option_env!("TESTING").is_some();
const DC_MINT: &str = "8po3rj3xE1wo5y38zW8gH2ZoTZzqowMAuD1ugBpUKj32";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ChangeMetadataArgsV0 {
  pub location: Option<u64>,
  pub elevation: Option<i32>,
  pub gain: Option<i32>,
}

#[derive(Accounts)]
#[instruction(args: ChangeMetadataArgsV0)]
pub struct ChangeMetadataV0<'info> {
  pub hotspot: Box<Account<'info, Mint>>,
  #[account(
    mut,
    seeds = [
      "storage".as_bytes(),
      hotspot.key().as_ref()
    ],
    bump
  )]
  pub storage: Box<Account<'info, HotspotStorageV0>>,
  #[account(mut)]
  pub hotspot_owner: Signer<'info>,
  #[account(
    associated_token::mint = hotspot,
    associated_token::authority = hotspot_owner,
    constraint = owner_hotspot_ata.amount == 1,
  )]
  pub owner_hotspot_ata: Box<Account<'info, TokenAccount>>,

  #[account(
    mut,
    associated_token::mint = dc_mint,
    associated_token::authority = hotspot_owner,
  )]
  pub owner_dc_ata: Box<Account<'info, TokenAccount>>,

  /// CHECK: seeds checked and verification in handler
  #[account(
    seeds = ["metadata".as_bytes(), token_metadata_program.key().as_ref(), hotspot.key().as_ref()],
    seeds::program = token_metadata_program.key(),
    bump,
  )]
  pub hotspot_metadata: UncheckedAccount<'info>,

  #[account(
    seeds = ["hotspot_config".as_bytes(), hotspot_config.sub_dao.as_ref(), hotspot_config.symbol.as_bytes()],
    bump,
    constraint = args.gain.is_none() || (args.gain.unwrap() <= hotspot_config.max_gain && args.gain.unwrap() >= hotspot_config.min_gain) @ ErrorCode::InvalidGain
  )]
  pub hotspot_config: Box<Account<'info, HotspotConfigV0>>,

  #[account(
    mut,
    constraint = TESTING || (dc_mint.key() == Pubkey::from_str(DC_MINT).unwrap())
  )]
  pub dc_mint: Box<Account<'info, Mint>>,

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

  /// CHECK: Checked with constraints
  #[account(address = mpl_token_metadata::ID)]
  pub token_metadata_program: AccountInfo<'info>,
  /// CHECK: Checked with constraints
  #[account(address = data_credits::ID)]
  pub data_credits_program: AccountInfo<'info>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub rent: Sysvar<'info, Rent>,
  pub system_program: Program<'info, System>,
}

impl<'info> ChangeMetadataV0<'info> {
  pub fn burn_ctx(&self) -> CpiContext<'_, '_, '_, 'info, BurnWithoutTrackingV0<'info>> {
    let cpi_accounts = BurnWithoutTrackingV0 {
      burn_accounts: BurnCommonV0 {
        data_credits: self.dc.to_account_info(),
        burner: self.owner_dc_ata.to_account_info(),
        owner: self.hotspot_owner.to_account_info(),
        dc_mint: self.dc_mint.to_account_info(),
        token_program: self.token_program.to_account_info(),
        associated_token_program: self.associated_token_program.to_account_info(),
        rent: self.rent.to_account_info(),
        system_program: self.system_program.to_account_info(),
      },
    };

    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler(ctx: Context<ChangeMetadataV0>, args: ChangeMetadataArgsV0) -> Result<()> {
  let metadata: Metadata =
    Metadata::from_account_info(&ctx.accounts.hotspot_metadata.to_account_info())?;
  require!(
    metadata.collection.unwrap().key == ctx.accounts.hotspot_config.collection,
    ErrorCode::InvalidHotspotCollection
  );

  if args.location.is_some() {
    let mut dc_fee: u64 = ctx.accounts.hotspot_config.dataonly_location_staking_fee;
    if ctx.accounts.storage.is_full_hotspot {
      dc_fee = ctx.accounts.hotspot_config.full_location_staking_fee;
    }

    // burn the dc tokens
    burn_without_tracking_v0(
      ctx.accounts.burn_ctx(),
      BurnWithoutTrackingArgsV0 { amount: dc_fee },
    )?;
    ctx.accounts.storage.location = args.location;
  }
  if args.elevation.is_some() {
    ctx.accounts.storage.elevation = args.elevation;
  }
  if args.gain.is_some() {
    ctx.accounts.storage.gain = args.gain;
  }
  Ok(())
}
