import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { createAtaAndTransfer, sendInstructions, toBN } from "@helium/spl-utils";
import { AnchorProvider, BN, Program, web3 } from "@project-serum/anchor";
import { getGovernanceProgramVersion, MintMaxVoteWeightSource, withCreateRealm } from "@solana/spl-governance";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
export const SPL_GOVERNANCE_PID = new PublicKey("GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw");


export async function initVsr(
  program: Program<VoterStakeRegistry>, 
  provider: AnchorProvider, 
  me: PublicKey, 
  hntMint: PublicKey,
  voterKp: Keypair,
  options: {delay: number, lockupPeriods: number, lockupAmount: number},
) {
  await createAtaAndTransfer(provider, hntMint, toBN(1000, 8), provider.wallet.publicKey, voterKp.publicKey);
  await provider.connection.requestAirdrop(voterKp.publicKey, web3.LAMPORTS_PER_SOL);

  const programVersion = await getGovernanceProgramVersion(
    program.provider.connection,
    SPL_GOVERNANCE_PID,
  );
  // Create Realm
  const name = `Realm-${new Keypair().publicKey.toBase58().slice(0, 6)}`;
  const realmAuthorityPk = me;
  let instructions: TransactionInstruction[] = [];
  let signers: Keypair[] = [voterKp];
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
    new BN(1),
  );

  const createRegistrar = program.methods.createRegistrar().accounts({
    realm: realmPk,
    realmGoverningTokenMint: hntMint,
  });
  instructions.push(await createRegistrar.instruction());
  const { registrar } = await createRegistrar.pubkeys();

  // Configure voting mint
  const minLockupSeconds = 15811200; // 6 months
  instructions.push(
    await program.methods
      .configureVotingMint(
        0, // idx
        0, // digit shift
        new BN(1_000_000_000), // locked vote weight scaled factor
        new BN(minLockupSeconds), // min lockup seconds
        new BN(100), // scaled factor
        3,
        new BN(1),
        new BN(minLockupSeconds * 8), // lockup saturation seconds
        null
      )
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

  const createVoter = program.methods
    .createVoter()
    .accounts({
      registrar,
      voterAuthority: voterKp.publicKey,
      payer: voterKp.publicKey,
    })
    .signers([voterKp]);
  instructions.push(await createVoter.instruction());
  const { voter } = await createVoter.pubkeys();

  // create deposit entry
  const vault = await getAssociatedTokenAddress(hntMint, voter!, true);
  instructions.push(await program.methods.createDepositEntry(0, {cliff: {}}, null, options.lockupPeriods).accounts({ // lock for 6 months
    registrar,
    depositMint: hntMint,
    voterAuthority: voterKp.publicKey,
    payer: voterKp.publicKey,
  }).signers([voterKp]).instruction());

  // deposit some hnt
  instructions.push(await program.methods.deposit(0, toBN(options.lockupAmount, 8)).accounts({ // deposit 2 hnt
    registrar,
    voter,
    mint: hntMint,
    depositAuthority: voterKp.publicKey,
  }).signers([voterKp]).instruction())

  await sendInstructions(provider, instructions, signers);

  return {
    registrar: registrar!,
    realm: realmPk,
    voter: voter!,
    vault,
    hntMint,
  }
}