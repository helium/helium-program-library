import * as anchor from "@coral-xyz/anchor";
import { idlAddress } from "@coral-xyz/anchor/dist/cjs/idl";
import {
  bulkSendTransactions,
  createAtaAndMintInstructions,
  createMintInstructions,
  sendInstructions,
  toBN,
  withPriorityFees,
} from "@helium/spl-utils";
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  AccountMetaData,
  BPF_UPGRADE_LOADER_ID,
  getGovernanceProgramVersion,
  getProposalTransactionAddress,
  getTokenOwnerRecordAddress,
  Governance,
  GovernanceAccountParser,
  InstructionData,
  ProposalTransaction,
  Realm,
  Vote,
  VoteType,
  withAddSignatory,
  withCastVote,
  withCreateProposal,
  withCreateTokenOwnerRecord,
  withDepositGoverningTokens,
  withExecuteTransaction,
  withInsertTransaction,
  withRelinquishVote,
  withSignOffProposal,
  withWithdrawGoverningTokens,
  YesNoVote,
} from "@solana/spl-governance";
import {
  AuthorityType,
  createSetAuthorityInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import {
  AddressLookupTableProgram,
  Cluster,
  Commitment,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Signer,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import Squads, { getTxPDA } from "@sqds/sdk";
import * as multisig from "@sqds/multisig";
import { BN } from "bn.js";
import fs from "fs";
import fetch from "node-fetch";
import { packageInstructions } from "./squads-batch-optimizer";

const SECONDS_PER_DAY = 86400;

// Goal = 3 proof nodes needed
export const merkleSizes = [
  [3, 8, 0],
  [5, 8, 2],
  [14, 64, 11],
  [15, 64, 12],
  [16, 64, 13],
  [17, 64, 14],
  [18, 64, 15],
  [19, 64, 16],
  [20, 64, 17],
  [24, 64, 17],
];

export async function createProgramSetAuthorityInstruction(
  programId: PublicKey,
  upgradeAuthority: PublicKey,
  newAuthority: PublicKey
) {
  const bpfUpgradableLoaderId = BPF_UPGRADE_LOADER_ID;

  const [programDataAddress] = await PublicKey.findProgramAddress(
    [programId.toBuffer()],
    bpfUpgradableLoaderId
  );

  const keys = [
    {
      pubkey: programDataAddress,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: upgradeAuthority,
      isWritable: false,
      isSigner: true,
    },
    {
      pubkey: newAuthority,
      isWritable: false,
      isSigner: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: bpfUpgradableLoaderId,
    data: Buffer.from([4, 0, 0, 0]), // SetAuthority instruction bincode
  });
}

export async function createSetIdlAuthorityInstruction(
  programId: PublicKey,
  upgradeAuthority: PublicKey,
  newAuthority: PublicKey
) {
  const prefix = Buffer.from("0a69e9a778bcf440", "hex");
  const ixn = Buffer.from("04", "hex");
  const data = Buffer.concat([prefix.reverse(), ixn, newAuthority.toBuffer()]);
  const idlAddr = await idlAddress(programId);

  const keys = [
    {
      pubkey: idlAddr,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: upgradeAuthority,
      isWritable: false,
      isSigner: true,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId,
    data,
  });
}

export async function createIdlUpgradeInstruction(
  programId: PublicKey,
  bufferAddress: PublicKey,
  upgradeAuthority: PublicKey
) {
  const prefix = Buffer.from("0a69e9a778bcf440", "hex");
  const ixn = Buffer.from("03", "hex");
  const data = Buffer.concat([prefix.reverse(), ixn]);
  const idlAddr = await idlAddress(programId);

  const keys = [
    {
      pubkey: bufferAddress,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: idlAddr,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: upgradeAuthority,
      isWritable: true,
      isSigner: true,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId,
    data,
  });
}

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

async function withRetries<A>(
  tries: number,
  input: () => Promise<A>
): Promise<A> {
  for (let i = 0; i < tries; i++) {
    try {
      return await input();
    } catch (e) {
      console.log(`Retrying ${i}...`, e);
    }
  }
  throw new Error("Failed after retries");
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
  updateAuthority = provider.wallet.publicKey,
}: {
  provider: anchor.AnchorProvider;
  mintKeypair?: Keypair;
  amount: number;
  metadataUrl: string;
  decimals?: number;
  to?: PublicKey;
  mintAuthority?: PublicKey;
  freezeAuthority?: PublicKey;
  updateAuthority?: PublicKey;
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
          updateAuthority: updateAuthority,
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name: metadata.name,
              symbol: metadata.symbol,
              uri: metadataUrl,
              sellerFeeBasisPoints: 0,
              creators: null,
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
  const ep = provider.connection.rpcEndpoint;
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
  executeProposal = false,
  walletSigner,
}: {
  executeProposal?: boolean;
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

  const signerSet = new Set(
    instructions
      .map((ix) =>
        ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58())
      )
      .flat()
  );
  const signerKeys = Array.from(signerSet).map((k) => new PublicKey(k));

  const nonMissingSignerIxs = instructions.filter(
    (ix) =>
      !ix.keys.some(
        (k) => k.isSigner && !k.pubkey.equals(provider.wallet.publicKey)
      )
  );
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
            nativeKey: PublicKey.findProgramAddressSync(
              [
                Buffer.from("native-treasury", "utf-8"),
                governanceKey.toBuffer(),
              ],
              govProgramId
            )[0],
          };
        })
    )
  ).filter((r) => r.info && r.info.owner.equals(govProgramId));

  for (const { governanceKey, info, nativeKey } of missingSigs) {
    const proposalIxns = [];
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
      votingMint = realm.communityMint!;
    }
    const tokenOwner = await getTokenOwnerRecordAddress(
      govProgramId,
      realmKey,
      votingMint!,
      wallet.publicKey
    );

    const version = await getGovernanceProgramVersion(
      provider.connection,
      govProgramId
    );

    const tokenOwnerExists = !!(await provider.connection.getAccountInfo(
      tokenOwner
    ));
    if (!tokenOwnerExists) {
      await withCreateTokenOwnerRecord(
        proposalIxns,
        govProgramId,
        version,
        realmKey,
        wallet.publicKey,
        votingMint!,
        wallet.publicKey
      );
    }

    const acct = await getAssociatedTokenAddress(votingMint!, wallet.publicKey);
    const balance = new BN(
      (await provider.connection.getTokenAccountBalance(acct)).value.amount
    );
    if (balance.gt(new BN(0))) {
      withDepositGoverningTokens(
        proposalIxns,
        govProgramId,
        version,
        realmKey,
        acct,
        votingMint!,
        wallet.publicKey,
        wallet.publicKey,
        wallet.publicKey,
        balance
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
      votingMint!,
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
    const relevantInstructions = instructions.filter((ix) =>
      ix.keys.some(
        (k) =>
          (k.pubkey.equals(nativeKey) || k.pubkey.equals(governanceKey)) &&
          k.isSigner
      )
    );
    for (const instruction of relevantInstructions) {
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
              // @ts-ignore
              addresses: addTxIxns[0].keys
                .map((k) => k.pubkey)
                .filter((p) => !walletSigner!.publicKey.equals(p)),
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
            }).compileToV0Message([lookupTableAcc!])
          );
          console.log("Created lookup table since ix too big", lut.toBase58());
          await tx.sign([walletSigner!]);
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
    await sendInstructions(
      provider,
      signOffIxns,
      signers,
      payer,
      commitment,
      idlErrors
    );

    if (executeProposal) {
      const voteYes = [];

      const votingRecord = await withCastVote(
        voteYes,
        govProgramId,
        version,
        realmKey,
        governanceKey,
        proposal,
        tokenOwner,
        tokenOwner,
        wallet.publicKey,
        votingMint!,
        Vote.fromYesNoVote(YesNoVote.Yes),
        wallet.publicKey
      );

      await sendInstructions(
        provider,
        voteYes,
        signers,
        payer,
        commitment,
        idlErrors
      );

      await sleep(5000); // wait past any hold up time
      for (let idx = 0; idx < relevantInstructions.length; idx++) {
        const executeIxns = [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 }),
        ];
        const transactionAddress = await getProposalTransactionAddress(
          govProgramId,
          version,
          proposal,
          0,
          idx
        );
        const transactionInfo = await provider.connection.getAccountInfo(
          transactionAddress
        );
        const transaction = GovernanceAccountParser(ProposalTransaction)(
          governanceKey,
          transactionInfo!
        ).account;
        await withExecuteTransaction(
          executeIxns,
          govProgramId,
          version,
          governanceKey,
          proposal,
          transactionAddress,
          transaction.instructions
        );
        console.log(
          `Executing txn ${idx} on proposal ${proposalName}, ${proposal.toBase58()}`
        );
        await sendInstructions(provider, executeIxns);
      }
      const relinquish = [];
      withRelinquishVote(
        relinquish,
        govProgramId,
        version,
        realmKey,
        governanceKey,
        proposal,
        tokenOwner,
        votingMint!,
        votingRecord,
        wallet.publicKey,
        wallet.publicKey
      );
      await sendInstructions(provider, relinquish);
    }

    if (balance.gt(new BN(0)) && executeProposal) {
      const withdrawIxns = [];

      await withWithdrawGoverningTokens(
        withdrawIxns,
        govProgramId,
        version,
        realmKey,
        await getAssociatedTokenAddress(votingMint!, wallet.publicKey),
        votingMint!,
        wallet.publicKey
      );
      await sendInstructions(provider, withdrawIxns);
    }
  }

  return await sendInstructions(
    provider,
    nonMissingSignerIxs,
    signers,
    payer,
    commitment,
    idlErrors
  );
}

export async function createCloseBufferInstruction(
  programId: PublicKey,
  bufferAddress: PublicKey,
  upgradeAuthority: PublicKey,
  recipientAddress: PublicKey
) {
  const bpfUpgradableLoaderId = BPF_UPGRADE_LOADER_ID;

  const [programDataAddress] = await PublicKey.findProgramAddress(
    [programId.toBuffer()],
    bpfUpgradableLoaderId
  );

  const keys = [
    {
      pubkey: bufferAddress,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: recipientAddress,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: upgradeAuthority,
      isWritable: false,
      isSigner: true,
    },
    {
      pubkey: programDataAddress,
      isWritable: false,
      isSigner: false,
    },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isWritable: false,
      isSigner: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: bpfUpgradableLoaderId,
    data: Buffer.from([5, 0, 0, 0]), // Upgrade instruction bincode
  });
}

export async function sendInstructionsOrSquadsV4({
  provider,
  instructions,
  signers = [],
  payer = provider.wallet.publicKey,
  commitment = "confirmed",
  idlErrors = new Map(),
  multisig: multisigPda,
}: {
  provider: anchor.AnchorProvider;
  instructions: TransactionInstruction[];
  signers?: Signer[];
  payer?: PublicKey;
  commitment?: Commitment;
  idlErrors?: Map<number, string>;
  multisig?: PublicKey;
}): Promise<string | undefined> {
  if (!multisig) {
    return await sendInstructions(
      provider,
      await withPriorityFees({
        connection: provider.connection,
        computeUnits: 1000000,
        instructions,
        feePayer: payer,
      }),
      signers,
      payer,
      commitment,
      idlErrors
    );
  }

  const signerSet = new Set(
    instructions
      .map((ix) =>
        ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58())
      )
      .flat()
  );
  const signerKeys = Array.from(signerSet).map((k) => new PublicKey(k));

  const nonMissingSignerIxs = instructions.filter(
    (ix) =>
      !ix.keys.some(
        (k) => k.isSigner && !k.pubkey.equals(provider.wallet.publicKey)
      )
  );
  const squadsSignatures = signerKeys.filter(
    (k) =>
      !k.equals(provider.wallet.publicKey) &&
      !signers.some((s) => s.publicKey.equals(k))
  );

  if (squadsSignatures.length == 0) {
    return await sendInstructions(
      provider,
      await withPriorityFees({
        connection: provider.connection,
        computeUnits: 1000000,
        instructions: nonMissingSignerIxs,
        feePayer: payer,
      }),
      signers,
      payer,
      commitment,
      idlErrors
    );
  }

  if (squadsSignatures.length >= 2) {
    throw new Error("Too many missing signatures");
  }

  const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
    provider.connection,
    multisigPda!
  );

  const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
  const createBatchIx = await multisig.instructions.batchCreate({
    batchIndex: BigInt(transactionIndex),
    creator: provider.wallet.publicKey,
    multisigPda: multisigPda!,
    vaultIndex: 0,
    memo: "Helium-admin-cli batch",
  });
  await sendInstructions(provider, await withPriorityFees({
    connection: provider.connection,
    instructions: [createBatchIx, await multisig.instructions.proposalCreate({
      multisigPda: multisigPda!,
      transactionIndex: BigInt(transactionIndex),
      creator: provider.wallet.publicKey,
      isDraft: true,
    })],
    feePayer: payer,
  }));


  const [vault] = await multisig.getVaultPda({
    multisigPda: multisigPda!,
    index: 0,
    programId: multisig.PROGRAM_ID,
  })
  const { transactionMessages, failedBuckets } = await packageInstructions(instructions.map(ix => [ix]), [], vault)
  const addInstructions = await Promise.all(transactionMessages.map((tm, index) => multisig.instructions.batchAddTransaction({
    batchIndex: BigInt(transactionIndex),
    multisigPda: multisigPda!,
    transactionIndex: index + 1,
    transactionMessage: tm,
    vaultIndex: 0,
    member: provider.wallet.publicKey,
    ephemeralSigners: 0
  })))
  if (failedBuckets.length > 0) {
    throw new Error(`Failed to package instructions: ${failedBuckets.join(", ")}`);
  }

  await bulkSendTransactions(provider, addInstructions.map(ix => ({
    feePayer: provider.wallet.publicKey,
    instructions: [ix],
  })))

  await sendInstructions(provider, await withPriorityFees({
    connection: provider.connection,
    instructions: [await multisig.instructions.proposalActivate({
      multisigPda: multisigPda!,
      transactionIndex: BigInt(transactionIndex),
      member: provider.wallet.publicKey,
    })],
    feePayer: payer,
  }));
}

export async function sendInstructionsOrSquads({
  provider,
  instructions,
  signers = [],
  payer = provider.wallet.publicKey,
  commitment = "confirmed",
  idlErrors = new Map(),
  executeTransaction = false,
  squads,
  multisig,
  authorityIndex,
}: {
  executeTransaction?: boolean; // Will execute the transaction immediately. Only works if the squads multisig is only 1 wallet threshold or signers is complete
  provider: anchor.AnchorProvider;
  instructions: TransactionInstruction[];
  signers?: Signer[];
  payer?: PublicKey;
  commitment?: Commitment;
  idlErrors?: Map<number, string>;
  squads: Squads;
  multisig?: PublicKey;
  authorityIndex?: number;
}): Promise<string | undefined> {
  if (!multisig) {
    return await sendInstructions(
      provider,
      await withPriorityFees({
        connection: provider.connection,
        computeUnits: 1000000,
        instructions,
      }),
      signers,
      payer,
      commitment,
      idlErrors
    );
  }

  const signerSet = new Set(
    instructions
      .map((ix) =>
        ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58())
      )
      .flat()
  );
  const signerKeys = Array.from(signerSet).map((k) => new PublicKey(k));

  const nonMissingSignerIxs = instructions.filter(
    (ix) =>
      !ix.keys.some(
        (k) => k.isSigner && !k.pubkey.equals(provider.wallet.publicKey)
      )
  );
  const squadsSignatures = signerKeys.filter(
    (k) =>
      !k.equals(provider.wallet.publicKey) &&
      !signers.some((s) => s.publicKey.equals(k))
  );

  if (squadsSignatures.length == 0) {
    return await sendInstructions(
      provider,
      await withPriorityFees({
        connection: provider.connection,
        computeUnits: 1000000,
        instructions: nonMissingSignerIxs,
      }),
      signers,
      payer,
      commitment,
      idlErrors
    );
  }

  if (squadsSignatures.length >= 2) {
    throw new Error("Too many missing signatures " + squadsSignatures.map(s => s.toBase58()).join(", "));
  }

  const txIndex = await squads.getNextTransactionIndex(multisig);
  const ix = await squads.buildCreateTransaction(
    multisig,
    authorityIndex!,
    txIndex
  );
  await sendInstructions(
    provider,
    await withPriorityFees({
      connection: provider.connection,
      instructions: [ix],
      computeUnits: 200000,
    })
  );
  const [txKey] = await getTxPDA(
    multisig,
    new BN(txIndex),
    squads.multisigProgramId
  );
  let index = 1;
  for (const ix of instructions.filter(
    (ix) => !ix.programId.equals(ComputeBudgetProgram.programId)
  )) {
    await sendInstructions(
      provider,
      await withPriorityFees({
        connection: provider.connection,
        instructions: [
          await squads.buildAddInstruction(
            multisig,
            txKey,
            ix,
            index
          ),
        ],
        computeUnits: 200000,
      })
    );
    index++;
  }

  const ixs: TransactionInstruction[] = []
  ixs.push(await squads.buildActivateTransaction(multisig, txKey))
  ixs.push(await squads.buildApproveTransaction(multisig, txKey))

  if (executeTransaction) {
    ixs.push(await squads.buildExecuteTransaction(
      txKey,
      provider.wallet.publicKey
    ));
  }

  await sendInstructions(
    provider,
    await withPriorityFees({
      connection: provider.connection,
      computeUnits: 1000000,
      instructions: ixs
    }),
    signers
  )
}

export async function parseEmissionsSchedule(filepath: string) {
  const json = JSON.parse(fs.readFileSync(filepath).toString());
  const schedule = json.map((x) => {
    const extra =
      "percent" in x
        ? { percent: x.percent }
        : "emissionsPerEpoch" in x
          ? {
            emissionsPerEpoch: new anchor.BN(
              x.emissionsPerEpoch.replaceAll(".", "").replaceAll(",", "")
            ),
          }
          : null;
    if (!extra || !("startTime" in x)) throw new Error("json format incorrect");
    return {
      startUnixTime: new anchor.BN(Math.floor(Date.parse(x.startTime) / 1000)),
      ...extra,
    };
  });
  return schedule;
}

function sleep(arg0: number) {
  return new Promise((resolve) => setTimeout(resolve, arg0));
}
