use crate::events::*;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct LogVoterInfo<'info> {
    pub registrar: AccountLoader<'info, Registrar>,

    #[account(has_one = registrar)]
    pub voter: AccountLoader<'info, Voter>,
}

/// A no-effect instruction that logs information about the voter and deposits.
///
/// Logs deposit information about deposits with an index between `deposit_entry_begin`
/// and `deposit_entry_begin + deposit_entry_count`.
///
/// With the current setup, all information about deposits can be logged by calling
/// this with deposit_entry_begin=0, =8, =16, =24 and deposit_entry_count=8.
pub fn log_voter_info(
    ctx: Context<LogVoterInfo>,
    deposit_entry_begin: u8,
    deposit_entry_count: u8,
) -> Result<()> {
    let registrar = &ctx.accounts.registrar.load()?;
    let voter = ctx.accounts.voter.load()?;
    let curr_ts = registrar.clock_unix_timestamp();
    let deposit_entry_begin = deposit_entry_begin as usize;
    let deposit_entry_count = deposit_entry_count as usize;

    msg!("voter");
    emit!(VoterInfo {
        voting_power: voter.weight(registrar)?,
        voting_power_locked: voter.weight_locked(registrar)?,
    });

    msg!("deposit_entries");
    for (deposit_index, deposit) in voter.deposits.iter().enumerate() {
        if !deposit.is_used
            || deposit_index < deposit_entry_begin
            || deposit_index >= deposit_entry_begin + deposit_entry_count
        {
            continue;
        }
        let lockup = &deposit.lockup;
        let seconds_left = lockup.seconds_left(curr_ts);
        let end_ts = curr_ts as u64 + seconds_left;
        let periods_total = lockup.periods_total()?;
        let periods_left = lockup.periods_left(curr_ts)?;
        let voting_mint_config = &registrar.voting_mints[deposit.voting_mint_config_idx as usize];
        let locking_info = (seconds_left > 0).then(|| LockingInfo {
            amount: deposit.amount_locked(curr_ts),
            end_timestamp: (lockup.kind != LockupKind::Constant).then(|| end_ts)
        });

        emit!(DepositEntryInfo {
            deposit_entry_index: deposit_index as u8,
            voting_mint_config_index: deposit.voting_mint_config_idx,
            unlocked: deposit.amount_unlocked(curr_ts),
            voting_power: deposit.voting_power(voting_mint_config, curr_ts)?,
            voting_power_locked: voting_mint_config.locked_vote_weight(deposit.amount_deposited_native)?,
            locking: locking_info,
        });
    }
    Ok(())
}
