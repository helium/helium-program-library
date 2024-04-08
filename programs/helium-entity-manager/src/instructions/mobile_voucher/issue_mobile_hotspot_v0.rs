use crate::error::ErrorCode;
use crate::issue_entity::common::*;
use crate::state::*;
use crate::IssueEntityArgsV0;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use helium_sub_daos::SubDaoV0;

#[derive(Accounts)]
#[instruction(args: IssueEntityArgsV0)]
pub struct IssueMobileHotspotV0<'info> {
  pub issue_entity_common: IssueEntityCommonV0<'info>,
  #[account(mut)]
  /// CHECK: Just getting refunded
  pub refund: AccountInfo<'info>,
  #[account(
    mut,
    has_one = verified_owner,
    has_one = rewardable_entity_config,
    has_one = refund,
    close = refund,
    constraint = voucher.maker == issue_entity_common.maker.key(),
    constraint = voucher.paid_dc && voucher.paid_mobile @ ErrorCode::VoucherNotPaid,
    seeds = [
      "mobile_hotspot_voucher".as_bytes(),
      voucher.rewardable_entity_config.as_ref(),
      &hash(&args.entity_key[..]).to_bytes()
    ],
    bump = voucher.bump_seed,
  )]
  pub voucher: Box<Account<'info, MobileHotspotVoucherV0>>,
  #[account(
    has_one = sub_dao
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  #[account(
    constraint = sub_dao.dao == issue_entity_common.dao.key(),
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub verified_owner: Signer<'info>,
  #[account(
    init,
    payer = issue_entity_common.payer,
    space = MOBILE_HOTSPOT_INFO_SIZE,
    seeds = [
      b"mobile_info", 
      rewardable_entity_config.key().as_ref(),
      &hash(&args.entity_key[..]).to_bytes()
    ],
    bump,
  )]
  pub mobile_info: Box<Account<'info, MobileHotspotInfoV0>>,
  // This can't be in common accounts because there's a bug with anchor where you can't use #[instruction(...)] in those.
  #[account(
    init_if_needed,
    payer = issue_entity_common.payer,
    space = 8 + std::mem::size_of::<KeyToAssetV0>() + 1 + args.entity_key.len(),
    seeds = [
      "key_to_asset".as_bytes(),
      issue_entity_common.dao.key().as_ref(),
      &hash(&args.entity_key[..]).to_bytes()
    ],
    bump
  )]
  pub key_to_asset: Box<Account<'info, KeyToAssetV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<IssueMobileHotspotV0>, args: IssueEntityArgsV0) -> Result<()> {
  // Issue entity only if needed
  if ctx.accounts.key_to_asset.dao == Pubkey::default() {
    ctx.accounts.issue_entity_common.issue_entity(
      ctx.bumps,
      &mut ctx.accounts.key_to_asset,
      args,
    )?;
  }

  Ok(())
}
