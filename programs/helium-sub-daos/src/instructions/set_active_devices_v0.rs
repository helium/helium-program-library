use crate::state::*;
use anchor_lang::prelude::*;
use shared_utils::{current_epoch, resize_to_fit};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct SetActiveDevicesArgsV0 {
  pub oracle_index: u16,
  pub active_devices: u32,
}

#[derive(Accounts)]
#[instruction(args: SetActiveDevicesArgsV0)]
pub struct SetActiveDevicesV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    constraint = oracle.key() == dao.active_device_oracles[usize::try_from(args.oracle_index).unwrap()].oracle
  )]
  pub oracle: Signer<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    space = std::cmp::max(8 + std::mem::size_of::<SubDaoEpochInfoV0>(), sub_dao_epoch_info.data.borrow_mut().len()),
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(),  &current_epoch(Clock::get()?.unix_timestamp).to_le_bytes()], // Break into 30m epochs
    bump,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    has_one = dao
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SetActiveDevicesV0>, args: SetActiveDevicesArgsV0) -> Result<()> {
  if ctx.accounts.sub_dao_epoch_info.current_config_version != ctx.accounts.dao.config_version
    || ctx.accounts.sub_dao_epoch_info.active_devices.len() == 0
  {
    ctx.accounts.sub_dao_epoch_info.current_config_version = ctx.accounts.dao.config_version;
    ctx.accounts.sub_dao_epoch_info.active_devices =
      vec![None; ctx.accounts.dao.active_device_oracles.len()];
  }

  ctx.accounts.sub_dao_epoch_info.active_devices[usize::try_from(args.oracle_index).unwrap()] =
    Some(args.active_devices);

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.sub_dao_epoch_info,
  )?;

  Ok(())
}
