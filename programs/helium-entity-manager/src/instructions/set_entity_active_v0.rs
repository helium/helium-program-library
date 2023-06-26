use crate::{error::ErrorCode, state::*};
use anchor_lang::prelude::*;
use helium_sub_daos::{
  cpi::{accounts::TrackDcOnboardingFeesV0, track_dc_onboarding_fees_v0},
  program::HeliumSubDaos,
  SubDaoV0, TrackDcOnboardingFeesArgsV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct SetEntityActiveArgsV0 {
  pub is_active: bool,
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
  pub helium_sub_daos_program: Program<'info, HeliumSubDaos>,
}

/// Modify active status of a batch of entity info accounts. Only allows info accounts from one subdao at a time.
pub fn handler(ctx: Context<SetEntityActiveV0>, args: SetEntityActiveArgsV0) -> Result<()> {
  // All the remaining accounts are entity info accounts
  let info_accs_raw = ctx.remaining_accounts.to_vec();

  let is_mobile = ctx.accounts.rewardable_entity_config.settings.is_mobile();
  let is_iot = ctx.accounts.rewardable_entity_config.settings.is_iot();
  for info_acc in info_accs_raw {
    let mut info_data = info_acc.try_borrow_mut_data()?;

    let dc_fee: u64;
    if is_iot {
      let mut info = IotHotspotInfoV0::try_deserialize(&mut info_data.as_ref())?;
      if info.is_active == args.is_active {
        continue;
      }
      info.is_active = args.is_active;
      info.try_serialize(&mut *info_data)?;
      dc_fee = info.dc_onboarding_fee_paid;
    } else if is_mobile {
      let mut info = MobileHotspotInfoV0::try_deserialize(&mut info_data.as_ref())?;
      if info.is_active == args.is_active {
        continue;
      }
      info.is_active = args.is_active;
      info.try_serialize(&mut *info_data)?;
      dc_fee = info.dc_onboarding_fee_paid;
    } else {
      return Err(ErrorCode::InvalidSettings.into());
    }

    if args.is_active {
      track_dc_onboarding_fees_v0(
        CpiContext::new_with_signer(
          ctx.accounts.helium_sub_daos_program.to_account_info(),
          TrackDcOnboardingFeesV0 {
            hem_auth: ctx.accounts.rewardable_entity_config.to_account_info(),
            sub_dao: ctx.accounts.sub_dao.to_account_info(),
          },
          &[&[
            "rewardable_entity_config".as_bytes(),
            ctx.accounts.sub_dao.key().as_ref(),
            ctx.accounts.rewardable_entity_config.symbol.as_bytes(),
            &[ctx.accounts.rewardable_entity_config.bump_seed],
          ]],
        ),
        TrackDcOnboardingFeesArgsV0 {
          amount: dc_fee,
          add: true,
          symbol: ctx.accounts.rewardable_entity_config.symbol.clone(),
        },
      )?;
    } else {
      track_dc_onboarding_fees_v0(
        CpiContext::new_with_signer(
          ctx.accounts.helium_sub_daos_program.to_account_info(),
          TrackDcOnboardingFeesV0 {
            hem_auth: ctx.accounts.rewardable_entity_config.to_account_info(),
            sub_dao: ctx.accounts.sub_dao.to_account_info(),
          },
          &[&[
            "rewardable_entity_config".as_bytes(),
            ctx.accounts.sub_dao.key().as_ref(),
            ctx.accounts.rewardable_entity_config.symbol.as_bytes(),
            &[ctx.accounts.rewardable_entity_config.bump_seed],
          ]],
        ),
        TrackDcOnboardingFeesArgsV0 {
          amount: dc_fee,
          add: false,
          symbol: ctx.accounts.rewardable_entity_config.symbol.clone(),
        },
      )?;
    }
  }
  Ok(())
}
