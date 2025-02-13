use account_compression_cpi::account_compression::program::SplAccountCompression;
use anchor_lang::{prelude::*, solana_program::hash::hash};
use anchor_spl::{
  associated_token::AssociatedToken,
  token::{Mint, Token, TokenAccount},
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

use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct OnboardDataOnlyIotHotspotArgsV0 {
  pub data_hash: [u8; 32],
  pub creator_hash: [u8; 32],
  pub root: [u8; 32],
  pub index: u32,
  pub location: Option<u64>,
  pub elevation: Option<i32>,
  pub gain: Option<i32>,
}

pub fn hash_entity_key(name: &[u8]) -> [u8; 32] {
  hash(name).to_bytes()
}

#[derive(Accounts)]
#[instruction(args: OnboardDataOnlyIotHotspotArgsV0)]
pub struct OnboardDataOnlyIotHotspotV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(mut)]
  pub dc_fee_payer: Signer<'info>,
  #[account(
    init,
    payer = payer,
    space = IOT_HOTSPOT_INFO_SIZE,
    seeds = [
      b"iot_info", 
      rewardable_entity_config.key().as_ref(),
      &hash_entity_key(&key_to_asset.entity_key[..])
    ],
    bump,
  )]
  pub iot_info: Box<Account<'info, IotHotspotInfoV0>>,
  #[account(mut)]
  pub hotspot_owner: Signer<'info>,
  /// CHECK: The merkle tree
  pub merkle_tree: UncheckedAccount<'info>,
  #[account(
    mut,
    associated_token::mint = dc_mint,
    associated_token::authority = dc_fee_payer,
  )]
  pub dc_burner: Box<Account<'info, TokenAccount>>,

  #[account(
    has_one = sub_dao,
    constraint = rewardable_entity_config.settings.validate_iot_gain(args.gain),
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,

  #[account(
    seeds = ["data_only_config".as_bytes(), dao.key().as_ref()],
    bump,
    has_one = merkle_tree,
    has_one = dao,
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
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(mut)]
  pub dc_mint: Box<Account<'info, Mint>>,

  #[account(
    seeds = [
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

impl<'info> OnboardDataOnlyIotHotspotV0<'info> {
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
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, OnboardDataOnlyIotHotspotV0<'info>>,
  args: OnboardDataOnlyIotHotspotArgsV0,
) -> Result<()> {
  let asset_id = get_asset_id(&ctx.accounts.merkle_tree.key(), args.index.into());
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

  let mut dc_fee = ctx.accounts.sub_dao.onboarding_data_only_dc_fee;
  ctx.accounts.iot_info.set_inner(IotHotspotInfoV0 {
    asset: asset_id,
    bump_seed: ctx.bumps.iot_info,
    location: None,
    elevation: args.elevation,
    gain: args.gain,
    is_full_hotspot: false,
    num_location_asserts: 0,
    is_active: false,
    dc_onboarding_fee_paid: dc_fee,
  });

  if let (
    Some(location),
    ConfigSettingsV0::IotConfig {
      dataonly_location_staking_fee,
      ..
    },
  ) = (
    args.location,
    &ctx.accounts.rewardable_entity_config.settings,
  ) {
    dc_fee = dataonly_location_staking_fee.checked_add(dc_fee).unwrap();

    ctx.accounts.iot_info.location = Some(location);
    ctx.accounts.iot_info.num_location_asserts = ctx
      .accounts
      .iot_info
      .num_location_asserts
      .checked_add(1)
      .unwrap();
  }

  burn_without_tracking_v0(
    ctx.accounts.burn_ctx(),
    BurnWithoutTrackingArgsV0 { amount: dc_fee },
  )?;

  Ok(())
}
