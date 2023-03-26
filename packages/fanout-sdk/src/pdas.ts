import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export function fanoutConfigKey(
  name: string,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fanout-config", "utf-8"), Buffer.from(name, "utf-8")],
    programId
  );
}

export function fanoutNativeAccountKey(
  fanout: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fanout-native-account", "utf-8"), fanout.toBuffer()],
    programId
  );
}

export function fanoutConfigForMintKey(
  fanout: PublicKey,
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fanout-config", "utf-8"), fanout.toBuffer(), mint.toBuffer()],
    programId
  );
}
export function membershipVoucherKey(
  fanout: PublicKey,
  member: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fanout-membership", "utf-8"), fanout.toBuffer(), member.toBuffer()],
    programId
  );
}

export function membershipMintVoucherKey(
  fanoutForMint: PublicKey,
  membershipKey: PublicKey,
  fanoutMint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("fanout-membership", "utf-8"),
      fanoutForMint.toBuffer(),
      membershipKey.toBuffer(),
      fanoutMint.toBuffer(),
    ],
    programId
  );
}
