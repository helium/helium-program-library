use crate::{
  error::ErrorCode, iot_info_seeds, mobile_info_seeds, rewardable_entity_config_seeds, state::*,
  TESTING,
};
use anchor_lang::{prelude::*, solana_program::hash::hash};
use helium_sub_daos::{
  cpi::{accounts::TrackDcOnboardingFeesV0, track_dc_onboarding_fees_v0},
  program::HeliumSubDaos,
  SubDaoV0, TrackDcOnboardingFeesArgsV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct SetEntityActiveArgsV0 {
  pub is_active: bool,
  pub entity_key: Vec<u8>,
}

#[derive(Accounts)]
#[instruction(args: SetEntityActiveArgsV0)]
pub struct SetEntityActiveV0<'info> {
  pub active_device_authority: Signer<'info>,
  #[account(
    has_one = sub_dao,
  )]
  pub rewardable_entity_config: Box<Account<'info, RewardableEntityConfigV0>>,
  #[account(
    mut,
    has_one = active_device_authority,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  /// CHECK: seeds are checked in the handler
  #[account(mut)]
  pub info: UncheckedAccount<'info>,
  pub helium_sub_daos_program: Program<'info, HeliumSubDaos>,
}

pub fn handler(ctx: Context<SetEntityActiveV0>, args: SetEntityActiveArgsV0) -> Result<()> {
  let is_mobile = ctx.accounts.rewardable_entity_config.settings.is_mobile()
    && (ctx.accounts.rewardable_entity_config.symbol == "MOBILE" || TESTING);
  let is_iot = ctx.accounts.rewardable_entity_config.settings.is_iot()
    && (ctx.accounts.rewardable_entity_config.symbol == "IOT" || TESTING);

  let mut info_data = ctx.accounts.info.try_borrow_mut_data()?;
  let dc_fee: u64;
  if is_iot {
    let mut info = IotHotspotInfoV0::try_deserialize(&mut info_data.as_ref())?;
    let expected_pda = Pubkey::create_program_address(
      iot_info_seeds!(info, ctx.accounts.rewardable_entity_config, args.entity_key),
      &crate::id(),
    )
    .map_err(|_| error!(ErrorCode::InvalidSeeds))?;
    require!(
      expected_pda == ctx.accounts.info.key(),
      ErrorCode::InvalidAccountAddress
    );
    if info.is_active == args.is_active {
      return Ok(());
    }
    info.is_active = args.is_active;
    info.try_serialize(&mut *info_data)?;
    dc_fee = info.dc_onboarding_fee_paid;
  } else if is_mobile {
    let mut info = MobileHotspotInfoV0::try_deserialize(&mut info_data.as_ref())?;
    let expected_pda = Pubkey::create_program_address(
      mobile_info_seeds!(info, ctx.accounts.rewardable_entity_config, args.entity_key),
      &crate::id(),
    )
    .map_err(|_| error!(ErrorCode::InvalidSeeds))?;
    require!(
      expected_pda == ctx.accounts.info.key(),
      ErrorCode::InvalidAccountAddress
    );
    if info.is_active == args.is_active {
      return Ok(());
    }
    info.is_active = args.is_active;
    info.try_serialize(&mut *info_data)?;
    dc_fee = info.dc_onboarding_fee_paid;
  } else {
    return Err(ErrorCode::InvalidSettings.into());
  }

  track_dc_onboarding_fees_v0(
    CpiContext::new_with_signer(
      ctx.accounts.helium_sub_daos_program.to_account_info(),
      TrackDcOnboardingFeesV0 {
        hem_auth: ctx.accounts.rewardable_entity_config.to_account_info(),
        sub_dao: ctx.accounts.sub_dao.to_account_info(),
      },
      &[rewardable_entity_config_seeds!(
        ctx.accounts.rewardable_entity_config
      )],
    ),
    TrackDcOnboardingFeesArgsV0 {
      amount: dc_fee,
      add: args.is_active,
      symbol: ctx.accounts.rewardable_entity_config.symbol.clone(),
    },
  )?;

  Ok(())
}
