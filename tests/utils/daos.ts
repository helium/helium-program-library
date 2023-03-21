import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Keypair, ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import { HeliumSubDaos } from "../../target/types/helium_sub_daos";
import { createAtaAndMint, createMint, toBN } from "@helium/spl-utils";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { ThresholdType } from "@helium/circuit-breaker-sdk";
import { toU128 } from "../../packages/treasury-management-sdk/src";
import { DC_FEE } from "./fixtures";
import { subDaoKey, delegatorRewardsPercent } from "@helium/helium-sub-daos-sdk";

const CLOCKWORK_PID = new PublicKey(
  "CLoCKyJ6DXBJqqu2VWx9RLbgnwwR6BMHHuyasVmfMzBh"
);

export async function initTestDao(
  program: anchor.Program<HeliumSubDaos>,
  provider: anchor.AnchorProvider,
  epochRewards: number,
  authority: PublicKey,
  dcMint?: PublicKey,
  mint?: PublicKey,
  registrar?: PublicKey
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
      registrar: registrar || Keypair.generate().publicKey,
      authority: authority,
      netEmissionsCap: toBN(34.24, 8),
      emissionSchedule: [
        {
          startUnixTime: new anchor.BN(0),
          emissionsPerEpoch: new BN(epochRewards),
        },
      ],
      hstEmissionSchedule: [
        {
          startUnixTime: new anchor.BN(0),
          percent: 32,
        },
      ],
    })
    .preInstructions([
      createAssociatedTokenAccountIdempotentInstruction(
        me,
        await getAssociatedTokenAddress(mint, me),
        me,
        mint
      ),
    ])
    .accounts({
      hntMint: mint,
      dcMint,
      hstPool: await getAssociatedTokenAddress(mint, me),
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
  epochRewards?: number,
  registrar?: PublicKey
): Promise<{
  mint: PublicKey;
  subDao: PublicKey;
  treasury: PublicKey;
  rewardsEscrow: PublicKey;
  delegatorPool: PublicKey;
  treasuryCircuitBreaker: PublicKey;
}> {
  const daoAcc = await program.account.daoV0.fetch(dao);
  const dntMint = await createMint(provider, 8, authority, authority);
  const rewardsEscrow = await createAtaAndMint(
    provider,
    dntMint,
    0,
    provider.wallet.publicKey
  );
  const subDao = subDaoKey(dntMint)[0];

  const method = program.methods
    .initializeSubDaoV0({
      registrar: registrar || Keypair.generate().publicKey,
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
      delegatorRewardsPercent: delegatorRewardsPercent(6), // 6%
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
  const { treasury, treasuryCircuitBreaker, delegatorPool } =
    await method.pubkeys();
  await method.rpc();
  return {
    treasuryCircuitBreaker: treasuryCircuitBreaker!,
    mint: dntMint,
    subDao: subDao!,
    treasury: treasury!,
    rewardsEscrow,
    delegatorPool: delegatorPool!,
  };
}
