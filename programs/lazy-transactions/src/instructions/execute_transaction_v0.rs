use crate::error::ErrorCode;
use crate::{merkle_proof::verify, state::*};
use anchor_lang::{prelude::*, solana_program, solana_program::instruction::Instruction};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CompiledInstruction {
  /// Index into the transaction keys array indicating the program account that executes this instruction.
  pub program_id_index: u8,
  /// Ordered indices into the transaction keys array indicating which accounts to pass to the program.
  pub accounts: Vec<u8>,
  /// The program input data.
  pub data: Vec<u8>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ExecuteTransactionArgsV0 {
  pub proof: Vec<[u8; 32]>,
  pub instructions: Vec<CompiledInstruction>,
  pub index: u32,
}

#[derive(Accounts)]
#[instruction(args: ExecuteTransactionArgsV0)]
pub struct ExecuteTransactionV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub lazy_transactions: Account<'info, LazyTransactionsV0>,
  #[account(
    mut,
    seeds = ["lazy_signer".as_bytes(), lazy_transactions.name.as_bytes()],
    bump
  )]
  /// CHECK: You can throw things behind this signer and it will sign the tx via cpi
  pub lazy_signer: AccountInfo<'info>,
  #[account(
    init,
    payer = payer,
    space = 8,
    seeds = ["block".as_bytes(), lazy_transactions.key().as_ref(), &args.index.to_le_bytes()],
    bump
  )]
  pub block: Account<'info, Block>,
  pub system_program: Program<'info, System>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<ExecuteTransactionV0>, args: ExecuteTransactionArgsV0) -> Result<()> {
  let accts = ctx
    .remaining_accounts
    .iter()
    .map(|a| a.key.to_bytes().to_vec())
    .collect::<Vec<_>>();
  let ixs = args
    .instructions
    .iter()
    .map(|i| {
      i.try_to_vec()
        .map_err(|_| error!(ErrorCode::InstructionSerializeFailed))
    })
    .collect::<Result<Vec<Vec<u8>>>>()
    .unwrap();

  let all_vecs = [accts, ixs, vec![args.index.to_le_bytes().to_vec()]].concat();
  let to_hash: &[&[u8]] = &all_vecs
    .iter()
    .map(|v| v.as_slice())
    .collect::<Vec<&[u8]>>();

  let hash = solana_program::keccak::hashv(to_hash).0;

  if !verify(
    args.proof,
    ctx.accounts.lazy_transactions.root,
    hash,
    args.index,
  ) {
    return Err(error!(ErrorCode::InvalidData));
  };

  for ix in args.instructions {
    let mut accounts = Vec::new();
    let mut account_infos = Vec::new();
    for i in ix.accounts {
      let acct = ctx.remaining_accounts[i as usize].clone();
      accounts.push(acct.clone());
      account_infos.push(AccountMeta {
        pubkey: acct.key(),
        is_signer: acct.key() == ctx.accounts.lazy_signer.key() || acct.is_signer,
        is_writable: acct.is_writable,
      })
    }
    solana_program::program::invoke_signed(
      &Instruction {
        program_id: *ctx.remaining_accounts[ix.program_id_index as usize].key,
        accounts: account_infos,
        data: ix.data,
      },
      accounts.as_slice(),
      &[&[
        b"lazy_signer",
        ctx.accounts.lazy_transactions.name.as_bytes(),
        &[ctx.bumps["lazy_signer"]],
      ]],
    )?;
  }

  Ok(())
}
