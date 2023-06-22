use crate::{error::ErrorCode, state::*};
use anchor_lang::prelude::*;
use helium_sub_daos::{
  cpi::{accounts::TrackDcOnboardingFeesV0, track_dc_onboarding_fees_v0},
  program::HeliumSubDaos,
  SubDaoV0, TrackDcOnboardingFeesArgsV0,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TempBackfillActiveArgsV0 {
  pub is_active: bool,
}

#[derive(Accounts)]
#[instruction(args: TempBackfillActiveArgsV0)]
pub struct TempBackfillActiveV0<'info> {
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

pub fn handler(ctx: Context<TempBackfillActiveV0>, args: TempBackfillActiveArgsV0) -> Result<()> {
  // All the remaining accounts are entity info accounts
  let info_accs_raw = ctx.remaining_accounts.to_vec();

  let is_mobile = ctx.accounts.rewardable_entity_config.settings.is_mobile();
  let is_iot = ctx.accounts.rewardable_entity_config.settings.is_iot();
  for info_acc in info_accs_raw {
    let mut info_data = info_acc.try_borrow_mut_data()?;

    let onboarding_fee: u64;
    if is_iot {
      let mut info = IotHotspotInfoV0::try_deserialize(&mut info_data.as_ref())?;
      onboarding_fee = if info.is_full_hotspot {
        4000000
      } else {
        1000000
      };

      info.is_active = args.is_active;
      info.dc_onboarding_fee_paid = onboarding_fee;

      info.try_serialize(&mut *info_data)?;
    } else if is_mobile {
      // onboarding fee doesn't need to be set because default is 0
      let mut info = MobileHotspotInfoV0::try_deserialize(&mut info_data.as_ref())?;
      info.is_active = args.is_active;
      info.try_serialize(&mut *info_data)?;
      continue;
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
          amount: onboarding_fee,
          add: true,
        },
      )?;
    }
  }
  Ok(())
}
