use std::cmp::min;

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use voter_stake_registry::{
  state::{LockupKind, PositionV0, Registrar},
  VoterStakeRegistry,
};

use super::CloseDelegationAccounts;
use crate::{
  caclulate_vhnt_info, current_epoch, get_sub_dao_epoch_info_seed, id, state::*,
  update_subdao_vehnt, PrecisePosition, VehntInfo, TESTING,
};

pub fn get_genesis_end_epoch_bytes(
  position: &PositionV0,
  registrar: &Registrar,
  delegated_position: &DelegatedPositionV0,
) -> [u8; 8] {
  current_epoch(
    // If the genesis piece is no longer in effect (has been purged),
    // no need to pass an extra account here. Just pass the closing time sdei and
    // do not change it.
    if position.genesis_end <= registrar.clock_unix_timestamp() {
      min(
        position.lockup.effective_end_ts(),
        if delegated_position.expiration_ts == 0 {
          position.lockup.effective_end_ts()
        } else {
          min(
            position.lockup.effective_end_ts(),
            delegated_position.expiration_ts,
          )
        },
      )
    } else {
      position.genesis_end
    },
  )
  .to_le_bytes()
}

pub fn get_closing_epoch_bytes(
  position: &PositionV0,
  delegated_position: &DelegatedPositionV0,
) -> [u8; 8] {
  current_epoch(min(
    position.lockup.effective_end_ts(),
    if delegated_position.expiration_ts == 0 {
      position.lockup.effective_end_ts()
    } else {
      min(
        position.lockup.effective_end_ts(),
        delegated_position.expiration_ts,
      )
    },
  ))
  .to_le_bytes()
}

#[derive(Accounts)]
pub struct CloseDelegationV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    seeds::program = vsr_program.key(),
    bump = position.bump_seed,
    has_one = mint,
    has_one = registrar,
  )]
  pub position: Box<Account<'info, PositionV0>>,
  pub mint: Box<Account<'info, Mint>>,
  #[account(
    token::mint = mint,
    token::authority = position_authority,
    constraint = position_token_account.amount > 0
  )]
  pub position_token_account: Box<Account<'info, TokenAccount>>,
  #[account(mut)]
  pub position_authority: Signer<'info>,
  pub registrar: Box<Account<'info, Registrar>>,
  #[account(
    has_one = registrar
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,

  #[account(
    mut,
    close = position_authority,
    seeds = ["delegated_position".as_bytes(), position.key().as_ref()],
    has_one = position,
    has_one = sub_dao,
    bump = delegated_position.bump_seed
  )]
  pub delegated_position: Box<Account<'info, DelegatedPositionV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = SubDaoEpochInfoV0::SIZE,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &get_sub_dao_epoch_info_seed(&registrar)],
    bump,
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  // We know these two accounts are initialized because
  // They were used when delegate_v0 was called
  #[account(
    mut,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &get_closing_epoch_bytes(&position, &delegated_position)],
    bump = closing_time_sub_dao_epoch_info.bump_seed,
  )]
  pub closing_time_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    mut,
    seeds = [
      "sub_dao_epoch_info".as_bytes(), 
      sub_dao.key().as_ref(),
      &get_genesis_end_epoch_bytes(&position, &registrar, &delegated_position)
    ],
    bump = genesis_end_sub_dao_epoch_info.bump_seed,
  )]
  pub genesis_end_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,

  pub vsr_program: Program<'info, VoterStakeRegistry>,
  pub system_program: Program<'info, System>,
}

pub fn raw_handler(accounts: &mut CloseDelegationAccounts, sde_bump: u8) -> Result<()> {
  // load the vehnt information
  let position = &accounts.position;
  let registrar = &accounts.registrar;
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();
  let vehnt_at_curr_ts = position.voting_power_precise(voting_mint_config, curr_ts)?;
  let expiration_ts = accounts.delegated_position.expiration_ts;
  let vehnt_info = caclulate_vhnt_info(
    accounts.delegated_position.start_ts,
    position,
    voting_mint_config,
    expiration_ts,
  )?;

  let VehntInfo {
    pre_genesis_end_fall_rate,
    post_genesis_end_fall_rate,
    genesis_end_fall_rate_correction,
    genesis_end_vehnt_correction,
    end_fall_rate_correction,
    end_vehnt_correction,
    ..
  } = vehnt_info;

  msg!("Vehnt calculations: {:?}", vehnt_info);

  // don't allow unstake without claiming available rewards
  // make sure to account for when the position ends
  // unless we're testing, in which case we don't care
  let curr_epoch = current_epoch(curr_ts);
  let to_claim_to_epoch =
    if position.lockup.end_ts < curr_ts && position.lockup.kind == LockupKind::Cliff {
      current_epoch(position.lockup.end_ts) - 1
    } else {
      curr_epoch - 1
    };
  assert!((accounts.delegated_position.last_claimed_epoch >= to_claim_to_epoch) || TESTING);

  let delegated_position = &mut accounts.delegated_position;
  let sub_dao = &mut accounts.sub_dao;

  accounts.sub_dao_epoch_info.epoch = current_epoch(curr_ts);
  update_subdao_vehnt(sub_dao, accounts.sub_dao_epoch_info, curr_ts)?;

  // Update the ending epochs with this new info
  if accounts.closing_time_sub_dao_epoch_info.epoch > curr_epoch {
    accounts
      .closing_time_sub_dao_epoch_info
      .fall_rates_from_closing_positions = accounts
      .closing_time_sub_dao_epoch_info
      .fall_rates_from_closing_positions
      .checked_sub(end_fall_rate_correction)
      .unwrap();

    accounts
      .closing_time_sub_dao_epoch_info
      .vehnt_in_closing_positions = accounts
      .closing_time_sub_dao_epoch_info
      .vehnt_in_closing_positions
      .saturating_sub(end_vehnt_correction);
  }

  // Closing time and genesis end can be the same account
  let end_and_genesis_same =
    accounts.genesis_end_sub_dao_epoch_info.key() == accounts.closing_time_sub_dao_epoch_info.key();
  let genesis_end_sub_dao_epoch_info_original = accounts.genesis_end_sub_dao_epoch_info.as_mut();
  let genesis_end_sub_dao_epoch_info: &mut Account<SubDaoEpochInfoV0> = if end_and_genesis_same {
    accounts.closing_time_sub_dao_epoch_info
  } else {
    genesis_end_sub_dao_epoch_info_original
  };

  // Once start ts passes, everything gets purged. We only
  // need this correction when the epoch has not passed
  if position.genesis_end > curr_ts && genesis_end_sub_dao_epoch_info.start_ts() > curr_ts {
    genesis_end_sub_dao_epoch_info.fall_rates_from_closing_positions =
      genesis_end_sub_dao_epoch_info
        .fall_rates_from_closing_positions
        .checked_sub(genesis_end_fall_rate_correction)
        .unwrap();

    genesis_end_sub_dao_epoch_info.vehnt_in_closing_positions = genesis_end_sub_dao_epoch_info
      .vehnt_in_closing_positions
      .saturating_sub(genesis_end_vehnt_correction);
  }

  // Exit and reload that way the instruction exiting doesn't overwrite our changes
  // if these two are the same account.
  genesis_end_sub_dao_epoch_info.exit(&id())?;
  if end_and_genesis_same {
    accounts.genesis_end_sub_dao_epoch_info.reload()?;
  }

  // Only subtract from the stake if the position ends after the end of this epoch. Otherwise,
  // the position was already purged due to the sub_dao_epoch_info closing info logic.
  if delegated_position.expiration_ts >= accounts.sub_dao_epoch_info.end_ts() {
    msg!(
      "Current vehnt {}, removing {} from the subdao",
      sub_dao.vehnt_delegated,
      vehnt_at_curr_ts
    );
    // remove this stake information from the subdao
    sub_dao.vehnt_delegated = sub_dao.vehnt_delegated.saturating_sub(vehnt_at_curr_ts);

    sub_dao.vehnt_fall_rate = sub_dao
      .vehnt_fall_rate
      .checked_sub(if curr_epoch >= current_epoch(position.genesis_end) {
        post_genesis_end_fall_rate
      } else {
        pre_genesis_end_fall_rate
      })
      .unwrap();
  }
  // If the position was staked before this epoch, remove it.
  if current_epoch(delegated_position.start_ts) < curr_epoch {
    let vehnt_at_start = u64::try_from(
      position.voting_power(voting_mint_config, accounts.sub_dao_epoch_info.start_ts())?,
    )
    .unwrap();
    msg!(
      "Removing {} vehnt from this epoch for this subdao, which currently has {} vehnt",
      vehnt_at_start,
      accounts.sub_dao_epoch_info.vehnt_at_epoch_start
    );
    accounts.sub_dao_epoch_info.vehnt_at_epoch_start = accounts
      .sub_dao_epoch_info
      .vehnt_at_epoch_start
      .saturating_sub(vehnt_at_start);
  }

  accounts.sub_dao_epoch_info.sub_dao = accounts.sub_dao.key();
  accounts.sub_dao_epoch_info.bump_seed = sde_bump;
  accounts.sub_dao_epoch_info.initialized = true;

  // EDGE CASE: When the closing time epoch infos are the same as the current epoch info,
  // update_subdao_vehnt will have already removed the fall rates and vehnt from the sub dao.
  // Unfortunately, these changes aren't persisted across the various clones of the account, only
  // on the main sub_dao_epoch_info. When the accounts are exited after this call, they will save
  // with non-zero fall rates and vehnt in closing positions, causing a double-count.
  // Example txs here:
  // https://explorer.solana.com/tx/2Mcj4y7K5rE5ioFLKGBynNyX6S56NkfhQscdB3tB9M7wBsWFxWFg6R7vLGRnohsCyLt1U2ba166GUwd9DhU9Af9H
  // https://explorer.solana.com/tx/T1TLfyfZyE6iJE9BhjMXkMVRtEUsS1jP3Q9AbNKvvtDpe5HxmVmqp9yT4H7HjdLKt6Q553Vrc7JcQCJeqpqZkK3
  if accounts.closing_time_sub_dao_epoch_info.key() == accounts.sub_dao_epoch_info.key() {
    accounts
      .closing_time_sub_dao_epoch_info
      .vehnt_in_closing_positions = 0;
    accounts
      .closing_time_sub_dao_epoch_info
      .fall_rates_from_closing_positions = 0;
    accounts
      .closing_time_sub_dao_epoch_info
      .dc_onboarding_fees_paid = accounts.sub_dao_epoch_info.dc_onboarding_fees_paid;
    accounts
      .closing_time_sub_dao_epoch_info
      .vehnt_at_epoch_start = accounts.sub_dao_epoch_info.vehnt_at_epoch_start;
  }

  if accounts.genesis_end_sub_dao_epoch_info.key() == accounts.sub_dao_epoch_info.key() {
    accounts
      .genesis_end_sub_dao_epoch_info
      .vehnt_in_closing_positions = 0;
    accounts
      .genesis_end_sub_dao_epoch_info
      .fall_rates_from_closing_positions = 0;
    accounts
      .genesis_end_sub_dao_epoch_info
      .dc_onboarding_fees_paid = accounts.sub_dao_epoch_info.dc_onboarding_fees_paid;
    accounts.genesis_end_sub_dao_epoch_info.vehnt_at_epoch_start =
      accounts.sub_dao_epoch_info.vehnt_at_epoch_start;
  }
  Ok(())
}

pub fn handler(ctx: Context<CloseDelegationV0>) -> Result<()> {
  let mut accounts = CloseDelegationAccounts {
    position: &mut ctx.accounts.position,
    registrar: &mut ctx.accounts.registrar,
    sub_dao: &mut ctx.accounts.sub_dao,
    delegated_position: &mut ctx.accounts.delegated_position,
    sub_dao_epoch_info: &mut ctx.accounts.sub_dao_epoch_info,
    closing_time_sub_dao_epoch_info: &mut ctx.accounts.closing_time_sub_dao_epoch_info,
    genesis_end_sub_dao_epoch_info: &mut ctx.accounts.genesis_end_sub_dao_epoch_info,
  };
  raw_handler(&mut accounts, ctx.bumps.sub_dao_epoch_info)?;
  Ok(())
}
