import {
  createAtaAndMintInstructions,
  createMintInstructions,
  sendInstructions,
  toBN
} from "@helium/spl-utils";
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as METADATA_PROGRAM_ID
} from "@metaplex-foundation/mpl-token-metadata";
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
  withSignOffProposal
} from "@solana/spl-governance";
import {
  AuthorityType,
  createSetAuthorityInstruction,
  getAssociatedTokenAddress
} from "@solana/spl-token";
import {
  AddressLookupTableProgram,
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  Signer,
  SYSVAR_CLOCK_PUBKEY, TransactionInstruction,
  TransactionMessage,
  VersionedTransaction
} from "@solana/web3.js";
import { sleep } from "@switchboard-xyz/common";
import { BN } from "bn.js";
import fs from "fs";
import fetch from "node-fetch";

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
  mintAuthority = provider.wallet.publicKey,
  freezeAuthority = provider.wallet.publicKey,
}: {
  provider: anchor.AnchorProvider;
  mintKeypair?: Keypair;
  amount: number;
  metadataUrl: string;
  decimals?: number;
  to?: PublicKey;
  mintAuthority?: PublicKey;
  freezeAuthority?: PublicKey;
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
          freezeAuthority,
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

    // Set mint authority to the proper authority
    if (!provider.wallet.publicKey.equals(mintAuthority)) {
      await sendInstructions(provider, [
        await createSetAuthorityInstruction(
          mintKeypair.publicKey,
          provider.wallet.publicKey,
          AuthorityType.MintTokens,
          mintAuthority
        ),
      ]);
    }
  }
}

export function loadKeypair(keypair: string): Keypair {
  return Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypair).toString()))
  );
}

export function isLocalhost(provider: anchor.AnchorProvider): boolean {
  const ep = provider.connection.rpcEndpoint
  return ep.includes("127.0.0.1") || ep.includes("localhost");

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
  walletSigner,
}: {
  walletSigner?: Signer; // If we need to send a versioned tx, this signs as the wallet. Version tx not supported by Wallet interface yet
  provider: anchor.AnchorProvider;
  instructions: TransactionInstruction[];
  signers?: Signer[];
  govProgramId: PublicKey;
  votingMint?: PublicKey; // Defaults to community token
  proposalName: string;
  payer?: PublicKey;
  commitment?: Commitment;
  idlErrors?: Map<number, string>;
}): Promise<string> {
  PublicKey.prototype.toString = PublicKey.prototype.toBase58;

  const signerKeys = Array.from(
    new Set(
      ...instructions.map((ix) =>
        ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58())
      )
    )
  ).map((k) => new PublicKey(k));
  
  // console.log(
  //   instructions.map((ix) =>
  //     ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58())
  //   )
  // );

  const wallet = provider.wallet;
  // Missing signer, must be gov
  const missingSigs = (
    await Promise.all(
      signerKeys
        .filter(
          (k) =>
            !k.equals(provider.wallet.publicKey) &&
            !signers.some((s) => s.publicKey.equals(k))
        )
        .map(async (governanceKey) => {
          const info = await provider.connection.getAccountInfo(governanceKey);
          return {
            info,
            governanceKey,
          };
        })
    )
  ).filter((r) => r.info && r.info.owner.equals(govProgramId));

  if (missingSigs[0]) {
    const proposalIxns = [];
    const { governanceKey, info } = missingSigs[0];
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
      try {
        await sendInstructions(provider, addTxIxns);
      } catch (e: any) {
        if (e.message.includes("Transaction too large")) {
          const [sig, lut] = await AddressLookupTableProgram.createLookupTable({
            authority: provider.wallet.publicKey,
            payer: provider.wallet.publicKey,
            recentSlot: await provider.connection.getSlot(),
          });
          const addAddressesInstruction =
            await AddressLookupTableProgram.extendLookupTable({
              payer: provider.wallet.publicKey,
              authority: provider.wallet.publicKey,
              lookupTable: lut,
              addresses: addTxIxns[0].keys
                .map((k) => k.pubkey)
                .filter((p) => !walletSigner.publicKey.equals(p)),
            });
          await sendInstructions(provider, [sig, addAddressesInstruction], []);
          await sleep(4000); // Wait for the lut to activate
          const lookupTableAcc = (
            await provider.connection.getAddressLookupTable(lut)
          ).value;
          const tx = new VersionedTransaction(
            new TransactionMessage({
              payerKey: payer,
              recentBlockhash: (await provider.connection.getLatestBlockhash())
                .blockhash,
              instructions: [addTxIxns[0]],
            }).compileToV0Message([lookupTableAcc])
          );
          console.log("Created lookup table since ix too big", lut.toBase58());
          await tx.sign([walletSigner]);
          const sent = await provider.connection.sendTransaction(tx);
          await provider.connection.confirmTransaction(sent, "confirmed");
          console.log(`Added tx ${idx}`, sent);

          await AddressLookupTableProgram.closeLookupTable({
            lookupTable: lut,
            authority: provider.wallet.publicKey,
            recipient: provider.wallet.publicKey,
          });
          console.log("Closed lookup table");
        }
      }
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
