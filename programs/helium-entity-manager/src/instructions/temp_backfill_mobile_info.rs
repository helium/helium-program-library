use crate::state::*;
use anchor_lang::prelude::*;
use shared_utils::*;
use std::str::FromStr;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TempBackfillMobileInfoArgs {
  pub deployment_info: Option<MobileDeploymentInfoV0>,
}

#[derive(Accounts)]
#[instruction(args: TempBackfillMobileInfoArgs)]
pub struct TempBackfillMobileInfo<'info> {
  #[account(
    mut,
    address = Pubkey::from_str("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW").unwrap()
  )]
  pub payer: Signer<'info>,
  #[account(mut)]
  pub mobile_info: Box<Account<'info, MobileHotspotInfoV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, TempBackfillMobileInfo<'info>>,
  args: TempBackfillMobileInfoArgs,
) -> Result<()> {
  if let Some(deployment_info) = args.deployment_info {
    ctx.accounts.mobile_info.deployment_info = Some(deployment_info);
  }

  resize_to_fit(
    &ctx.accounts.payer,
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.mobile_info,
  )?;

  Ok(())
}
