use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct InitializeMobileHotspotVoucherArgsV0 {
  pub entity_key: Vec<u8>,
  pub key_serialization: KeySerialization,
  pub device_type: MobileDeviceTypeV0,
}

#[derive(Accounts)]
#[instruction(args: InitializeMobileHotspotVoucherArgsV0)]
pub struct InitializeMobileHotspotVoucherV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub issuing_authority: Signer<'info>,
  #[account(
    constraint = rewardable_entity_config.settings.is_mobile(),
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  #[account(
    seeds = ["maker_approval".as_bytes(), rewardable_entity_config.key().as_ref(), maker.key().as_ref()],
    bump = maker_approval.bump_seed,
    has_one = maker,
    has_one = rewardable_entity_config,
  )]
  pub maker_approval: Box<Account<'info, MakerApprovalV0>>,
  #[account(
    mut,
    has_one = issuing_authority,
  )]
  pub maker: Box<Account<'info, MakerV0>>,
  #[account(
    init,
    payer = payer,
    space = 8 + 60 + std::mem::size_of::<MobileHotspotVoucherV0>() + args.entity_key.len(),
    seeds = [
      "mobile_hotspot_voucher".as_bytes(),
      rewardable_entity_config.key().as_ref(),
      &hash(&args.entity_key[..]).to_bytes()
    ],
    bump,
  )]
  pub mobile_hotspot_voucher: Box<Account<'info, MobileHotspotVoucherV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<InitializeMobileHotspotVoucherV0>,
  args: InitializeMobileHotspotVoucherArgsV0,
) -> Result<()> {
  ctx
    .accounts
    .mobile_hotspot_voucher
    .set_inner(MobileHotspotVoucherV0 {
      refund: ctx.accounts.payer.key(),
      rewardable_entity_config: ctx.accounts.rewardable_entity_config.key(),
      entity_key: args.entity_key,
      bump_seed: ctx.bumps["mobile_hotspot_voucher"],
      key_serialization: args.key_serialization,
      device_type: args.device_type,
      paid_mobile: false,
      paid_dc: false,
      maker: ctx.accounts.maker.key(),
      verified_owner: ctx.accounts.issuing_authority.key(),
    });
  Ok(())
}
