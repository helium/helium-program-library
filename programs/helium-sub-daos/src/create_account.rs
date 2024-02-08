use anchor_lang::prelude::borsh::BorshSerialize;
use anchor_lang::solana_program::{
  account_info::AccountInfo,
  msg,
  program::{invoke, invoke_signed},
  program_error::ProgramError,
  pubkey::Pubkey,
  rent::Rent,
  system_instruction::{self, create_account},
};

pub trait AccountMaxSize {
  fn get_max_size(&self) -> Option<usize>;
}

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
) -> std::result::Result<(), ProgramError> {
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
) -> std::result::Result<(), ProgramError> {
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
    anchor_lang::prelude::borsh::to_writer(&mut account_info.data.borrow_mut()[..], account_data)?;
  }

  Ok(())
}
