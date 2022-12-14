import { LazyTransactions } from "@helium/idls/lib/types/lazy_transactions";
import { AnchorProvider, Idl, Program, IdlTypes } from "@project-serum/anchor";
import { IdlCoder } from "@project-serum/anchor/dist/cjs/coder/borsh/idl";
import { TransactionInstruction, PublicKey, AccountMeta } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { MerkleTree } from "./merkleTree";
import { keccak_256 } from 'js-sha3';
import { Layout } from "buffer-layout";

export * from "./pdas";
export * from "./constants";

type CompiledInstruction = IdlTypes<LazyTransactions>["CompiledInstruction"];

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<LazyTransactions>> {
  if (!idl) {
    idl = await Program.fetchIdl(programId, provider);
  }
  const lazyTransactions = new Program<LazyTransactions>(
    idl as LazyTransactions,
    programId,
    provider,
  ) as Program<LazyTransactions>;
  return lazyTransactions;
}


export function getAccounts(
  lazySigner: PublicKey,
  instructions: TransactionInstruction[]
): AccountMeta[] {
  const accounts: Record<string, AccountMeta> = {};

  instructions.forEach((ix) => {
    accounts[ix.programId.toBase58()] ||= {
      pubkey: ix.programId,
      isWritable: false,
      isSigner: false
    }
    ix.keys.forEach((key) => {
      const pubkey = key.pubkey.toBase58();
      const isLazyTransactions = key.pubkey.equals(lazySigner);
      accounts[pubkey] = accounts[pubkey] || key;
      // Always not a signer if it's lazy transactions (will cpi sign)
      accounts[pubkey].isSigner = isLazyTransactions
        ? false
        : accounts[pubkey].isSigner || key.isSigner;
      // Always writable if it's lazy transactions.
      accounts[pubkey].isWritable =
        isLazyTransactions || accounts[pubkey].isWritable || key.isWritable;
    });
  });


  return Object.values(accounts);
}

export function getCompiledInstructions(
  accounts: AccountMeta[],
  instructions: TransactionInstruction[],
): CompiledInstruction[] {
  const accountIndicesByKey = accounts.reduce((acc, account, index) => {
    acc[account.pubkey.toBase58()] = index;

    return acc;
  }, {} as Record<string, number>);
  return instructions.map(instruction => {
    return {
      programIdIndex: accountIndicesByKey[instruction.programId.toBase58()],
      accounts: Buffer.from(instruction.keys.map(key => accountIndicesByKey[key.pubkey.toBase58()])),
      data: instruction.data
    }
  })
}

export type CompiledTransaction = { accounts: AccountMeta[], instructions: CompiledInstruction[], index: number };

const CompiledInstructionDef: any = {
  name: "CompiledInstruction",
  type: {
    kind: "struct",
    fields: [
      {
        name: "programIdIndex",
        type: "u8",
      },
      {
        name: "accounts",
        type: "bytes",
      },
      {
        name: "data",
        type: "bytes",
      },
    ],
  },
};
export const compiledIxLayout: Layout = IdlCoder.typeDefLayout(CompiledInstructionDef);
export function numBytes(compiledIx: CompiledInstruction): number {
  return 1 + 4 * 2 + compiledIx.accounts.length + compiledIx.data.length
}

export function ixToBin(ct: CompiledInstruction): Buffer {
  const ixBuffer = Buffer.alloc(numBytes(ct));
  compiledIxLayout.encode(ct, ixBuffer);
  return ixBuffer
}

export function ixFromBin(ct: Buffer): CompiledInstruction {
  return compiledIxLayout.decode(ct)
}

export function toLeaf(compiledTransaction: CompiledTransaction): Buffer {
  const ixBuffer = Buffer.concat(compiledTransaction.instructions.map(ixToBin));
  const accountBuffer = Buffer.concat(compiledTransaction.accounts.map(account => account.pubkey.toBuffer()))
  const indexBuffer = Buffer.alloc(4);
  indexBuffer.writeUInt32LE(compiledTransaction.index);
  const bytes = Buffer.concat([accountBuffer, ixBuffer, indexBuffer])
  return Buffer.from(keccak_256.digest(bytes))
}

export function compile(
  lazySigner: PublicKey,
  transactions: TransactionInstruction[][],
): { 
  merkleTree: MerkleTree,
  compiledTransactions: CompiledTransaction[] 
} {
  const compiledTransactions = transactions.map((instructions, index) => {
    const accounts = getAccounts(lazySigner, instructions);
    const compiledInstructions = getCompiledInstructions(accounts, instructions);
    return {
      instructions: compiledInstructions,
      accounts,
      index
    }
  });
  const merkleTree = new MerkleTree(compiledTransactions.map(toLeaf));

  return {
    compiledTransactions,
    merkleTree
  }
}
