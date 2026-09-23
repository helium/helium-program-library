import { Program } from "@coral-xyz/anchor";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import { PublicKey } from "@solana/web3.js";
import { toBN } from "../../packages/spl-utils/src";
import { DataCredits } from "../../target/types/data_credits";

export async function burnDataCredits({
  amount,
  program,
  subDao,
}: {
  program: Program<DataCredits>;
  amount: number;
  subDao: PublicKey;
}): Promise<{ subDaoEpochInfo: PublicKey }> {
  console.log("start delegate");
  const useData = await program.methods
    .delegateDataCreditsV0({
      amount: toBN(amount, 0),
      routerKey: (await HeliumKeypair.makeRandom()).address.b58,
    })
    .accountsPartial({
      subDao,
    });

  const delegatedDataCredits = (await useData.pubkeys()).delegatedDataCredits!;
  await useData.rpc({ skipPreflight: true });
  console.log("end delegate");
  const burn = program.methods
    .burnDelegatedDataCreditsV0({
      amount: toBN(amount, 0),
    })
    .accountsPartial({
      delegatedDataCredits,
    });

  await burn.rpc({ skipPreflight: true });

  console.log("end burn");
  return {
    subDaoEpochInfo: (await burn.pubkeys()).subDaoEpochInfo!,
  };
}
