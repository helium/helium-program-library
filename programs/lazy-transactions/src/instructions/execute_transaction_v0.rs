use crate::canopy::fill_in_proof_from_canopy;
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
  pub instructions: Vec<CompiledInstruction>,
  /// Additional signer seeds. Should include bump
  /// Note that these seeds will be prefixed with "user", lazy_transactions.name
  /// and the bump you pass and account should be consistent with this. But to save space
  /// in the instruction, they should be ommitted here. See tests for examples
  pub signer_seeds: Vec<Vec<Vec<u8>>>,
  pub index: u32,
}

#[derive(Accounts)]
#[instruction(args: ExecuteTransactionArgsV0)]
pub struct ExecuteTransactionV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    has_one = canopy
  )]
  pub lazy_transactions: Account<'info, LazyTransactionsV0>,
  /// CHECK: Verified by has one
  pub canopy: UncheckedAccount<'info>,
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
}

pub fn handler(ctx: Context<ExecuteTransactionV0>, args: ExecuteTransactionArgsV0) -> Result<()> {
  let largest_acct_idx: usize = (*args
    .instructions
    .iter()
    .flat_map(|i| i.accounts.iter())
    .max()
    .unwrap())
  .into();

  let mut proof = ctx.remaining_accounts[(largest_acct_idx + 1)..]
    .iter()
    .map(|a| a.key.to_bytes())
    .collect::<Vec<_>>();

  fill_in_proof_from_canopy(
    ctx.accounts.canopy.try_borrow_data()?.as_ref(),
    ctx.accounts.lazy_transactions.max_depth,
    args.index,
    &mut proof,
  )?;

  let accts = ctx.remaining_accounts[..(largest_acct_idx + 1)]
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

  let all_vecs = [
    accts,
    ixs,
    args.signer_seeds.clone().into_iter().flatten().collect(),
    vec![args.index.to_le_bytes().to_vec()],
  ]
  .concat();
  let to_hash: &[&[u8]] = &all_vecs
    .iter()
    .map(|v| v.as_slice())
    .collect::<Vec<&[u8]>>();

  let hash = solana_program::keccak::hashv(to_hash).0;

  if !verify(proof, ctx.accounts.lazy_transactions.root, hash, args.index) {
    return Err(error!(ErrorCode::InvalidData));
  };

  let lazy_signer_seeds: &[&[u8]] = &[
    b"lazy_signer",
    ctx.accounts.lazy_transactions.name.as_bytes(),
    &[ctx.bumps["lazy_signer"]],
  ];

  let prefix: Vec<&[u8]> = vec![b"user", ctx.accounts.lazy_transactions.name.as_bytes()];
  // Need to convert to &[&[u8]] because invoke_signed expects that
  let signers_inner_u8: Vec<Vec<&[u8]>> = args
    .signer_seeds
    .iter()
    .map(|s| {
      let mut clone = prefix.clone();
      clone.extend(s.iter().map(|v| v.as_slice()).collect::<Vec<&[u8]>>());

      clone
    })
    .collect();
  let mut signers = signers_inner_u8
    .iter()
    .map(|s| s.as_slice())
    .collect::<Vec<&[&[u8]]>>();

  signers.extend(vec![lazy_signer_seeds]);

  let signer_addresses = signers
    .iter()
    .map(|s| Pubkey::create_program_address(s, ctx.program_id).unwrap())
    .collect::<std::collections::HashSet<Pubkey>>();
  for ix in args.instructions {
    let mut accounts = Vec::new();
    let mut account_infos = Vec::new();
    for i in ix.accounts {
      let acct = ctx.remaining_accounts[i as usize].clone();
      accounts.push(acct.clone());
      account_infos.push(AccountMeta {
        pubkey: acct.key(),
        is_signer: acct.key() == ctx.accounts.lazy_signer.key()
          || acct.is_signer
          || signer_addresses.contains(&acct.key()),
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
      &signers,
    )?;
  }

  Ok(())
}
