import {
  CompiledTransaction,
  ixToBin,
  ixFromBin,
  compiledIxLayout,
  numBytesCompiledTx,
} from "@helium/lazy-transactions-sdk";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import lo from "@solana/buffer-layout";
import * as borsh from "@project-serum/borsh";

export function inflatePubkeys(transactions: any[]) {
  transactions.forEach((instructions) => {
    instructions.forEach((instruction) => {
      instruction.programId = new PublicKey(instruction.programId);
      instruction.keys.forEach((key) => {
        key.pubkey = new PublicKey(key.pubkey);
      });
      instruction.data = Buffer.from(instruction.data);
    });
  });
}

const acctLayout = borsh.struct([
      borsh.bool("isSigner"),
      borsh.bool("isWritable"),
      borsh.publicKey("pubkey"),
    ]);
const schema: lo.Layout<CompiledTransaction> = borsh.struct([
  borsh.vec(acctLayout, "accounts"),
  borsh.vec(compiledIxLayout, "instructions"),
  borsh.u32("index"),
]);

export function compress(ct: CompiledTransaction): Buffer {
  const len =
    4 * 2 +
    4 +
    ct.accounts.length * (32 + 2) +
    ct.instructions.reduce((acc, ix) => {
      return acc + numBytesCompiledTx(ix);
    }, 0);
  const buf = Buffer.alloc(len);
  schema.encode(ct, buf);
  return buf;
}

export function decompress(ct: Buffer): CompiledTransaction {
  return schema.decode(ct);
}
