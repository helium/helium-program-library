use anchor_lang::{
  prelude::{Pubkey, *},
  solana_program::{
    instruction::Instruction,
    pubkey,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked, ID as IX_ID},
  },
};
use shared_utils::resize_to_fit;

use crate::{ed25519::*, error::ErrorCode, state::*, SetCurrentRewardsArgsV0};

#[derive(Accounts)]
#[instruction(args: SetCurrentRewardsArgsV0)]
pub struct SetCurrentRewardsV1<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    constraint = args.oracle_index < lazy_distributor.oracles.len() as u16 @ ErrorCode::InvalidOracleIndex,
  )]
  pub lazy_distributor: Box<Account<'info, LazyDistributorV0>>,
  #[account(
    mut,
    has_one = lazy_distributor
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,
  /// CHECK: The address check is needed because otherwise
  /// the supplied Sysvar could be anything else.
  /// The Instruction Sysvar has not been implemented
  /// in the Anchor framework yet, so this is the safe approach.
  #[account(address = IX_ID)]
  pub sysvar_instructions: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
}

const TUKTUK_PID: Pubkey = pubkey!("tuktukUrfhXT6ZT77QTU8RQtvgL967uRuVagWF57zVA");

pub fn handler(ctx: Context<SetCurrentRewardsV1>, args: SetCurrentRewardsArgsV0) -> Result<()> {
  let signer = ctx.accounts.lazy_distributor.oracles[usize::from(args.oracle_index)].oracle;
  let ix_index = load_current_index_checked(&ctx.accounts.sysvar_instructions.to_account_info())?;
  let ix: Instruction = load_instruction_at_checked(
    ix_index.checked_sub(1).unwrap() as usize,
    &ctx.accounts.sysvar_instructions,
  )?;

  match verify_and_parse_ed25519_ix(&ix, signer.to_bytes().as_slice())? {
    Ed25519Verified::SetCurrentRewards(sign_args) => {
      require_eq!(
        sign_args.oracle_index,
        args.oracle_index,
        ErrorCode::InvalidOracleIndex
      );
      require_eq!(
        sign_args.current_rewards,
        args.current_rewards,
        ErrorCode::InvalidCurrentRewards
      );
      require_eq!(
        sign_args.asset,
        ctx.accounts.recipient.asset,
        ErrorCode::InvalidAsset
      );
      require_eq!(
        sign_args.lazy_distributor,
        ctx.accounts.lazy_distributor.key(),
        ErrorCode::InvalidLazyDistributor
      );
    }
    Ed25519Verified::RemoteTask(_) => {
      let run_task_ix: Instruction =
        load_instruction_at_checked(ix_index as usize, &ctx.accounts.sysvar_instructions)?;
      require_eq!(run_task_ix.program_id, TUKTUK_PID);
    }
  }

  // if lazy distributor has an approver, expect 1 remaining_account
  if ctx.accounts.lazy_distributor.approver.is_some() {
    require!(
      ctx.remaining_accounts.len() == 1,
      ErrorCode::InvalidApproverSignature
    );
    let approver = &ctx.remaining_accounts[0];
    require!(
      approver.key() == ctx.accounts.lazy_distributor.approver.unwrap(),
      ErrorCode::InvalidApproverSignature
    );
    require!(approver.is_signer, ErrorCode::InvalidApproverSignature);
  }

  if ctx.accounts.recipient.current_config_version != ctx.accounts.lazy_distributor.version {
    ctx.accounts.recipient.current_config_version = ctx.accounts.lazy_distributor.version;
    ctx.accounts.recipient.current_rewards =
      vec![None; ctx.accounts.lazy_distributor.oracles.len()];
  }

  ctx.accounts.recipient.current_rewards[usize::from(args.oracle_index)] =
    Some(args.current_rewards);

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.recipient,
  )?;

  Ok(())
}
