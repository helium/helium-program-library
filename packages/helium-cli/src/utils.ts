import { init } from "@helium/helium-sub-daos-sdk";
import {
  createAtaAndMintInstructions,
  createMintInstructions,
  sendInstructions,
  toBN,
  truthy,
} from "@helium/spl-utils";
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import * as anchor from "@project-serum/anchor";
import {
  AccountMetaData,
  getGovernanceProgramVersion,
  getTokenOwnerRecordAddress,
  Governance,
  GovernanceAccountParser,
  InstructionData,
  Realm,
  VoteType,
  withAddSignatory,
  withCreateProposal,
  withCreateTokenOwnerRecord,
  withDepositGoverningTokens,
  withInsertTransaction,
  withSignOffProposal,
} from "@solana/spl-governance";
import {
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  Signer,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import fs from "fs";
import fetch from "node-fetch";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { BN } from "bn.js";

const SECONDS_PER_DAY = 86400;

export const getTimestampFromDays = (days: number) => days * SECONDS_PER_DAY;

export const getUnixTimestamp = async (
  provider: anchor.Provider
): Promise<bigint> => {
  const clock = await provider.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const unixTime = clock!.data.readBigInt64LE(8 * 4);
  return unixTime;
};

export async function exists(
  connection: Connection,
  account: PublicKey
): Promise<boolean> {
  return Boolean(await connection.getAccountInfo(account));
}

export async function createAndMint({
  provider,
  mintKeypair = Keypair.generate(),
  amount,
  metadataUrl,
  decimals = 8,
  to,
}: {
  provider: anchor.AnchorProvider;
  mintKeypair?: Keypair;
  amount: number;
  metadataUrl: string;
  decimals?: number;
  to?: PublicKey;
}): Promise<void> {
  const mintTo = to || provider.wallet.publicKey;
  const metadata = await fetch(metadataUrl).then((r) => r.json());

  if (!(await exists(provider.connection, mintKeypair.publicKey))) {
    console.log(`${metadata.name} Mint not found, creating...`);
    await sendInstructions(
      provider,
      [
        ...(await createMintInstructions(
          provider,
          decimals,
          provider.wallet.publicKey,
          provider.wallet.publicKey,
          mintKeypair
        )),
        ...(
          await createAtaAndMintInstructions(
            provider,
            mintKeypair.publicKey,
            toBN(amount, decimals),
            mintTo
          )
        ).instructions,
      ],
      [mintKeypair]
    );
  }

  const metadataAddress = (
    await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata", "utf-8"),
        METADATA_PROGRAM_ID.toBuffer(),
        mintKeypair.publicKey.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    )
  )[0];

  if (!(await exists(provider.connection, metadataAddress))) {
    console.log(`${metadata.name} Metadata not found, creating...`);
    await sendInstructions(provider, [
      await createCreateMetadataAccountV3Instruction(
        {
          metadata: metadataAddress,
          mint: mintKeypair.publicKey,
          mintAuthority: provider.wallet.publicKey,
          payer: provider.wallet.publicKey,
          updateAuthority: provider.wallet.publicKey,
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name: metadata.name,
              symbol: metadata.symbol,
              uri: metadataUrl,
              sellerFeeBasisPoints: 0,
              creators: [
                {
                  address: provider.wallet.publicKey,
                  verified: true,
                  share: 100,
                },
              ],
              collection: null,
              uses: null,
            },
            isMutable: true,
            collectionDetails: null,
          },
        }
      ),
    ]);
  }
}

export function loadKeypair(keypair: string): Keypair {
  return Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypair).toString()))
  );
}

export async function sendInstructionsOrCreateProposal({
  provider,
  instructions,
  signers = [],
  govProgramId,
  proposalName,
  payer = provider.wallet.publicKey,
  commitment = "confirmed",
  idlErrors = new Map(),
  votingMint,
  dao,
}: {
  provider: anchor.AnchorProvider;
  instructions: TransactionInstruction[];
  signers?: Signer[];
  govProgramId: PublicKey;
  dao: PublicKey;
  votingMint?: PublicKey; // Defaults to community token
  proposalName: string;
  payer?: PublicKey;
  commitment?: Commitment;
  idlErrors?: Map<number, string>;
}): Promise<string> {
  PublicKey.prototype.toString = PublicKey.prototype.toBase58;

  const signerKeys = Array.from(
    new Set(
      instructions.map((ix) =>
        ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58())
      )
    )
  ).map((k) => new PublicKey(k));

  const wallet = provider.wallet;
  // Missing signer, must be gov
  if (
    signerKeys.some(
      (k) =>
        !k.equals(provider.wallet.publicKey) &&
        !signers.some((s) => s.publicKey.equals(k))
    )
  ) {
    const proposalIxns = [];
    const hsd = await init(provider);
    const daoAcc = await hsd.account.daoV0.fetch(dao);
    const vsr = await initVsr(provider);
    const registrar = await vsr.account.registrar.fetch(daoAcc.registrar);

    const governanceKey = PublicKey.findProgramAddressSync(
      [
        Buffer.from("account-governance", "utf-8"),
        registrar.realm.toBuffer(),
        dao.toBuffer(),
      ],
      govProgramId
    )[0];
    const info = await provider.connection.getAccountInfo(governanceKey);
    const gov = GovernanceAccountParser(Governance)(
      governanceKey,
      info!
    ).account;
    const realmKey = gov.realm;
    const realmInfo = await provider.connection.getAccountInfo(realmKey);
    const realm = GovernanceAccountParser(Realm)(
      governanceKey,
      realmInfo!
    ).account;

    if (!votingMint) {
      votingMint = realm.communityMint;
    }
    const tokenOwner = await getTokenOwnerRecordAddress(
      govProgramId,
      realmKey,
      votingMint,
      wallet.publicKey
    );

    const version = await getGovernanceProgramVersion(
      provider.connection,
      govProgramId
    );

    if (!(await provider.connection.getAccountInfo(tokenOwner))) {
      await withCreateTokenOwnerRecord(
        proposalIxns,
        govProgramId,
        version,
        realmKey,
        wallet.publicKey,
        votingMint,
        wallet.publicKey
      );
      withDepositGoverningTokens(
        proposalIxns,
        govProgramId,
        version,
        realmKey,
        await getAssociatedTokenAddress(votingMint, wallet.publicKey),
        votingMint,
        wallet.publicKey,
        wallet.publicKey,
        wallet.publicKey,
        new BN(1)
      );
    }

    const proposal = await withCreateProposal(
      proposalIxns,
      govProgramId,
      version,
      realmKey,
      governanceKey,
      tokenOwner,
      proposalName,
      "Created via helium cli with args",
      votingMint,
      wallet.publicKey,
      gov.proposalCount,
      VoteType.SINGLE_CHOICE,
      ["Approve"],
      true,
      wallet.publicKey
    );

    const signatoryRecord = await withAddSignatory(
      proposalIxns,
      govProgramId,
      1,
      proposal,
      tokenOwner,
      wallet.publicKey,
      wallet.publicKey,
      wallet.publicKey
    );

    console.log(`Creating proposal ${proposalName}, ${proposal.toBase58()}`);
    await sendInstructions(provider, proposalIxns);

    let idx = 0;
    for (const instruction of instructions) {
      const addTxIxns = [];
      await withInsertTransaction(
        addTxIxns,
        govProgramId,
        version,
        governanceKey,
        proposal,
        tokenOwner,
        wallet.publicKey,
        idx,
        0,
        0,
        [
          new InstructionData({
            programId: instruction.programId,
            accounts: instruction.keys.map((key) => new AccountMetaData(key)),
            data: instruction.data,
          }),
        ],
        wallet.publicKey
      );
      console.log(
        `Adding txn ${idx} to proposal ${proposalName}, ${proposal.toBase58()}`
      );
      await sendInstructions(provider, addTxIxns);
      idx++;
    }

    const signOffIxns = [];
    await withSignOffProposal(
      signOffIxns,
      govProgramId,
      version,
      realmKey,
      governanceKey,
      proposal,
      wallet.publicKey,
      signatoryRecord,
      undefined
    );

    console.log(
      `Signing off on proposal ${proposalName}, ${proposal.toBase58()}`
    );
    return await sendInstructions(
      provider,
      signOffIxns,
      signers,
      payer,
      commitment,
      idlErrors
    );
  }

  return await sendInstructions(
    provider,
    instructions,
    signers,
    payer,
    commitment,
    idlErrors
  );
}
