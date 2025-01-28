import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  delegatorRewardsPercent,
  subDaoKey,
} from "@helium/helium-sub-daos-sdk";
import { createAtaAndMint, createMint, toBN } from "@helium/spl-utils";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { ComputeBudgetProgram, Keypair, PublicKey } from "@solana/web3.js";
import { toU128 } from "../../packages/treasury-management-sdk/src";
import { HeliumSubDaos } from "../../target/types/helium_sub_daos";
import { DC_FEE } from "./fixtures";

export async function initTestDao(
  program: anchor.Program<HeliumSubDaos>,
  provider: anchor.AnchorProvider,
  epochRewards: number,
  authority: PublicKey,
  dcMint?: PublicKey,
  mint?: PublicKey,
  registrar?: PublicKey,
): Promise<{
  mint: PublicKey;
  dao: PublicKey;
  rewardsEscrow: PublicKey;
  delegatorPool: PublicKey;
}> {
  const me = provider.wallet.publicKey;
  if (!mint) {
    mint = await createMint(provider, 8, me, me);
  }

  if (!dcMint) {
    dcMint = await createMint(provider, 8, me, me);
  }

  const rewardsEscrow = await createAtaAndMint(
    provider,
    mint,
    0,
    provider.wallet.publicKey
  );

  const hstWallet = Keypair.generate().publicKey;
  const method = await program.methods
    .initializeDaoV0({
      delegatorRewardsPercent: delegatorRewardsPercent(6), // 6%
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
          percent: 0,
        },
      ],
      proposalNamespace: me,
    })
    .preInstructions([
      createAssociatedTokenAccountIdempotentInstruction(
        me,
        await getAssociatedTokenAddress(mint, me),
        me,
        mint
      ),
      createAssociatedTokenAccountIdempotentInstruction(
        me,
        await getAssociatedTokenAddress(mint, hstWallet),
        hstWallet,
        mint
      ),
    ])
    .accounts({
      rewardsEscrow,
      hntMint: mint,
      dcMint,
      hstPool: await getAssociatedTokenAddress(mint, hstWallet),
    });

  const { dao, delegatorPool } = await method.pubkeys();

  if (!(await provider.connection.getAccountInfo(dao!))) {
    await method.rpc({ skipPreflight: true });
  }

  return {
    mint: mint!,
    dao: dao!,
    rewardsEscrow,
    delegatorPool: delegatorPool!,
  };
}

export async function initTestSubdao(
  {hsdProgram, provider, authority, dao, epochRewards, registrar, numTokens, activeDeviceAuthority}: {
  hsdProgram: anchor.Program<HeliumSubDaos>,
  provider: anchor.AnchorProvider,
  authority: PublicKey,
  dao: PublicKey,
  epochRewards?: number,
  registrar?: PublicKey,
  numTokens?: number | BN,
  activeDeviceAuthority?: PublicKey,
}): Promise<{
  mint: PublicKey;
  subDao: PublicKey;
  treasury: PublicKey;
  treasuryCircuitBreaker: PublicKey;
}> {
  const daoAcc = await hsdProgram.account.daoV0.fetch(dao);
  const dntMint = await createMint(provider, 8, authority, authority);
  if (numTokens) {
    await createAtaAndMint(provider, dntMint, numTokens, authority);
  }
  const subDao = subDaoKey(dntMint)[0];

  const method = hsdProgram.methods
    .initializeSubDaoV0({
      registrar: registrar || Keypair.generate().publicKey,
      onboardingDcFee: toBN(DC_FEE, 0),
      onboardingDataOnlyDcFee: toBN(DC_FEE / 4, 0),
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
      dcBurnAuthority: authority,
      activeDeviceAuthority: activeDeviceAuthority || authority,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
    ])
    .accounts({
      dao,
      dntMint,
      hntMint: daoAcc.hntMint,
    });
  const { treasury, treasuryCircuitBreaker } = await method.pubkeys();
  await method.rpc({ skipPreflight: true });
  return {
    treasuryCircuitBreaker: treasuryCircuitBreaker!,
    mint: dntMint,
    subDao: subDao!,
    treasury: treasury!,
  };
}
