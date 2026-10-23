import { ed25519 } from "@noble/curves/ed25519";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  pipe,
  setTransactionMessageConfig,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  V1TransactionConfig,
} from "@solana/kit";
import {
  ComputeBudgetProgram,
  PACKET_DATA_SIZE,
  PublicKey,
  Signer,
  TransactionInstruction,
  V1_TRANSACTION_SIZE_LIMIT,
  VersionedMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { tableComputeUnitsForInstructions } from "./computeUnitTable";

// Runtime default for the loaded-accounts data size. A v1 header that leaves
// the field unset budgets zero instead, so it is always filled in.
const MAX_LOADED_ACCOUNTS_DATA_SIZE_LIMIT = 64 * 1024 * 1024;

// ComputeBudget instruction discriminators (first data byte).
const COMPUTE_BUDGET_IX_HEAP = 1;
const COMPUTE_BUDGET_IX_LIMIT = 2;
const COMPUTE_BUDGET_IX_PRICE = 3;
const COMPUTE_BUDGET_IX_DATA_SIZE = 4;

// v1 hard limits. Counted here so an over-limit chunk is a non-fit for the
// batchers instead of a compile error from kit.
export const V1_MAX_ACCOUNTS = 64;
export const V1_MAX_SIGNERS = 12;
export const V1_MAX_INSTRUCTIONS = 64;

export const getTransactionSizeLimit = (version: 0 | 1): number =>
  version === 1 ? V1_TRANSACTION_SIZE_LIMIT : PACKET_DATA_SIZE;

const isHeaderComputeBudgetIx = (ix: TransactionInstruction): boolean =>
  ix.programId.equals(ComputeBudgetProgram.programId) &&
  !(
    ix.data[0] < COMPUTE_BUDGET_IX_HEAP ||
    ix.data[0] > COMPUTE_BUDGET_IX_DATA_SIZE
  );

// Unique accounts include the payer and program ids. Header ComputeBudget ixs
// move into the message config, so they count toward nothing.
export const exceedsV1Limits = (
  feePayer: PublicKey,
  instructions: TransactionInstruction[]
): boolean => {
  const ixs = instructions.filter((ix) => !isHeaderComputeBudgetIx(ix));
  const accounts = new Set([feePayer.toBase58()]);
  const signers = new Set([feePayer.toBase58()]);
  for (const ix of ixs) {
    accounts.add(ix.programId.toBase58());
    for (const key of ix.keys) {
      accounts.add(key.pubkey.toBase58());
      if (key.isSigner) {
        signers.add(key.pubkey.toBase58());
      }
    }
  }
  return (
    accounts.size > V1_MAX_ACCOUNTS ||
    signers.size > V1_MAX_SIGNERS ||
    ixs.length > V1_MAX_INSTRUCTIONS
  );
};

// v1 carries the compute budget in the message header, not as instructions.
export const toV1TransactionConfig = (
  instructions: TransactionInstruction[]
): { instructions: TransactionInstruction[]; config: V1TransactionConfig } => {
  const values = new Map<number, Buffer>();
  const rest: TransactionInstruction[] = [];
  for (const ix of instructions) {
    const type = ix.data[0];
    if (!isHeaderComputeBudgetIx(ix)) {
      rest.push(ix);
      continue;
    }
    if (values.has(type)) {
      throw new Error(`Duplicate ComputeBudget instruction type ${type}`);
    }
    values.set(type, Buffer.from(ix.data).subarray(1));
  }

  const computeUnitLimit =
    values.get(COMPUTE_BUDGET_IX_LIMIT)?.readUInt32LE() ??
    tableComputeUnitsForInstructions(rest);
  const heap = values.get(COMPUTE_BUDGET_IX_HEAP);
  const microLamports = values.get(COMPUTE_BUDGET_IX_PRICE)?.readBigUInt64LE();
  return {
    instructions: rest,
    config: {
      computeUnitLimit,
      loadedAccountsDataSizeLimit:
        values.get(COMPUTE_BUDGET_IX_DATA_SIZE)?.readUInt32LE() ??
        MAX_LOADED_ACCOUNTS_DATA_SIZE_LIMIT,
      ...(heap ? { heapSize: heap.readUInt32LE() } : {}),
      ...(microLamports === undefined
        ? {}
        : {
            priorityFeeLamports:
              (microLamports * BigInt(computeUnitLimit) + BigInt(999_999)) /
              BigInt(1_000_000),
          }),
    },
  };
};

// web3.js 1.x reads v1 but cannot serialize or sign it, so this holds the
// kit-compiled message bytes and does both itself.
export class V1Transaction extends VersionedTransaction {
  constructor(readonly messageBytes: Uint8Array) {
    super(VersionedMessage.deserialize(messageBytes));
  }

  // Wire layout: message, then one signature per required signer, with no
  // length prefix. Built from `signatures` on every call so addSignature and
  // sign show up.
  serialize(): Uint8Array {
    const wire = new Uint8Array(
      this.messageBytes.length + 64 * this.signatures.length
    );
    wire.set(this.messageBytes);
    this.signatures.forEach((signature, i) =>
      wire.set(signature, this.messageBytes.length + 64 * i)
    );
    return wire;
  }

  // Synchronous like web3.js: Anchor's NodeWallet serializes right after
  // calling sign without awaiting it.
  sign(signers: Signer[]): void {
    const signerPubkeys = this.message.staticAccountKeys.slice(
      0,
      this.message.header.numRequiredSignatures
    );
    for (const signer of signers) {
      const index = signerPubkeys.findIndex((pubkey) =>
        pubkey.equals(signer.publicKey)
      );
      if (index < 0) {
        throw new Error(
          `Cannot sign with non signer key ${signer.publicKey.toBase58()}`
        );
      }
      // web3.js secret keys are seed ‖ pubkey; ed25519 signs with the seed.
      this.signatures[index] = ed25519.sign(
        this.messageBytes,
        signer.secretKey.slice(0, 32)
      );
    }
  }
}

const toKitRole = (isSigner: boolean, isWritable: boolean): AccountRole =>
  isSigner
    ? isWritable
      ? AccountRole.WRITABLE_SIGNER
      : AccountRole.READONLY_SIGNER
    : isWritable
      ? AccountRole.WRITABLE
      : AccountRole.READONLY;

export const compileV1Transaction = ({
  feePayer,
  recentBlockhash,
  instructions,
}: {
  feePayer: PublicKey;
  recentBlockhash: string;
  instructions: TransactionInstruction[];
}): V1Transaction => {
  const { instructions: rest, config } = toV1TransactionConfig(instructions);
  const message = pipe(
    createTransactionMessage({ version: 1 }),
    (m) => setTransactionMessageFeePayer(address(feePayer.toBase58()), m),
    // Compile needs a lifetime; lastValidBlockHeight never reaches the wire.
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: blockhash(recentBlockhash),
          lastValidBlockHeight: BigInt(0),
        },
        m
      ),
    (m) => setTransactionMessageConfig(config, m),
    (m) =>
      appendTransactionMessageInstructions(
        rest.map((ix) => ({
          programAddress: address(ix.programId.toBase58()),
          accounts: ix.keys.map((key) => ({
            address: address(key.pubkey.toBase58()),
            role: toKitRole(key.isSigner, key.isWritable),
          })),
          data: new Uint8Array(ix.data),
        })),
        m
      )
  );
  return new V1Transaction(
    new Uint8Array(compileTransaction(message).messageBytes)
  );
};
