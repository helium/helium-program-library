use anchor_lang::{prelude::*, solana_program::program_error::ProgramError};
use lazy_distributor::{
  cpi::{accounts::TempCloseRecipientV0, temp_close_recipient_v0},
  program::LazyDistributor,
  state::*,
};

const AUTHORITY: Pubkey = pubkey!("hrp7GncEa2fJbweaGU5vkbZGwsoNQieahETrXcyrbTY");
const HEM_PROGRAM: Pubkey = pubkey!("hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8");

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TempCloseRecipientWrapperArgsV0 {
  pub entity_key: Vec<u8>,
  pub asset: Pubkey,
}

#[derive(Accounts)]
#[instruction(args: TempCloseRecipientWrapperArgsV0)]
pub struct TempCloseRecipientWrapperV0<'info> {
  #[account(
    address = AUTHORITY
  )]
  pub authority: Signer<'info>,
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    mut,
    has_one = lazy_distributor
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,
  /// CHECK: We verify this KeyToAssetV0 derivation matches using entity_key arg, then verify it's closed
  pub key_to_asset: AccountInfo<'info>,
  /// CHECK: DAO account for deriving key_to_asset PDA
  pub dao: AccountInfo<'info>,
  /// CHECK: Oracle signer PDA - used to prove this CPI is from rewards-oracle
  #[account(
    seeds = [b"oracle_signer"],
    bump
  )]
  pub oracle_signer: AccountInfo<'info>,
  pub lazy_distributor_program: Program<'info, LazyDistributor>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<TempCloseRecipientWrapperV0>,
  args: TempCloseRecipientWrapperArgsV0,
) -> Result<()> {
  // Verify the connection between recipient and the asset from key_to_asset
  // This ensures we're closing the correct recipient for the closed key_to_asset
  if ctx.accounts.recipient.asset != args.asset {
    msg!("Recipient asset does not match provided asset");
    return Err(ProgramError::InvalidAccountData.into());
  }

  // Verify the KeyToAssetV0 account is closed (owned by system program)
  // Note: We intentionally don't check lamports as dust can be sent to game that check
  if ctx.accounts.key_to_asset.owner != &anchor_lang::system_program::ID {
    msg!("KeyToAssetV0 still exists (not owned by system program), cannot close recipient");
    return Err(ProgramError::InvalidAccountData.into());
  }

  // Verify that key_to_asset data has been cleared (account fully closed)
  if !ctx.accounts.key_to_asset.data_is_empty() {
    msg!("KeyToAssetV0 account still has data, cannot proceed");
    return Err(ProgramError::InvalidAccountData.into());
  }

  // Verify the key_to_asset PDA derivation matches the expected address for this dao and entity_key
  // This ensures the provided entity_key and dao correspond to a valid key_to_asset that was closed
  let hash = anchor_lang::solana_program::hash::hash(&args.entity_key);
  let (expected_key_to_asset, _bump) = Pubkey::find_program_address(
    &[
      b"key_to_asset",
      ctx.accounts.dao.key().as_ref(),
      hash.to_bytes().as_ref(),
    ],
    &HEM_PROGRAM,
  );

  if ctx.accounts.key_to_asset.key() != expected_key_to_asset {
    msg!("KeyToAssetV0 derivation does not match expected address");
    return Err(ProgramError::InvalidAccountData.into());
  }

  // Now close the recipient via CPI to lazy-distributor
  // Use oracle_signer as a PDA signer to prove this is coming from rewards-oracle
  let signer_seeds: &[&[&[u8]]] = &[&[b"oracle_signer", &[ctx.bumps.oracle_signer]]];
  let cpi_accounts = TempCloseRecipientV0 {
    authority: ctx.accounts.authority.to_account_info(),
    approver: ctx.accounts.oracle_signer.to_account_info(),
    lazy_distributor: ctx.accounts.lazy_distributor.to_account_info(),
    recipient: ctx.accounts.recipient.to_account_info(),
    system_program: ctx.accounts.system_program.to_account_info(),
  };

  temp_close_recipient_v0(CpiContext::new_with_signer(
    ctx.accounts.lazy_distributor_program.to_account_info(),
    cpi_accounts,
    signer_seeds,
  ))?;

  Ok(())
}
