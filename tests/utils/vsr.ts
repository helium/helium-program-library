import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import {
  createMintInstructions,
  sendInstructions,
  toBN,
  truthy,
} from "@helium/spl-utils";
import { AnchorProvider, BN, Program, web3 } from "@coral-xyz/anchor";
import {
  getGovernanceProgramVersion,
  MintMaxVoteWeightSource,
  withCreateRealm,
} from "@solana/spl-governance";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  TransactionInstruction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { positionKey } from "../../packages/voter-stake-registry-sdk/src";
export const SPL_GOVERNANCE_PID = new PublicKey(
  "hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S"
);

export async function initVsr(
  program: Program<VoterStakeRegistry>,
  provider: AnchorProvider,
  me: PublicKey,
  hntMint: PublicKey,
  positionUpdateAuthority: PublicKey,
  genesisVotePowerMultiplierExpirationTs = 1,
  genesisVotePowerMultiplier = 0,
) {
  const programVersion = await getGovernanceProgramVersion(
    program.provider.connection,
    SPL_GOVERNANCE_PID
  );
  // Create Realm
  const name = `Realm-${new Keypair().publicKey.toBase58().slice(0, 6)}`;
  const realmAuthorityPk = me;
  let instructions: TransactionInstruction[] = [];
  let signers: Keypair[] = [];
  const realmPk = await withCreateRealm(
    instructions,
    SPL_GOVERNANCE_PID,
    programVersion,
    name,
    realmAuthorityPk,
    hntMint,
    me,
    undefined,
    MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
    new BN(1)
  );

  const createRegistrar = program.methods
    .initializeRegistrarV0({
      positionUpdateAuthority,
      positionFreezeAuthorities: []
    })
    .accounts({
      realm: realmPk,
      realmGoverningTokenMint: hntMint,
      proxyConfig: null
    });
  instructions.push(await createRegistrar.instruction());
  const registrar = (await createRegistrar.pubkeys()).registrar as PublicKey;

  // Configure voting mint
  instructions.push(
    await program.methods
      .configureVotingMintV0({
        idx: 0, // idx
        baselineVoteWeightScaledFactor: new BN(0 * 1e9),
        maxExtraLockupVoteWeightScaledFactor: new BN(100 * 1e9), // scaled factor
        genesisVotePowerMultiplier: genesisVotePowerMultiplier,
        genesisVotePowerMultiplierExpirationTs: new BN(
          genesisVotePowerMultiplierExpirationTs
        ),
        lockupSaturationSecs: new BN(86400 * 365 * 4), // 4 years
      })
      .accounts({
        registrar,
        mint: hntMint,
      })
      .remainingAccounts([
        {
          pubkey: hntMint,
          isSigner: false,
          isWritable: false,
        },
      ])
      .instruction()
  );

  await sendInstructions(provider, instructions, signers);

  return {
    registrar: registrar!,
    realm: realmPk,
    hntMint,
  };
}

export async function createPosition(
  program: Program<VoterStakeRegistry>,
  provider: AnchorProvider,
  registrar: PublicKey,
  hntMint: PublicKey,
  options: { lockupPeriods: number; lockupAmount: number; kind?: any },
  positionKp?: Keypair
) {
  let positionOwner = positionKp?.publicKey || provider.wallet.publicKey;
  const instructions: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
  ];
  const mintKeypair = Keypair.generate();
  // create deposit entry
  const position = positionKey(mintKeypair.publicKey)[0];
  instructions.push(
    ...(await createMintInstructions(
      provider,
      0,
      position,
      position,
      mintKeypair
    ))
  );
  instructions.push(
    await program.methods
      .initializePositionV0({
        kind: typeof options.kind == "undefined" ? { cliff: {} } : options.kind,
        periods: options.lockupPeriods,
      })
      .accounts({
        registrar,
        mint: mintKeypair.publicKey,
        depositMint: hntMint,
        recipient: positionOwner,
      })
      .instruction()
  );

  // deposit some hnt
  instructions.push(
    await program.methods
      .depositV0({ amount: toBN(options.lockupAmount, 8) })
      .accounts({
        registrar,
        position,
        mint: hntMint,
        depositAuthority: positionOwner,
      })
      .signers([positionKp].filter(truthy) as Keypair[])
      .instruction()
  );

  await sendInstructions(
    provider,
    instructions,
    [mintKeypair, positionKp].filter(truthy)
  );

  return {
    position,
    vault: await getAssociatedTokenAddress(hntMint, position, true),
  };
}
