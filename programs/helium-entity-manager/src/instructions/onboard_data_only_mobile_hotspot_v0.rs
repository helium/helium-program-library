use std::str::FromStr;

use account_compression_cpi::account_compression::program::SplAccountCompression;
use anchor_lang::prelude::*;
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Burn, Mint, Token},
};
use bubblegum_cpi::get_asset_id;
use data_credits::{
  cpi::{
    accounts::{BurnCommonV0, BurnWithoutTrackingV0},
    burn_without_tracking_v0,
  },
  program::DataCredits,
  BurnWithoutTrackingArgsV0, DataCreditsV0,
};
use helium_sub_daos::{program::HeliumSubDaos, DaoV0, SubDaoV0};
use shared_utils::*;

use crate::{error::ErrorCode, hash_entity_key, state::*, TESTING};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OnboardDataOnlyMobileHotspotArgsV0 {
  pub data_hash: [u8; 32],
  pub creator_hash: [u8; 32],
  pub root: [u8; 32],
  pub index: u32,
  pub location: Option<u64>,
}

#[derive(Accounts)]
#[instruction(args: OnboardDataOnlyMobileHotspotArgsV0)]
pub struct OnboardDataOnlyMobileHotspotV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(mut)]
  pub dc_fee_payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = MOBILE_HOTSPOT_INFO_SIZE,
    seeds = [
      b"mobile_info",
      rewardable_entity_config.key().as_ref(),
      &hash_entity_key(&key_to_asset.entity_key[..])
    ],
    bump,
  )]
  pub mobile_info: Box<Account<'info, MobileHotspotInfoV0>>,
  #[account(mut)]
  pub hotspot_owner: Signer<'info>,
  /// CHECK: The merkle tree
  pub merkle_tree: UncheckedAccount<'info>,
  /// CHECK: Only loaded if location is being asserted
  #[account(mut)]
  pub dc_burner: UncheckedAccount<'info>,
  /// CHECK: Checked by spl token when the burn command is issued (which it may not be)
  #[account(mut)]
  pub dnt_burner: UncheckedAccount<'info>,

  #[account(
    has_one = sub_dao,
    constraint = rewardable_entity_config.settings.is_mobile()
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,

  #[account(
    seeds = ["data_only_config".as_bytes(), dao.key().as_ref()],
    bump,
    has_one = merkle_tree,
  )]
  pub data_only_config: Box<Account<'info, DataOnlyConfigV0>>,
  #[account(
    has_one = dc_mint,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao,
    constraint = get_asset_id(&merkle_tree.key(), args.index.into()) == key_to_asset.asset,
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  #[account(
    mut,
    has_one = dao,
    has_one = dnt_mint,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,
  #[account(mut)]
  pub dnt_mint: Box<Account<'info, Mint>>,
  /// CHECK: Deprecated account, not used anymore.
  #[account(
    address = Pubkey::from_str("DQ4C1tzvu28cwo1roN1Wm6TW35sfJEjLh517k3ZeWevx").unwrap(),
  )]
  pub dnt_price: AccountInfo<'info>,

  #[account(
    seeds=[
      "dc".as_bytes(),
      dc_mint.key().as_ref()
    ],
    seeds::program = data_credits_program.key(),
    bump = dc.data_credits_bump,
    has_one = dc_mint
  )]
  pub dc: Account<'info, DataCreditsV0>,

  pub compression_program: Program<'info, SplAccountCompression>,
  pub data_credits_program: Program<'info, DataCredits>,
  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
  pub helium_sub_daos_program: Program<'info, HeliumSubDaos>,
}

impl<'info> OnboardDataOnlyMobileHotspotV0<'info> {
  pub fn burn_ctx(&self) -> CpiContext<'_, '_, '_, 'info, BurnWithoutTrackingV0<'info>> {
    let cpi_accounts = BurnWithoutTrackingV0 {
      burn_accounts: BurnCommonV0 {
        data_credits: self.dc.to_account_info(),
        burner: self.dc_burner.to_account_info(),
        owner: self.dc_fee_payer.to_account_info(),
        dc_mint: self.dc_mint.to_account_info(),
        token_program: self.token_program.to_account_info(),
        associated_token_program: self.associated_token_program.to_account_info(),
        system_program: self.system_program.to_account_info(),
      },
    };

    CpiContext::new(self.data_credits_program.to_account_info(), cpi_accounts)
  }

  pub fn mobile_burn_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Burn<'info>> {
    let cpi_accounts = Burn {
      mint: self.dnt_mint.to_account_info(),
      from: self.dnt_burner.to_account_info(),
      authority: self.payer.to_account_info(),
    };

    CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
  }
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, OnboardDataOnlyMobileHotspotV0<'info>>,
  args: OnboardDataOnlyMobileHotspotArgsV0,
) -> Result<()> {
  let asset_id = get_asset_id(&ctx.accounts.merkle_tree.key(), u64::from(args.index));

  verify_compressed_nft(VerifyCompressedNftArgs {
    data_hash: args.data_hash,
    creator_hash: args.creator_hash,
    root: args.root,
    index: args.index,
    compression_program: ctx.accounts.compression_program.to_account_info(),
    merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
    owner: ctx.accounts.hotspot_owner.key(),
    delegate: ctx.accounts.hotspot_owner.key(),
    proof_accounts: ctx.remaining_accounts.to_vec(),
  })?;

  let fees = ctx
    .accounts
    .rewardable_entity_config
    .settings
    .mobile_device_fees(MobileDeviceTypeV0::WifiDataOnly)
    .ok_or(error!(ErrorCode::InvalidDeviceType))?;
  let mut dc_fee = fees.dc_onboarding_fee;
  let location_fee = fees.location_staking_fee;

  ctx.accounts.mobile_info.set_inner(MobileHotspotInfoV0 {
    asset: asset_id,
    bump_seed: ctx.bumps.mobile_info,
    location: None,
    is_full_hotspot: false,
    num_location_asserts: 0,
    is_active: false,
    dc_onboarding_fee_paid: fees.dc_onboarding_fee,
    device_type: MobileDeviceTypeV0::WifiDataOnly,
    deployment_info: None,
  });

  if let Some(location) = args.location {
    dc_fee = location_fee.checked_add(dc_fee).unwrap();

    ctx.accounts.mobile_info.location = Some(location);
    ctx.accounts.mobile_info.num_location_asserts = ctx
      .accounts
      .mobile_info
      .num_location_asserts
      .checked_add(1)
      .unwrap();
  }

  // burn the dc tokens
  burn_without_tracking_v0(
    ctx.accounts.burn_ctx(),
    BurnWithoutTrackingArgsV0 { amount: dc_fee },
  )?;

  resize_to_fit(
    &ctx.accounts.payer,
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.mobile_info,
  )?;

  Ok(())
}
