use crate::{current_epoch, error::ErrorCode, id, state::*, utils::*};
use anchor_lang::{prelude::*, Discriminator};
use anchor_spl::token::{Mint, TokenAccount};

use voter_stake_registry::{
  state::{LockupKind, PositionV0, Registrar},
  VoterStakeRegistry,
};

/// Creates a new account and serializes data into it using the provided seeds to invoke signed CPI call
/// The owner of the account is set to the PDA program
/// Note: This functions also checks the provided account PDA matches the supplied seeds
#[allow(clippy::too_many_arguments)]
pub fn create_and_serialize_account_signed<'a, T: BorshSerialize + AccountMaxSize>(
  payer_info: &AccountInfo<'a>,
  account_info: &AccountInfo<'a>,
  account_data: &T,
  account_address_seeds: &[&[u8]],
  program_id: &Pubkey,
  system_info: &AccountInfo<'a>,
  rent: &Rent,
  extra_lamports: u64, // Extra lamports added on top of the rent exempt amount
) -> Result<(), ProgramError> {
  create_and_serialize_account_with_owner_signed(
    payer_info,
    account_info,
    account_data,
    account_address_seeds,
    program_id,
    program_id, // By default use PDA program_id as the owner of the account
    system_info,
    rent,
    extra_lamports,
  )
}

/// Creates a new account and serializes data into it using the provided seeds to invoke signed CPI call
/// Note: This functions also checks the provided account PDA matches the supplied seeds
#[allow(clippy::too_many_arguments)]
pub fn create_and_serialize_account_with_owner_signed<'a, T: BorshSerialize + AccountMaxSize>(
  payer_info: &AccountInfo<'a>,
  account_info: &AccountInfo<'a>,
  account_data: &T,
  account_address_seeds: &[&[u8]],
  program_id: &Pubkey,
  owner_program_id: &Pubkey,
  system_info: &AccountInfo<'a>,
  rent: &Rent,
  extra_lamports: u64, // Extra lamports added on top of the rent exempt amount
) -> Result<(), ProgramError> {
  // Get PDA and assert it's the same as the requested account address
  let (account_address, bump_seed) =
    Pubkey::find_program_address(account_address_seeds, program_id);

  if account_address != *account_info.key {
    msg!(
      "Create account with PDA: {:?} was requested while PDA: {:?} was expected",
      account_info.key,
      account_address
    );
    return Err(ProgramError::InvalidSeeds);
  }

  let (serialized_data, account_size) = if let Some(max_size) = account_data.get_max_size() {
    (None, max_size)
  } else {
    let serialized_data = account_data.try_to_vec()?;
    let account_size = serialized_data.len();
    (Some(serialized_data), account_size)
  };

  let mut signers_seeds = account_address_seeds.to_vec();
  let bump = &[bump_seed];
  signers_seeds.push(bump);

  let rent_exempt_lamports = rent.minimum_balance(account_size);
  let total_lamports = rent_exempt_lamports.checked_add(extra_lamports).unwrap();

  // If the account has some lamports already it can't be created using create_account instruction
  // Anybody can send lamports to a PDA and by doing so create the account and perform DoS attack by blocking create_account
  if account_info.lamports() > 0 {
    let top_up_lamports = total_lamports.saturating_sub(account_info.lamports());

    if top_up_lamports > 0 {
      invoke(
        &system_instruction::transfer(payer_info.key, account_info.key, top_up_lamports),
        &[
          payer_info.clone(),
          account_info.clone(),
          system_info.clone(),
        ],
      )?;
    }

    invoke_signed(
      &system_instruction::allocate(account_info.key, account_size as u64),
      &[account_info.clone(), system_info.clone()],
      &[&signers_seeds[..]],
    )?;

    invoke_signed(
      &system_instruction::assign(account_info.key, owner_program_id),
      &[account_info.clone(), system_info.clone()],
      &[&signers_seeds[..]],
    )?;
  } else {
    // If the PDA doesn't exist use create_account to use lower compute budget
    let create_account_instruction = create_account(
      payer_info.key,
      account_info.key,
      total_lamports,
      account_size as u64,
      owner_program_id,
    );

    invoke_signed(
      &create_account_instruction,
      &[
        payer_info.clone(),
        account_info.clone(),
        system_info.clone(),
      ],
      &[&signers_seeds[..]],
    )?;
  }

  if let Some(serialized_data) = serialized_data {
    account_info
      .data
      .borrow_mut()
      .copy_from_slice(&serialized_data);
  } else if account_size > 0 {
    borsh::to_writer(&mut account_info.data.borrow_mut()[..], account_data)?;
  }

  Ok(())
}

#[derive(Accounts)]
pub struct DelegateV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    seeds = [b"position".as_ref(), mint.key().as_ref()],
    seeds::program = vsr_program.key(),
    bump = position.bump_seed,
    has_one = mint,
    has_one = registrar,
    constraint = position.lockup.kind == LockupKind::Constant || position.lockup.end_ts > registrar.clock_unix_timestamp()
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
    has_one = registrar,
  )]
  pub dao: Box<Account<'info, DaoV0>>,
  #[account(
    mut,
    has_one = dao,
  )]
  pub sub_dao: Box<Account<'info, SubDaoV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = SubDaoEpochInfoV0::SIZE,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &current_epoch(registrar.clock_unix_timestamp()).to_le_bytes()],
    bump,
    constraint = sub_dao_epoch_info.key() != closing_time_sub_dao_epoch_info.key() @ ErrorCode::NoDelegateEndingPosition
  )]
  pub sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    init_if_needed,
    payer = payer,
    space = SubDaoEpochInfoV0::SIZE,
    seeds = ["sub_dao_epoch_info".as_bytes(), sub_dao.key().as_ref(), &current_epoch(position.lockup.end_ts).to_le_bytes()],
    bump,
  )]
  pub closing_time_sub_dao_epoch_info: Box<Account<'info, SubDaoEpochInfoV0>>,
  #[account(
    mut,
    seeds = [
      "sub_dao_epoch_info".as_bytes(), 
      sub_dao.key().as_ref(),
      &current_epoch(
        // Avoid passing an extra account if the end is 0 (no genesis on this position).
        // Pass instead closing time epoch info, txn account deduplication will reduce the overall tx size
        if position.genesis_end <= registrar.clock_unix_timestamp() {
          position.lockup.end_ts
        } else {
          position.genesis_end
        }
      ).to_le_bytes()
    ],
    bump,
  )]
  /// CHECK: Verified when needed in the inner instr
  pub genesis_end_sub_dao_epoch_info: UncheckedAccount<'info>,

  #[account(
    init,
    space = 60 + 8 + std::mem::size_of::<DelegatedPositionV0>(),
    payer = position_authority,
    seeds = ["delegated_position".as_bytes(), position.key().as_ref()],
    bump,
  )]
  pub delegated_position: Box<Account<'info, DelegatedPositionV0>>,

  pub vsr_program: Program<'info, VoterStakeRegistry>,
  pub system_program: Program<'info, System>,
}

pub struct SubDaoEpochInfoV0WithDescriminator {
  pub sub_dao_epoch_info: SubDaoEpochInfoV0,
}

impl crate::borsh::BorshSerialize for SubDaoEpochInfoV0WithDescriminator {
  fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
    SubDaoEpochInfoV0::DISCRIMINATOR.serialize(writer)?;
    self.sub_dao_epoch_info.serialize(writer)
  }
}

impl AccountMaxSize for SubDaoEpochInfoV0WithDescriminator {
  fn get_max_size(&self) -> Option<usize> {
    Some(SubDaoEpochInfoV0::SIZE)
  }
}

pub fn handler(ctx: Context<DelegateV0>) -> Result<()> {
  // load the vehnt information
  let position = &mut ctx.accounts.position;
  let registrar = &ctx.accounts.registrar;
  let voting_mint_config = &registrar.voting_mints[position.voting_mint_config_idx as usize];
  let curr_ts = registrar.clock_unix_timestamp();

  let vehnt_info = caclulate_vhnt_info(curr_ts, position, voting_mint_config)?;
  let VehntInfo {
    has_genesis,
    vehnt_at_curr_ts,
    pre_genesis_end_fall_rate,
    post_genesis_end_fall_rate,
    genesis_end_fall_rate_correction,
    genesis_end_vehnt_correction,
    end_fall_rate_correction,
    end_vehnt_correction,
  } = vehnt_info;

  msg!("Vehnt calculations: {:?}", vehnt_info);

  let curr_epoch = current_epoch(curr_ts);

  let sub_dao = &mut ctx.accounts.sub_dao;
  let delegated_position = &mut ctx.accounts.delegated_position;

  // Update the veHnt at start of epoch
  ctx.accounts.sub_dao_epoch_info.epoch = current_epoch(curr_ts);
  update_subdao_vehnt(sub_dao, &mut ctx.accounts.sub_dao_epoch_info, curr_ts)?;

  sub_dao.vehnt_delegated = sub_dao
    .vehnt_delegated
    .checked_add(vehnt_at_curr_ts)
    .unwrap();
  sub_dao.vehnt_fall_rate = if has_genesis {
    sub_dao
      .vehnt_fall_rate
      .checked_add(pre_genesis_end_fall_rate)
      .unwrap()
  } else {
    sub_dao
      .vehnt_fall_rate
      .checked_add(post_genesis_end_fall_rate)
      .unwrap()
  };

  ctx
    .accounts
    .closing_time_sub_dao_epoch_info
    .fall_rates_from_closing_positions = ctx
    .accounts
    .closing_time_sub_dao_epoch_info
    .fall_rates_from_closing_positions
    .checked_add(end_fall_rate_correction)
    .unwrap();

  ctx
    .accounts
    .closing_time_sub_dao_epoch_info
    .vehnt_in_closing_positions = ctx
    .accounts
    .closing_time_sub_dao_epoch_info
    .vehnt_in_closing_positions
    .checked_add(end_vehnt_correction)
    .unwrap();
  ctx.accounts.closing_time_sub_dao_epoch_info.sub_dao = sub_dao.key();
  ctx.accounts.closing_time_sub_dao_epoch_info.epoch = current_epoch(position.lockup.end_ts);
  ctx.accounts.closing_time_sub_dao_epoch_info.bump_seed =
    ctx.bumps["closing_time_sub_dao_epoch_info"];

  let genesis_end_is_closing = ctx.accounts.genesis_end_sub_dao_epoch_info.key()
    == ctx.accounts.closing_time_sub_dao_epoch_info.key();
  if genesis_end_fall_rate_correction > 0 || genesis_end_vehnt_correction > 0 {
    // If the end account doesn't exist, init it. Otherwise just set the correcitons
    if !genesis_end_is_closing && ctx.accounts.genesis_end_sub_dao_epoch_info.data_len() == 0 {
      msg!("Genesis end doesn't exist, initting");
      let genesis_end_epoch = current_epoch(position.genesis_end);
      // Anchor doesn't natively support dynamic account creation using remaining_accounts
      // and we have to take it on the manual drive
      create_and_serialize_account_signed(
        &ctx.accounts.payer.to_account_info(),
        &ctx
          .accounts
          .genesis_end_sub_dao_epoch_info
          .to_account_info(),
        &SubDaoEpochInfoV0WithDescriminator {
          sub_dao_epoch_info: SubDaoEpochInfoV0 {
            epoch: genesis_end_epoch,
            bump_seed: ctx.bumps["genesis_end_sub_dao_epoch_info"],
            sub_dao: sub_dao.key(),
            dc_burned: 0,
            vehnt_at_epoch_start: 0,
            vehnt_in_closing_positions: genesis_end_vehnt_correction,
            fall_rates_from_closing_positions: genesis_end_fall_rate_correction,
            delegation_rewards_issued: 0,
            utility_score: None,
            rewards_issued_at: None,
            initialized: false,
            dc_onboarding_fees_paid: 0,
          },
        },
        &[
          "sub_dao_epoch_info".as_bytes(),
          sub_dao.key().as_ref(),
          &genesis_end_epoch.to_le_bytes(),
        ],
        &id(),
        &ctx.accounts.system_program.to_account_info(),
        &Rent::get()?,
        0,
      )?;
    } else {
      // closing can be the same account as genesis end. Make sure to use the proper account
      let mut parsed: Account<SubDaoEpochInfoV0>;
      let genesis_end_sub_dao_epoch_info: &mut Account<SubDaoEpochInfoV0> =
        if genesis_end_is_closing {
          &mut ctx.accounts.closing_time_sub_dao_epoch_info
        } else {
          parsed = Account::try_from(
            &ctx
              .accounts
              .genesis_end_sub_dao_epoch_info
              .to_account_info(),
          )?;
          &mut parsed
        };

      // EDGE CASE: The genesis end could be this epoch. Do not override what was done with update_subdao_vehnt
      if genesis_end_sub_dao_epoch_info.key() == ctx.accounts.sub_dao_epoch_info.key() {
        genesis_end_sub_dao_epoch_info.fall_rates_from_closing_positions = ctx
          .accounts
          .sub_dao_epoch_info
          .fall_rates_from_closing_positions;
        genesis_end_sub_dao_epoch_info.vehnt_in_closing_positions =
          ctx.accounts.sub_dao_epoch_info.vehnt_in_closing_positions;
      } else {
        genesis_end_sub_dao_epoch_info.fall_rates_from_closing_positions =
          genesis_end_sub_dao_epoch_info
            .fall_rates_from_closing_positions
            .checked_add(genesis_end_fall_rate_correction)
            .unwrap();

        genesis_end_sub_dao_epoch_info.vehnt_in_closing_positions = genesis_end_sub_dao_epoch_info
          .vehnt_in_closing_positions
          .checked_add(genesis_end_vehnt_correction)
          .unwrap();
      }

      genesis_end_sub_dao_epoch_info.exit(&id())?;
    }
  }

  delegated_position.purged = false;
  delegated_position.start_ts = curr_ts;
  delegated_position.hnt_amount = position.amount_deposited_native;
  delegated_position.last_claimed_epoch = curr_epoch;
  delegated_position.sub_dao = ctx.accounts.sub_dao.key();
  delegated_position.mint = ctx.accounts.mint.key();
  delegated_position.position = ctx.accounts.position.key();
  delegated_position.bump_seed = ctx.bumps["delegated_position"];

  ctx.accounts.sub_dao_epoch_info.sub_dao = ctx.accounts.sub_dao.key();
  ctx.accounts.sub_dao_epoch_info.bump_seed = *ctx.bumps.get("sub_dao_epoch_info").unwrap();
  ctx.accounts.sub_dao_epoch_info.initialized = true;

  Ok(())
}
