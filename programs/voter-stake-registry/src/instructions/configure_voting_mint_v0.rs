use crate::error::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use shared_utils::resize_to_fit;

// Remaining accounts must be all the token mints that have registered
// as voting mints, including the newly registered one.
#[derive(Accounts)]
pub struct ConfigureVotingMintV0<'info> {
  #[account(mut, has_one = realm_authority)]
  pub registrar: Box<Account<'info, Registrar>>,
  pub realm_authority: Signer<'info>,

  /// Tokens of this mint will produce vote weight
  pub mint: Account<'info, Mint>,

  #[account(mut)]
  pub payer: Signer<'info>,
  pub system_program: Program<'info, System>,
  // This instruction expects that all voting mint addresses, including a
  // newly registered one, are passed in ctx.remainingAccounts.
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ConfigureVotingMintArgsV0 {
  pub idx: u16,
  pub digit_shift: i8,
  pub locked_vote_weight_scaled_factor: u64,
  pub minimum_required_lockup_secs: u64,
  pub max_extra_lockup_vote_weight_scaled_factor: u64,
  pub genesis_vote_power_multiplier: u8,
  pub genesis_vote_power_multiplier_expiration_ts: i64,
  pub lockup_saturation_secs: u64,
}

/// Creates a new exchange rate for a given mint. This allows a voter to
/// deposit the mint in exchange for vote weight. There can only be a single
/// exchange rate per mint.
///
/// * `idx`: index of the rate to be set
/// * `digit_shift`: how many digits to shift the native token amount, see below
/// * `locked_vote_weight_scaled_factor`: vote weight factor for all funds in vault, in 1/1e9 units
/// * `max_extra_lockup_vote_weight_scaled_factor`: max extra weight for lockups, in 1/1e9 units
/// * `lockup_saturation_secs`: lockup duration at which the full vote weight
///   bonus is given to locked up deposits
/// * `minimum_required_lockup_secs` - The minimum required lockup, at which point 1 token = 1 vote
///
/// This instruction can be called several times for the same mint and index to
/// change the voting mint configuration.
///
/// The vote weight for `amount` of native tokens will be one of these
///
/// With min_lockup_saturation_secs == 0
/// ```
/// vote_weight =
///     amount * 10^(digit_shift)
///            * (locked_vote_weight_scaled_factor/1e9
///               + lockup_duration_factor * max_extra_lockup_vote_weight_scaled_factor/1e9)
/// ```
///
/// With min_lockup_saturation_secs > 0 && lockup.total_seconds == min_lockup_saturation_secs
/// ```
/// vote_weight =
///     amount * 10^(digit_shift)
///            * (locked_vote_weight_scaled_factor/1e9
///               + lockup_duration_factor * min_lockup_vote_weight_scaled_factor/1e9)
/// ```
/// where lockup_duration_factor is a value between 0 and 1, depending on how long
/// the amount is locked up. It is 1 when the lockup duration is greater or equal
/// lockup_saturation_secs.
///
/// Warning: Choose values that ensure that the vote weight will not overflow the
/// u64 limit! There is a check based on the supply of all configured mints, but
/// do your own checking too.
///
/// If you use a single mint, prefer digit_shift=0 and locked_vote_weight_scaled_factor +
/// max_extra_lockup_vote_weight_scaled_factor <= 1e9. That way you won't have issues with overflow no
/// matter the size of the mint's supply.
///
/// Digit shifting is particularly useful when using several voting token mints
/// that have a different number of decimals. It can be used to align them to
/// a common number of decimals.
///
/// Example: If you have token A with 6 decimals and token B with 9 decimals, you
/// could set up:
///    * A with digit_shift=0,  locked_vote_weight_scaled_factor=2e9, max_extra_lockup_vote_weight_scaled_factor=0
///    * B with digit_shift=-3, locked_vote_weight_scaled_factor=1e9, max_extra_lockup_vote_weight_scaled_factor=1e9
///
/// That would make 1.0 decimaled tokens of A as valuable as 2.0 decimaled tokens
/// of B when unlocked. B tokens could be locked up to double their vote weight. As
/// long as A's and B's supplies are below 2^63, there could be no overflow.
///
/// Note that in this example, you need 1000 native B tokens before receiving 1
/// unit of vote weight. If the supplies were significantly lower, you could use
///    * A with digit_shift=3, locked_vote_weight_scaled_factor=2e9, max_extra_lockup_vote_weight_scaled_factor=0
///    * B with digit_shift=0, locked_vote_weight_scaled_factor=1e9, max_extra_lockup_vote_weight_scaled_factor=1e9
/// to not lose precision on B tokens.
///
pub fn handler(ctx: Context<ConfigureVotingMintV0>, args: ConfigureVotingMintArgsV0) -> Result<()> {
  let ConfigureVotingMintArgsV0 {
    idx,
    digit_shift,
    locked_vote_weight_scaled_factor,
    minimum_required_lockup_secs,
    max_extra_lockup_vote_weight_scaled_factor,
    genesis_vote_power_multiplier,
    genesis_vote_power_multiplier_expiration_ts,
    lockup_saturation_secs,
  } = args;
  require_gt!(
    lockup_saturation_secs,
    0,
    VsrError::LockupSaturationMustBePositive
  );

  let registrar = &mut ctx.accounts.registrar;
  let mint = ctx.accounts.mint.key();
  let idx = idx as usize;

  // index must exist or be next configurable index
  require_gte!(
    registrar.voting_mints.len(),
    idx,
    VsrError::OutOfBoundsVotingMintConfigIndex
  );

  // Either it's reconfiguring an existing mint with the correct index,
  // or configuring a new mint on an unused index.
  match registrar.voting_mint_config_index(mint) {
    Ok(existing_idx) => require_eq!(
      existing_idx,
      idx,
      VsrError::VotingMintConfiguredWithDifferentIndex
    ),
    Err(_) => require!(
      registrar.voting_mints.get(idx).is_none(),
      VsrError::VotingMintConfigIndexAlreadyInUse
    ),
  };

  // Update or append votingMint
  match registrar.voting_mints.get(idx) {
    Some(_) => {
      registrar.voting_mints[idx] = VotingMintConfigV0 {
        mint,
        digit_shift,
        locked_vote_weight_scaled_factor,
        minimum_required_lockup_secs,
        max_extra_lockup_vote_weight_scaled_factor,
        genesis_vote_power_multiplier,
        genesis_vote_power_multiplier_expiration_ts,
        lockup_saturation_secs,
      }
    }
    None => registrar.voting_mints.push(VotingMintConfigV0 {
      mint,
      digit_shift,
      locked_vote_weight_scaled_factor,
      minimum_required_lockup_secs,
      max_extra_lockup_vote_weight_scaled_factor,
      genesis_vote_power_multiplier,
      genesis_vote_power_multiplier_expiration_ts,
      lockup_saturation_secs,
    }),
  }

  // Check for overflow in vote weight
  registrar.max_vote_weight(ctx.remaining_accounts)?;

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.registrar,
  )?;

  Ok(())
}
