import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { createAtaAndTransfer, createMintInstructions, sendInstructions, toBN } from "@helium/spl-utils";
import { AnchorProvider, BN, Program, web3 } from "@project-serum/anchor";
import { getGovernanceProgramVersion, MintMaxVoteWeightSource, withCreateRealm } from "@solana/spl-governance";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { positionKey } from "../../packages/voter-stake-registry-sdk/src";
export const SPL_GOVERNANCE_PID = new PublicKey("GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw");


export async function initVsr(
  program: Program<VoterStakeRegistry>, 
  provider: AnchorProvider, 
  me: PublicKey, 
  hntMint: PublicKey,
  positionKp: Keypair,
  options: {delay: number, lockupPeriods: number, lockupAmount: number},
) {
  await createAtaAndTransfer(
    provider,
    hntMint,
    toBN(1000, 8),
    provider.wallet.publicKey,
    positionKp.publicKey
  );
  await provider.connection.requestAirdrop(
    positionKp.publicKey,
    web3.LAMPORTS_PER_SOL
  );

  const programVersion = await getGovernanceProgramVersion(
    program.provider.connection,
    SPL_GOVERNANCE_PID
  );
  // Create Realm
  const name = `Realm-${new Keypair().publicKey.toBase58().slice(0, 6)}`;
  const realmAuthorityPk = me;
  let instructions: TransactionInstruction[] = [];
  const mintKeypair = Keypair.generate();
  let signers: Keypair[] = [positionKp, mintKeypair];
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

  const createRegistrar = program.methods.initializeRegistrarV0().accounts({
    realm: realmPk,
    realmGoverningTokenMint: hntMint,
  });
  instructions.push(await createRegistrar.instruction());
  const { registrar } = await createRegistrar.pubkeys();

  // Configure voting mint
  const minLockupSeconds = 15811200; // 6 months
  instructions.push(
    await program.methods
      .configureVotingMintV0({
        idx: 0, // idx
        digitShift: 0, // digit shift
        lockedVoteWeightScaledFactor: new BN(1_000_000_000), // locked vote weight scaled factor
        minimumRequiredLockupSecs: new BN(minLockupSeconds), // min lockup seconds
        maxExtraLockupVoteWeightScaledFactor: new BN(100), // scaled factor
        genesisVotePowerMultiplier: 3,
        genesisVotePowerMultiplierExpirationTs: new BN(1),
        lockupSaturationSecs: new BN(minLockupSeconds * 8), // lockup saturation seconds
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

  // create deposit entry
  const position = positionKey(mintKeypair.publicKey)[0];
  instructions.push(
    ...await createMintInstructions(provider, 0, position, position, mintKeypair)
  );
  instructions.push(
    await program.methods
      .initializePositionV0({
        kind: { cliff: {} },
        startTs: null,
        periods: options.lockupPeriods,
      })
      .accounts({
        // lock for 6 months
        registrar,
        mint: mintKeypair.publicKey,
        depositMint: hntMint,
        positionAuthority: positionKp.publicKey,
        payer: positionKp.publicKey,
      })
      .signers([positionKp])
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
        depositAuthority: positionKp.publicKey,
      })
      .signers([positionKp])
      .instruction()
  );

  await sendInstructions(provider, instructions, signers);

  return {
    registrar: registrar!,
    realm: realmPk,
    position,
    vault: await getAssociatedTokenAddress(hntMint, position, true),
    hntMint,
    mint: mintKeypair.publicKey,
  };
}