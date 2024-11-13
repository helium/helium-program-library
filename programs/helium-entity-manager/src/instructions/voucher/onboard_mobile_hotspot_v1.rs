use account_compression_cpi::program::SplAccountCompression;
use anchor_lang::{prelude::*, solana_program::hash::hash};
use bubblegum_cpi::get_asset_id;
use helium_sub_daos::DaoV0;
use shared_utils::{verify_compressed_nft, VerifyCompressedNftArgs};

use crate::{
  error::ErrorCode, KeyToAssetV0, MakerApprovalV0, MakerV0, MobileDeploymentInfoV0,
  MobileHotspotInfoV0, MobileHotspotVoucherV0, RewardableEntityConfigV0, MOBILE_HOTSPOT_INFO_SIZE,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OnboardMobileHotspotArgsV1 {
  pub data_hash: [u8; 32],
  pub creator_hash: [u8; 32],
  pub root: [u8; 32],
  pub index: u32,
  pub deployment_info: Option<MobileDeploymentInfoV0>,
}

#[derive(Accounts)]
#[instruction(args: OnboardMobileHotspotArgsV1)]
pub struct OnboardMobileHotspotV1<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(mut)]
  /// CHECK: Just getting refunded
  pub refund: AccountInfo<'info>,
  #[account(
    has_one = dao,
  )]
  pub maker: Box<Account<'info, MakerV0>>,
  #[account(
    seeds = ["maker_approval".as_bytes(), rewardable_entity_config.key().as_ref(), maker.key().as_ref()],
    bump = maker_approval.bump_seed,
    has_one = maker,
    has_one = rewardable_entity_config,
  )]
  pub maker_approval: Box<Account<'info, MakerApprovalV0>>,
  #[account(
    mut,
    has_one = rewardable_entity_config,
    has_one = refund,
    has_one = maker,
    close = refund,
    constraint = mobile_voucher.paid @ ErrorCode::VoucherNotPaid,
    seeds = [
      "mobile_hotspot_voucher".as_bytes(),
      mobile_voucher.rewardable_entity_config.as_ref(),
      &hash(&key_to_asset.entity_key[..]).to_bytes()
    ],
    bump = mobile_voucher.bump_seed,
  )]
  pub mobile_voucher: Box<Account<'info, MobileHotspotVoucherV0>>,
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  #[account(
    init,
    payer = payer,
    space = MOBILE_HOTSPOT_INFO_SIZE,
    seeds = [
      b"mobile_info", 
      rewardable_entity_config.key().as_ref(),
      &hash(&key_to_asset.entity_key[..]).to_bytes()
    ],
    bump,
  )]
  pub mobile_info: Box<Account<'info, MobileHotspotInfoV0>>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    has_one = dao,
    constraint = get_asset_id(&merkle_tree.key(), args.index.into()) == key_to_asset.asset
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  /// CHECK: The merkle tree
  pub merkle_tree: UncheckedAccount<'info>,
  pub hotspot_owner: Signer<'info>,
  pub compression_program: Program<'info, SplAccountCompression>,
  pub system_program: Program<'info, System>,
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, OnboardMobileHotspotV1<'info>>,
  args: OnboardMobileHotspotArgsV1,
) -> Result<()> {
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

  ctx.accounts.mobile_info.set_inner(MobileHotspotInfoV0 {
    asset: ctx.accounts.key_to_asset.asset,
    bump_seed: ctx.bumps["mobile_info"],
    location: None,
    is_full_hotspot: true,
    num_location_asserts: 0,
    is_active: false,
    dc_onboarding_fee_paid: ctx.accounts.mobile_voucher.dc_paid,
    device_type: ctx.accounts.mobile_voucher.device_type,
    deployment_info: args.deployment_info,
  });

  Ok(())
}
