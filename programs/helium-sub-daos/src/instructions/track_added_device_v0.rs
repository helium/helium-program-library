use crate::state::*;
use crate::utils::current_epoch;
use anchor_lang::prelude::*;
use std::str::FromStr;

pub const ONBOARD_KEY: &str = "isswTaVr3jpPq4ETgnCu76WQA9XPxPGVANeKzivHefg";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TrackAddedDeviceArgsV0 {
  pub authority_bump: u8,
}

#[derive(Accounts)]
#[instruction(args: TrackAddedDeviceArgsV0)]
pub struct TrackAddedDeviceV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    init_if_needed,
    payer = payer,
    space = 60 + 8 + std::mem::size_of::<SubDaoEpochInfoV0>(),
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(),  &current_epoch(clock.unix_timestamp).to_le_bytes()], // Break into 30m epochs
    bump,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(mut)]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    seeds = ["hotspot_config".as_bytes(), sub_dao.hotspot_collection.as_ref()],
    seeds::program = Pubkey::from_str(ONBOARD_KEY).unwrap(),
    bump = args.authority_bump,
  )]
  pub authority: Signer<'info>,
  pub system_program: Program<'info, System>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<TrackAddedDeviceV0>, _args: TrackAddedDeviceArgsV0) -> Result<()> {
  ctx.accounts.sub_dao_epoch_info.sub_dao = ctx.accounts.sub_dao.key();
  ctx.accounts.sub_dao_epoch_info.bump_seed = *ctx.bumps.get("sub_dao_epoch_info").unwrap();
  ctx.accounts.sub_dao.total_devices += 1;
  ctx.accounts.sub_dao_epoch_info.total_devices = ctx.accounts.sub_dao.total_devices;
  ctx.accounts.sub_dao_epoch_info.epoch = current_epoch(ctx.accounts.clock.unix_timestamp);

  Ok(())
}
