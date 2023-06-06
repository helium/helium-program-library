import { AnchorProvider, Idl, IdlTypes, Program } from "@coral-xyz/anchor";
import { IdlCoder } from "@coral-xyz/anchor/dist/cjs/coder/borsh/idl";
import { LazyTransactions } from "@helium/idls/lib/types/lazy_transactions";
import {
  AccountMeta,
  PublicKey,
  TransactionInstruction
} from "@solana/web3.js";
import { keccak_256 } from "js-sha3";
import { PROGRAM_ID } from "./constants";
import { MerkleTree, TreeNode } from "./merkleTree";
// @ts-ignore
import { bulkSendTransactions, chunks } from "@helium/spl-utils";
import { Layout } from "buffer-layout";
import cliProgress from "cli-progress";
import * as Collections from "typescript-collections";

export * from "./constants";
export * from "./pdas";
export { MerkleTree };

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
    provider
  ) as Program<LazyTransactions>;
  return lazyTransactions;
}

export function getAccounts(
  lazySigner: PublicKey,
  instructions: TransactionInstruction[],
  mapToNonSigners: PublicKey[]
): AccountMeta[] {
  const accounts: Record<string, AccountMeta> = {};
  const nonSigners = new Set(mapToNonSigners.map((s) => s.toBase58()));

  instructions.forEach((ix) => {
    accounts[ix.programId.toBase58()] ||= {
      pubkey: ix.programId,
      isWritable: false,
      isSigner: false,
    };
    ix.keys.forEach((key) => {
      const pubkey = key.pubkey.toBase58();
      const isLazyTransactions = key.pubkey.equals(lazySigner);
      accounts[pubkey] = accounts[pubkey] || key;
      // Always not a signer if it's lazy transactions (will cpi sign)
      accounts[pubkey].isSigner = isLazyTransactions
        ? false
        : nonSigners.has(pubkey)
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
  instructions: TransactionInstruction[]
): CompiledInstruction[] {
  const accountIndicesByKey = accounts.reduce((acc, account, index) => {
    acc[account.pubkey.toBase58()] = index;

    return acc;
  }, {} as Record<string, number>);
  return instructions.map((instruction) => {
    return {
      programIdIndex: accountIndicesByKey[instruction.programId.toBase58()],
      accounts: Buffer.from(
        instruction.keys.map(
          (key) => accountIndicesByKey[key.pubkey.toBase58()]
        )
      ),
      data: instruction.data,
    };
  });
}

export type CompiledTransaction = {
  accounts: AccountMeta[];
  instructions: CompiledInstruction[];
  index: number;
  signerSeeds: Buffer[][];
};

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
export const compiledIxLayout: Layout = IdlCoder.typeDefLayout(
  CompiledInstructionDef
);
export function numBytesCompiledTx(compiledIx: CompiledInstruction): number {
  return 1 + 4 * 2 + compiledIx.accounts.length + compiledIx.data.length;
}

export function ixToBin(ct: CompiledInstruction): Buffer {
  const ixBuffer = Buffer.alloc(numBytesCompiledTx(ct));
  compiledIxLayout.encode(ct, ixBuffer);
  return ixBuffer;
}

export function ixFromBin(ct: Buffer): CompiledInstruction {
  return compiledIxLayout.decode(ct);
}

export function toLeaf(compiledTransaction: CompiledTransaction): Buffer {
  const ixBuffer = Buffer.concat(compiledTransaction.instructions.map(ixToBin));
  const accountBuffer = Buffer.concat(
    compiledTransaction.accounts.map((account) => account.pubkey.toBuffer())
  );
  const indexBuffer = Buffer.alloc(4);
  indexBuffer.writeUInt32LE(compiledTransaction.index);
  const toCreate = compiledTransaction.signerSeeds.reduce(
    (acc, curr) => Buffer.concat([acc, Buffer.concat(curr)]),
    Buffer.from([])
  );
  const bytes = Buffer.concat([accountBuffer, ixBuffer, toCreate, indexBuffer]);
  return Buffer.from(keccak_256.digest(bytes));
}

export function getCanopySize(canopyDepth: number): number {
  return 1 + Math.max(((1 << (canopyDepth + 1)) - 2) * 32, 0);
}

export function getCanopy({
  merkleTree,
  cacheDepth,
}: {
  merkleTree: MerkleTree;
  cacheDepth: number;
}): TreeNode[] {
  let curr = merkleTree.leaves[0];
  while (curr.parent) {
    curr = curr.parent;
  }
  const root = curr;
  const canopy: TreeNode[] = [];
  const q = new Collections.Queue<TreeNode>();
  q.enqueue(root);
  let maxLevel = root.level;
  while (!q.isEmpty()) {
    const curr = q.dequeue()!;
    if (maxLevel - curr.level > cacheDepth) {
      break;
    }

    if (curr.left) {
      q.enqueue(curr.left);
    } else if (curr.level >= 1) {
      // add dummy leaves
      q.enqueue({
        node: Buffer.alloc(32),
        left: undefined,
        right: undefined,
        parent: curr,
        level: curr.level - 1,
        id: 0,
      });
    }

    if (curr.right) {
      q.enqueue(curr.right);
    } else if (curr.level >= 1) {
      // add dummy leaves
      q.enqueue({
        node: Buffer.alloc(32),
        left: undefined,
        right: undefined,
        parent: curr,
        level: curr.level - 1,
        id: 0,
      });
    }
    canopy.push(curr);
  }
  canopy.shift(); // remove root
  return canopy;
};

export async function fillCanopy({
  program,
  lazyTransactions,
  merkleTree,
  canopy,
  cacheDepth,
  showProgress = false,
}: {
  program: Program<LazyTransactions>;
  lazyTransactions: PublicKey;
  merkleTree?: MerkleTree;
  canopy?: TreeNode[];
  cacheDepth: number;
  showProgress?: boolean;
}): Promise<void> {
  if (!canopy) {
    canopy = getCanopy({
      merkleTree: merkleTree!,
      cacheDepth,
    });
  }

  // Write 30 leaves at a time
  const lazyTransactionsAcc = await program.account.lazyTransactionsV0.fetch(
    lazyTransactions
  );
  const chunkSize = 30;
  const canopyChunks = chunks(canopy, chunkSize);
  let progress: cliProgress.SingleBar;
  if (showProgress) {
    console.log("Setting canopy");
    progress = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );
    progress.start(canopy.length, 0);
  }
  const txs = await Promise.all(
    canopyChunks.map(async (leaves, index) => {
      const bytes = Buffer.concat(leaves.map((leaf) => leaf.node));
      const tx = await program.methods
        .setCanopyV0({
          offset: 32 * chunkSize * index,
          bytes,
        })
        .accountsStrict({
          lazyTransactions,
          canopy: lazyTransactionsAcc.canopy,
          authority: lazyTransactionsAcc.authority,
        })
        .transaction();

      // @ts-ignore
      tx.feePayer = program.provider.wallet.publicKey;

      return tx;
    })
  );

  // Bulk send txs
  await bulkSendTransactions(
    program.provider,
    txs,
    ({ totalProgress }) =>
      progress && progress.update(totalProgress * chunkSize)
  );
}

export type LazyTransaction = {
  instructions: TransactionInstruction[];
  signerSeeds: Buffer[][];
};
export function compile(
  lazySigner: PublicKey,
  transactions: LazyTransaction[],
  programId: PublicKey = PROGRAM_ID
): {
  merkleTree: MerkleTree;
  compiledTransactions: CompiledTransaction[];
} {
  const compiledTransactions = compileNoMerkle(lazySigner, transactions, programId)
  const merkleTree = new MerkleTree(compiledTransactions.map(toLeaf));

  return {
    compiledTransactions,
    merkleTree,
  };
}

export function compileNoMerkle(
  lazySigner: PublicKey,
  transactions: LazyTransaction[],
  programId: PublicKey = PROGRAM_ID
): CompiledTransaction[] {
  const compiledTransactions = transactions.map((tx, index) => {
    const mapToNonSigners = tx.signerSeeds.map((seeds) => {
      return PublicKey.createProgramAddressSync(seeds, programId);
    });
    const accounts = getAccounts(lazySigner, tx.instructions, mapToNonSigners);
    const compiledInstructions = getCompiledInstructions(
      accounts,
      tx.instructions
    );
    return {
      instructions: compiledInstructions,
      signerSeeds: tx.signerSeeds.map((ss) => ss.slice(2)),
      accounts,
      index,
    };
  });

  return compiledTransactions
}
