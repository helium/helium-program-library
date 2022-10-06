use anchor_lang::prelude::*;
use helium_sub_daos::{
  cpi::{
    accounts::{TrackAddedDeviceV0, TrackDcBurnV0},
    track_added_device_v0, track_dc_burn_v0,
  },
  current_epoch, TrackAddedDeviceArgsV0,
};

declare_id!("tes8BDewkpUpfqx7VDXUJzTFugjqHJugCEBP5sDrrCf");

#[program]
pub mod test_tracker {

  use helium_sub_daos::TrackDcBurnArgsV0;

  use super::*;

  pub fn test_add_device(ctx: Context<TestAddDevice>, collection: Pubkey) -> Result<()> {
    let bump = *ctx.bumps.get("authority").unwrap();
    track_added_device_v0(
      CpiContext::new_with_signer(
        ctx.accounts.helium_sub_daos.to_account_info(),
        ctx.accounts.tracker_accounts.unwrap(),
        &[&["hotspot_issuance".as_bytes(), collection.as_ref(), &[bump]]],
      ),
      TrackAddedDeviceArgsV0 {
        authority_bump: bump,
      },
    )?;
    Ok(())
  }

  pub fn test_dc_burn(ctx: Context<TestDcBurn>, amount: u64) -> Result<()> {
    let bump = *ctx.bumps.get("authority").unwrap();
    track_dc_burn_v0(
      CpiContext::new_with_signer(
        ctx.accounts.helium_sub_daos.to_account_info(),
        ctx.accounts.tracker_accounts.unwrap(),
        &[&["dc".as_bytes(), &[bump]]],
      ),
      TrackDcBurnArgsV0 {
        authority_bump: bump,
        dc_burned: amount,
      },
    )?;
    Ok(())
  }
}

#[derive(Accounts)]
pub struct TestAddDevice<'info> {
  pub tracker_accounts: TrackAddedDeviceV0Wrapper<'info>,
  pub helium_sub_daos: Program<'info, HeliumSubDaos>,
}

#[derive(Accounts)]
pub struct TestDcBurn<'info> {
  pub tracker_accounts: TrackDcBurnV0Wrapper<'info>,
  pub helium_sub_daos: Program<'info, HeliumSubDaos>,
}

#[derive(Debug, Clone)]
pub struct HeliumSubDaos;

impl anchor_lang::Id for HeliumSubDaos {
  fn id() -> Pubkey {
    helium_sub_daos::ID
  }
}

#[derive(Accounts)]
#[instruction(collection: Pubkey)]
pub struct TrackAddedDeviceV0Wrapper<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  /// CHECK: Verified by cpi
  #[account(
    mut,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(),  &current_epoch(clock.unix_timestamp).to_le_bytes()], // Break into 30m epochs
    seeds::program = helium_sub_daos::ID,
    bump
  )]
  pub sub_dao_epoch_info: AccountInfo<'info>,
  /// CHECK: Verified by cpi
  pub sub_dao: AccountInfo<'info>,
  #[account(
    mut,
    seeds = ["hotspot_issuance".as_bytes(), collection.as_ref()],
    bump,
  )]
  /// CHECK: Verified by cpi
  pub authority: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
}

impl<'info> TrackAddedDeviceV0Wrapper<'info> {
  fn unwrap(self: &TrackAddedDeviceV0Wrapper<'info>) -> TrackAddedDeviceV0<'info> {
    TrackAddedDeviceV0 {
      payer: self.payer.to_account_info(),
      sub_dao_epoch_info: self.sub_dao_epoch_info.to_account_info(),
      sub_dao: self.sub_dao.to_account_info(),
      authority: self.authority.to_account_info(),
      system_program: self.system_program.to_account_info(),
      clock: self.clock.to_account_info(),
      rent: self.rent.to_account_info(),
    }
  }
}

#[derive(Accounts)]
pub struct TrackDcBurnV0Wrapper<'info> {
  /// CHECK: Verified by cpi
  #[account(
    mut,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(),  &current_epoch(clock.unix_timestamp).to_le_bytes()], // Break into 30m epochs
    seeds::program = helium_sub_daos::ID,
    bump
  )]
  pub sub_dao_epoch_info: AccountInfo<'info>,
  /// CHECK: Verified by cpi
  pub sub_dao: AccountInfo<'info>,
  #[account(
    mut,
    seeds = ["dc".as_bytes()],
    bump,
  )]
  /// CHECK: Verified by cpi
  pub authority: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
}

impl<'info> TrackDcBurnV0Wrapper<'info> {
  fn unwrap(self: &TrackDcBurnV0Wrapper<'info>) -> TrackDcBurnV0<'info> {
    TrackDcBurnV0 {
      sub_dao_epoch_info: self.sub_dao_epoch_info.to_account_info(),
      sub_dao: self.sub_dao.to_account_info(),
      authority: self.authority.to_account_info(),
      system_program: self.system_program.to_account_info(),
      clock: self.clock.to_account_info(),
      rent: self.rent.to_account_info(),
    }
  }
}
