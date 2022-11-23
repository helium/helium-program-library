import { PublicKey } from "@solana/web3.js";

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
