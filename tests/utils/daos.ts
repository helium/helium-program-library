import * as anchor from "@project-serum/anchor";
import { BN } from "@project-serum/anchor";
import { ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import { HeliumSubDaos } from "../../target/types/helium_sub_daos";
import { createAtaAndMint, createMint, toBN } from "@helium/spl-utils";
import { ThresholdType } from "@helium/circuit-breaker-sdk";
import { toU128 } from "../../packages/treasury-management-sdk/src";
import { DC_FEE } from "./fixtures";

export async function initTestDao(
  program: anchor.Program<HeliumSubDaos>,
  provider: anchor.AnchorProvider,
  epochRewards: number,
  authority: PublicKey,
  dcMint?: PublicKey,
  mint?: PublicKey
): Promise<{
  mint: PublicKey;
  dao: PublicKey;
}> {
  const me = provider.wallet.publicKey;
  if (!mint) {
    mint = await createMint(provider, 8, me, me);
  }

  if (!dcMint) {
    dcMint = await createMint(provider, 8, me, me);
  }

  const method = await program.methods
    .initializeDaoV0({
      authority: authority,
      emissionSchedule: [
        {
          startUnixTime: new anchor.BN(0),
          emissionsPerEpoch: new BN(epochRewards),
        },
      ],
    })
    .accounts({
      hntMint: mint,
      dcMint,
    });
  const { dao } = await method.pubkeys();

  if (!(await provider.connection.getAccountInfo(dao!))) {
    await method.rpc({ skipPreflight: true });
  }

  return { mint: mint!, dao: dao! };
}

export async function initTestSubdao(
  program: anchor.Program<HeliumSubDaos>,
  provider: anchor.AnchorProvider,
  authority: PublicKey,
  dao: PublicKey,
  epochRewards?: number
): Promise<{
  mint: PublicKey;
  subDao: PublicKey;
  treasury: PublicKey;
  rewardsEscrow: PublicKey;
  treasuryCircuitBreaker: PublicKey;
}> {
  const daoAcc = await program.account.daoV0.fetch(dao);
  const dntMint = await createMint(provider, 8, authority, authority);
  const rewardsEscrow = await createAtaAndMint(provider, dntMint, 0, provider.wallet.publicKey)
  const method = await program.methods
    .initializeSubDaoV0({
      onboardingDcFee: toBN(DC_FEE, 0),
      authority: authority,
      emissionSchedule: [
        {
          startUnixTime: new anchor.BN(0),
          emissionsPerEpoch: new BN(epochRewards || 10),
        },
      ],
      treasuryCurve: {
        exponentialCurveV0: {
          k: toU128(1),
        },
      } as any,
      treasuryWindowConfig: {
        windowSizeSeconds: new anchor.BN(60),
        thresholdType: ThresholdType.Absolute as never,
        threshold: new anchor.BN("10000000000000000000"),
      },
      dcBurnAuthority: authority,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
    ])
    .accounts({
      dao,
      rewardsEscrow,
      dntMint,
      hntMint: daoAcc.hntMint,
      activeDeviceAggregator: new PublicKey(
        "GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR"
      ), // Copied from mainnet to localnet
    });
  const { subDao, treasury, treasuryCircuitBreaker } = await method.pubkeys();
  await method.rpc({ skipPreflight: true });

  return {
    treasuryCircuitBreaker: treasuryCircuitBreaker!,
    mint: dntMint,
    subDao: subDao!,
    treasury: treasury!,
    rewardsEscrow,
  };
}