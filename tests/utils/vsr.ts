import { createAtaAndMint, createMint, sendInstructions, toBN, createAtaAndTransfer } from "@helium/spl-utils";
import { Program, BN, AnchorProvider, web3 } from "@project-serum/anchor";
import { getGovernanceProgramVersion, MintMaxVoteWeightSource, withCreateRealm } from "@solana/spl-governance";
import { PublicKey, Keypair, TransactionInstruction, Transaction } from "@solana/web3.js";
import { VoterStakeRegistry } from "@helium/idls/lib/types/voter_stake_registry";
import { getAssociatedTokenAddress } from "@solana/spl-token";

export const SPL_GOVERNANCE_PID = new PublicKey("GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw");
export const VSR_PID = new PublicKey("hvsrY9UBtHhYRvstM2BWCsni81kevfn7B2DEhYbGA1a");


export async function initVsr(
  program: Program<VoterStakeRegistry>, 
  provider: AnchorProvider, 
  me: PublicKey, 
  hntMint: PublicKey,
  voterKp: Keypair,
  options: {delay: number, lockupPeriods: number, lockupAmount: number, stakeAmount: number},
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

  // Create Registrar
  const [registrar, registrar_bump] = PublicKey.findProgramAddressSync([
    realmPk.toBuffer(), Buffer.from("registrar", "utf-8"), hntMint.toBuffer(),
  ], VSR_PID);
  instructions.push(await program.methods.createRegistrar(registrar_bump).accounts({
    registrar,
    realm: realmPk,
    governanceProgramId: SPL_GOVERNANCE_PID,
    realmGoverningTokenMint: hntMint,
  }).instruction());

  // Configure voting mint
  const minLockupSeconds = 15811200; // 6 months
  instructions.push(
    await program.methods
      .configureVotingMint(
        0, // idx
        0, // digit shift
        new BN(0), // locked vote weight scaled factor
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

  // create voter
  const [voter, voter_bump] = PublicKey.findProgramAddressSync([
    registrar.toBuffer(), Buffer.from("voter", "utf-8"), voterKp.publicKey.toBuffer()
  ], VSR_PID);
  const [voterWeightRecord, voter_weight_record_bump] = PublicKey.findProgramAddressSync([
    registrar.toBuffer(), Buffer.from("voter-weight-record", "utf-8"), voterKp.publicKey.toBuffer()
  ], VSR_PID);
  instructions.push(await program.methods.createVoter(voter_bump, voter_weight_record_bump).accounts({
    registrar,
    voter,
    voterAuthority: voterKp.publicKey,
    voterWeightRecord,
    instructions: new PublicKey("Sysvar1nstructions1111111111111111111111111"),
    payer: voterKp.publicKey,
  }).signers([voterKp]).instruction());

  // create deposit entry
  const vault = await getAssociatedTokenAddress(hntMint, voter, true);
  instructions.push(await program.methods.createDepositEntry(0, {cliff: {}}, null, options.lockupPeriods).accounts({ // lock for 6 months
    registrar,
    voter,
    vault,
    depositMint: hntMint,
    voterAuthority: voterKp.publicKey,
    payer: voterKp.publicKey,
  }).signers([voterKp]).instruction());

  // deposit some hnt
  const fromAcc = await getAssociatedTokenAddress(hntMint, voterKp.publicKey);
  instructions.push(await program.methods.deposit(0, toBN(options.lockupAmount, 8)).accounts({ // deposit 2 hnt
    registrar,
    voter,
    vault,
    depositToken: fromAcc,
    depositAuthority: voterKp.publicKey,
  }).signers([voterKp]).instruction())

  await sendInstructions(provider, instructions, signers);

  return {
    registrar,
    realm: realmPk,
    voter,
    vault,
    hntMint,
  }
}