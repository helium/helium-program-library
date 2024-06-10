import {
  BN,
  BorshAccountsCoder,
  BorshInstructionCoder,
  Idl,
} from "@coral-xyz/anchor";
import { decodeIdlAccount } from "@coral-xyz/anchor/dist/cjs/idl";
import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { getLeafAssetId } from "@metaplex-foundation/mpl-bubblegum";
import {
  PROGRAM_ID as MPL_PID,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { sha256 } from "@noble/hashes/sha256";
import {
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  unpackAccount,
  unpackMint,
  unpackMultisig,
} from "@solana/spl-token";
import {
  AccountInfo,
  AccountMeta,
  AddressLookupTableAccount,
  Connection,
  MessageAccountKeys,
  PublicKey,
  RpcResponseAndContext,
  SimulatedTransactionResponse,
  SystemProgram,
  TransactionError,
  VersionedTransaction,
} from "@solana/web3.js";
import axios from "axios";
import { inflate } from "pako";

const BUBBLEGUM_PROGRAM_ID = new PublicKey(
  "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY"
);

const ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey(
  "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK"
);

export type BalanceChange = {
  owner: PublicKey;
  address: PublicKey;
  amount: bigint;
  metadata: TokenMetadata;
};

export type TokenMetadata = {
  mint: PublicKey;
  decimals: number;
  name?: string;
  symbol?: string;
  uri?: string;
};

export type Asset = {
  id: string;
  content: any;
  compression: {
    eligible: boolean;
    compressed: boolean;
    data_hash?: string;
    creator_hash?: string;
    asset_hash?: string;
    tree?: string;
    leaf_id?: number;
  };
  ownership: {
    owner: string;
    delegate: string;
  };
  royalty: {
    basis_points: number;
    primary_sale_happened: boolean;
  };
  mutable: boolean;
  supply: {
    edition_nonce: number | null;
  };
  grouping?: { group_key: string; group_value: PublicKey }[];
};

export type WritableAccount = {
  address: PublicKey;
  // If this is something like a token account, display the owner
  owner?: PublicKey;
  // Attempt to parse a name for the account
  // For token accounts may be "USDC Account"
  // For anchor accounts, will be the name of the struct
  name: string;
  changedInSimulation: boolean;
  pre: {
    type: "TokenAccount" | string;
    account: AccountInfo<Buffer> | null;
    parsed: any | null;
  };
  post: {
    type: "TokenAccount" | string;
    account: AccountInfo<Buffer> | null;
    parsed: any | null;
  };
  metadata?: TokenMetadata;
};

export type SusResult = {
  instructions: { parsed?: ParsedInstruction; raw: RawInstruction }[];
  logs: string[] | null;
  solFee: number;
  priorityFee?: number;
  insufficientFunds: boolean;
  explorerLink: string;
  balanceChanges: BalanceChange[];
  /// WARNING: This is best effort. You can't actually know which cNFTs can change, but you can
  /// highlight any that belong to a tree that is changing. This is made worse by the fact that you
  /// can't query DAS by tree. So we do our best and fetch at most 200 cNFTs and see if any can change.
  /// If you're using this feature, you may want to use `extraSearchAssetParams` to limit to important collections
  possibleCNftChanges: Asset[];
  writableAccounts: WritableAccount[];
  rawSimulation: SimulatedTransactionResponse;
  error?: TransactionError;
  /// Warnings about potential sus things in this transaction
  warnings: Warning[];
};

export type Warning = {
  severity: "critical" | "warning";
  shortMessage: string;
  message: string;
  account?: PublicKey;
};

async function getAccountKeys({
  connection,
  transaction,
}: {
  connection: Connection;
  transaction: VersionedTransaction;
}): Promise<MessageAccountKeys> {
  const addressLookupTableAccounts: Array<AddressLookupTableAccount> = [];
  const { addressTableLookups } = transaction.message;
  if (addressTableLookups.length > 0) {
    // eslint-disable-next-line no-restricted-syntax
    for (const addressTableLookup of addressTableLookups) {
      // eslint-disable-next-line no-await-in-loop
      const result = await connection?.getAddressLookupTable(
        addressTableLookup.accountKey
      );
      if (result?.value) {
        addressLookupTableAccounts.push(result?.value);
      }
    }
  }
  return transaction.message.getAccountKeys({
    addressLookupTableAccounts,
  });
}

async function getMultipleAccounts({
  connection,
  keys,
}): Promise<AccountInfo<Buffer>[]> {
  const batchSize = 100;
  const batches = Math.ceil(keys.length / batchSize);
  const results: AccountInfo<Buffer>[] = [];

  for (let i = 0; i < batches; i++) {
    const batchKeys = keys.slice(i * batchSize, (i + 1) * batchSize);
    const batchResults = await connection.getMultipleAccountsInfo(batchKeys);
    results.push(...batchResults);
  }

  return results;
}

export async function sus({
  connection,
  wallet,
  serializedTransactions,

  /// CNFT specific params
  checkCNfts = false,
  extraSearchAssetParams,
  cNfts,
  // Cluster for explorer
  cluster = "mainnet-beta",
  accountBlacklist,
}: {
  connection: Connection;
  wallet: PublicKey;
  serializedTransactions: Buffer[];
  /// See docs for SusResult `possibleCNftChanges`
  checkCNfts?: boolean;
  extraSearchAssetParams?: any;
  /// Optionally pass cnfts to check instead of searchAssets. This can save on RPC calls, or keep from needing
  /// An rpc that supports DAS
  cNfts?: Asset[];
  cluster?: string;
  /// Disallow fetching on this set of accounts. This is useful for cases like avoiding fetching
  /// known massive merkle trees to save on data.
  accountBlacklist?: Set<string>;
}): Promise<SusResult[]> {
  let assets = cNfts;
  if (checkCNfts) {
    if (!assets) {
      const assetsResponse = await axios.post(connection.rpcEndpoint, {
        jsonrpc: "2.0",
        method: "searchAssets",
        id: "get-assets-op-1",
        params: {
          page: 1,
          // limit to checking 200 assets
          limit: 200,
          compressed: true,
          ownerAddress: wallet.toBase58(),
          ...extraSearchAssetParams,
        },
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Expires: "0",
        },
      });
      assets = assetsResponse.data.result?.items as Asset[];
    }
  }
  const warningsByTx: Warning[][] = serializedTransactions.map(() => []);
  const transactions = serializedTransactions.map((t) =>
    VersionedTransaction.deserialize(t)
  );

  const accountKeysByTx = await Promise.all(
    transactions.map((transaction) =>
      getAccountKeys({ connection, transaction })
    )
  );

  const simulationAccountsByTx = accountKeysByTx.map((accountKeys, txIndex) =>
    [
      ...new Set(
        accountKeys.staticAccountKeys
          .filter((_, index) =>
            transactions[txIndex].message.isAccountWritable(index)
          )
          .concat(
            accountKeys.accountKeysFromLookups
              ? // Only writable accounts will contribute to balance changes
                accountKeys.accountKeysFromLookups.writable
              : []
          )
      ),
    ].filter((a) => !accountBlacklist?.has(a.toBase58()))
  );
  const allAccounts = [...new Set(simulationAccountsByTx.flat())];
  const fetchedAccounts = await getMultipleAccounts({
    connection,
    keys: allAccounts,
  });
  const fetchedAccountsByAddr = fetchedAccounts.reduce((acc, account, index) => {
    acc[allAccounts[index].toBase58()] = account
    return acc
  }, {} as Record<string, AccountInfo<Buffer>>)
  let { blockhash } = await connection?.getLatestBlockhash("finalized");
  const simulatedTxs: RpcResponseAndContext<SimulatedTransactionResponse>[] =
    [];
  // Linearly simulate txs so as not to hit rate limits
  for (const [index, transaction] of transactions.entries()) {
    let simulatedTxn: RpcResponseAndContext<SimulatedTransactionResponse> | null =
      null;
    let tries = 0;
    // Retry until we stop getting blockhashNotFound
    blockhashLoop: while (true) {
      transaction.message.recentBlockhash = blockhash;
      simulatedTxn = await connection.simulateTransaction(transaction, {
        accounts: {
          encoding: "base64",
          addresses:
            simulationAccountsByTx[index]?.map((account) =>
              account.toBase58()
            ) || [],
        },
      });
      if (isBlockhashNotFound(simulatedTxn)) {
        ({ blockhash } = await connection?.getLatestBlockhash("finalized"));
        tries++
        if (tries >= 5) {
          simulatedTxs.push(simulatedTxn);
          break blockhashLoop;
        }
      } else {
        simulatedTxs.push(simulatedTxn);
        break blockhashLoop;
      }
    }
  }

  const fullAccountsByTxn = simulationAccountsByTx.map(
    (simulationAccounts, transactionIndex) => {
      const simulatedTxn = simulatedTxs[transactionIndex];
      return simulationAccounts.map((account, index) => {
        const post = simulatedTxn.value.accounts?.[index];
        return {
          address: account,
          post: post
            ? {
                ...post,
                owner: new PublicKey(post.owner),
                data: Buffer.from(post.data[0], post.data[1] as any),
              }
            : undefined,
          pre: fetchedAccountsByAddr[account.toBase58()],
        };
      });
    }
  );

  const instructionProgramIds = transactions
    .flatMap((transaction, index) =>
      transaction.message.compiledInstructions.map(
        (ix) => accountKeysByTx[index].get(ix.programIdIndex) || null
      )
    )
    .filter(truthy);
  const programKeys = fullAccountsByTxn
    .flat()
    .map(
      (acc) =>
        acc?.pre?.owner || (acc.post ? new PublicKey(acc.post.owner) : null)
    )
    .concat(...instructionProgramIds)
    .filter(truthy);
  const idlKeys = programKeys.map(getIdlKey);
  const idls = (await getMultipleAccounts({ connection, keys: idlKeys }))
    .map((acc, index) => {
      if (acc) {
        return {
          program: programKeys[index],
          idl: decodeIdl(acc),
        };
      }
    })
    .filter(truthy)
    .reduce((acc, { program, idl }) => {
      if (idl) {
        acc[program.toBase58()] = idl;
      }
      return acc;
    }, {} as Record<string, Idl>);

  const writableAccountsByTxRaw = fullAccountsByTxn.map((accounts) =>
    getDetailedWritableAccountsWithoutTM({
      accounts,
      idls,
    })
  );
  const tokens = [
    ...new Set(
      writableAccountsByTxRaw.flatMap((w) => w.tokens).map((t) => t.toBase58())
    ),
  ].map((t) => new PublicKey(t));
  const metadatas = (await fetchMetadatas(connection, tokens)).reduce(
    (acc, m, index) => {
      if (m) {
        acc[tokens[index].toBase58()] = m;
      }
      return acc;
    },
    {} as Record<string, TokenMetadata>
  );
  const writableAccountsByTx = writableAccountsByTxRaw.map(
    ({ withoutMetadata }, index) => {
      const writableAccounts = withoutMetadata.map((acc) => {
        let name = acc.name;
        let metadata;
        // Attempt to take last known type
        const type =
          (acc.pre.type !== "Unknown" && acc.pre.type) ||
          (acc.post.type !== "Unknown" && acc.post.type) ||
          "Unknown";
        // If token, get the name based on the metadata
        if (type === "Mint") {
          metadata = metadatas[acc.address.toBase58()];
          if (metadata) {
            name = `${metadata.symbol} Mint`;
          } else {
            name = `Unknown Mint`;
          }
        } else if (type === "TokenAccount") {
          metadata =
            metadatas[
              (acc.pre.parsed?.mint || acc.post.parsed?.mint).toBase58()
            ];
          if (metadata) {
            name = `${metadata.symbol} Token Account`;
          } else {
            name = `Unknown Token Account`;
          }
        }

        return {
          ...acc,
          name,
          metadata,
        };
      });
      writableAccounts.forEach((acc) => {
        if (!acc.changedInSimulation) {
          warningsByTx[index].push({
            severity: "warning",
            shortMessage: "Unchanged",
            message:
              "Account did not change in simulation but was labeled as writable. The behavior of the transaction may differ from the simulation.",
            account: acc.address,
          });
        }

        // Catch malicious sol ownwer change
        const sysProg = new PublicKey("11111111111111111111111111111111")
        const postOwner = acc.post.account?.owner || sysProg
        const preOwner = acc.pre.account?.owner || sysProg
        const accountOwnerChanged = !preOwner.equals(postOwner)
        if (acc.name === "Native SOL Account" && acc.owner && acc.owner.equals(wallet) && accountOwnerChanged) {
          warningsByTx[index].push({
            severity: "critical",
            shortMessage: "Owner Changed",
            message: `The owner of ${acc.name} changed to ${acc.post.parsed?.owner?.toBase58()}. This gives that wallet full custody of these tokens.`,
            account: acc.address,
          });
        }
      });

      return writableAccounts;
    }
  );

  const instructionsByTx = await Promise.all(
    transactions.map(async (transaction, index) => {
      const instructions = parseInstructions({
        idls,
        instructions: transaction.message.compiledInstructions.map((ix) => ({
          data: Buffer.from(ix.data),
          programId: accountKeysByTx[index].get(ix.programIdIndex)!,
          accounts: ix.accountKeyIndexes.map((ix) => ({
            pubkey: accountKeysByTx[index].get(ix)!,
            isSigner: transaction.message.isAccountSigner(ix),
            isWritable: transaction.message.isAccountWritable(ix),
          })),
        })),
      });
      if (
        instructions.some(
          (ix) => ix.parsed?.name === "ledgerTransferPositionV0"
        )
      ) {
        warningsByTx[index].push({
          severity: "critical",
          shortMessage: "Theft of Locked HNT",
          message:
            "This transaction is attempting to steal your locked HNT positions",
        });
      }
      if (
        instructions.some(
          (ix) =>
            ix.parsed?.name === "updateDestinationV0" ||
            ix.parsed?.name === "updateCompressionDestinationV0"
        )
      ) {
        warningsByTx[index].push({
          severity: "warning",
          shortMessage: "Rewards Destination Changed",
          message:
            "This transaction will change the destination wallet of your mining rewards",
        });
      }
      if (
        (
          await Promise.all(
            instructions.map((ix) => isBurnHotspot(connection, ix, assets))
          )
        ).some((isBurn) => isBurn)
      ) {
        warningsByTx[index].push({
          severity: "critical",
          shortMessage: "Hotspot Destroyed",
          message: "This transaction will brick your Hotspot!",
        });
      }

      return instructions;
    })
  );

  const results: SusResult[] = [];
  for (const [index, simulatedTxn] of simulatedTxs.entries()) {
    const warnings = warningsByTx[index];
    const instructions = instructionsByTx[index];
    const writableAccounts = writableAccountsByTx[index];
    const transaction = transactions[index];

    const message = Buffer.from(transaction.message.serialize()).toString("base64");
    const explorerLink = `https://explorer.solana.com/tx/inspector?cluster=${cluster}&message=${encodeURIComponent(
      message
    )}`;

    const logs = simulatedTxn.value.logs;
    let result: SusResult;
    if (simulatedTxn?.value.err) {
      warnings.push({
        severity: "critical",
        shortMessage: "Simulation Failed",
        message: "Transaction failed in simulation",
      });
      result = {
        instructions,
        error: simulatedTxn.value.err,
        logs,
        solFee: 0,
        priorityFee: 0,
        insufficientFunds: isInsufficientBal(simulatedTxn?.value.err),
        explorerLink,
        balanceChanges: [],
        possibleCNftChanges: [],
        writableAccounts,
        rawSimulation: simulatedTxn.value,
        warnings,
      };
    } else {
      let solFee = (transaction?.signatures.length || 1) * 5000;
      let priorityFee = 0;

      const fee =
        (await connection?.getFeeForMessage(transaction.message, "confirmed"))
          .value || solFee;
      priorityFee = fee - solFee;
      const balanceChanges = writableAccounts
        .map((acc) => {
          const type =
            (acc.pre.type !== "Unknown" && acc.pre.type) ||
            (acc.post.type !== "Unknown" && acc.post.type);
          switch (type) {
            case "TokenAccount":
              if (acc.post.parsed?.delegate && !acc.pre.parsed?.delegate) {
                warnings.push({
                  severity: "warning",
                  shortMessage: "Withdraw Authority Given",
                  message: `Delegation was taken on ${acc.name}. This gives permission to withdraw tokens without the owner's permission.`,
                  account: acc.address,
                });
              }
              if (
                acc.post.parsed &&
                acc.pre.parsed &&
                !acc.post.parsed.owner.equals(acc.pre.parsed.owner)
              ) {
                warnings.push({
                  severity: "warning",
                  shortMessage: "Owner Changed",
                  message: `The owner of ${
                    acc.name
                  } changed to ${acc.post.parsed?.owner?.toBase58()}. This gives that wallet full custody of these tokens.`,
                  account: acc.address,
                });
              }
              return {
                owner: acc.post.parsed?.owner || acc.pre.parsed?.owner,
                address: acc.address,
                amount:
                  ((acc.post.parsed?.amount as bigint) || BigInt(0)) -
                  ((acc.pre.parsed?.amount as bigint) || BigInt(0)),
                metadata: acc.metadata,
              } as BalanceChange;
            case "NativeAccount":
              return {
                owner: acc.address,
                address: acc.address,
                amount: BigInt(
                  (acc.post.account?.lamports || 0) -
                    (acc.pre.account?.lamports || 0)
                ),
                metadata: {
                  mint: NATIVE_MINT,
                  decimals: 9,
                  name: "SOL",
                  symbol: "SOL",
                },
              } as BalanceChange;
            default:
              return null;
          }
        })
        .filter(truthy);

      // Don't count new mints being created, as this might flag on candymachine txs
      if (balanceChanges.filter((b) => b.owner.equals(wallet) && fetchedAccountsByAddr[b.address.toBase58()]).length >= 3) {
        warnings.push({
          severity: "warning",
          shortMessage: "3+ Token Accounts",
          message:
            "3 or more token accounts are impacted by this transaction. Any token account listed as writable can be emptied by the transaction, is this okay?",
        });
      }

      let possibleCNftChanges: Asset[] = [];
      if (checkCNfts) {
        const possibleMerkles = new Set(
          writableAccounts
            .filter((acc) => acc.name === "Merkle Tree")
            .map((a) => a.address.toBase58())
        );

        possibleCNftChanges = (assets || []).filter(
          (item) =>
            item.compression.tree && possibleMerkles.has(item.compression.tree)
        );
      }

      result = {
        instructions,
        logs,
        solFee,
        priorityFee,
        insufficientFunds: false,
        explorerLink,
        balanceChanges,
        possibleCNftChanges,
        writableAccounts,
        rawSimulation: simulatedTxn.value,
        warnings,
      };
    }

    results.push(result);
  }

  return results
}

function isBlockhashNotFound(simulatedTxn: RpcResponseAndContext<SimulatedTransactionResponse>): boolean {
  return simulatedTxn?.value.err?.toString() === "BlockhashNotFound";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isInsufficientBal(e: any) {
  return (
    e.toString().includes("Insufficient Balance") ||
    e.toString().includes('"Custom":1') ||
    e.InstructionError?.[1]?.Custom === 1
  );
}

export type ParsedInstruction = {
  name: string;
  programName: string;
  data: any;
  accounts: {
    name?: string;
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
  }[];
};

export type RawInstruction = {
  data: Buffer;
  programId: PublicKey;
  accounts: AccountMeta[];
};
function parseInstructions({
  idls,
  instructions,
}: {
  idls: Record<string, Idl>;
  instructions: RawInstruction[];
}): { parsed?: ParsedInstruction; raw: RawInstruction }[] {
  return instructions.map((ix) => {
    const idl = idls[ix.programId.toBase58()];
    if (idl) {
      try {
        const coder = new BorshInstructionCoder(idl);
        const parsed = coder.decode(ix.data, "base58");
        if (parsed) {
          const formatted = coder.format(parsed, ix.accounts);
          if (formatted) {
            return {
              parsed: {
                name: parsed.name,
                programName: idl.name,
                data: parsed.data,
                accounts: formatted.accounts,
              },
              raw: ix,
            };
          }
        }
      } catch (e: any) {
        // Ignore, not a valid ix
      }
    }
    return { raw: ix };
  });
}

function getIdlKey(programId: PublicKey): PublicKey {
  const base = PublicKey.findProgramAddressSync([], programId)[0];
  const buffer = Buffer.concat([
    base.toBuffer(),
    Buffer.from("anchor:idl"),
    programId.toBuffer(),
  ]);
  const publicKeyBytes = sha256(buffer);
  return new PublicKey(publicKeyBytes);
}

function decodeIdl(account: AccountInfo<Buffer>): Idl | undefined {
  try {
    const idlData = decodeIdlAccount(Buffer.from(account.data.subarray(8)));
    const inflatedIdl = inflate(idlData.data);
    return JSON.parse(utf8.decode(inflatedIdl));
  } catch (e: any) {
    // Ignore, not a valid IDL
  }
}

export function getDetailedWritableAccountsWithoutTM({
  accounts,
  idls,
}: {
  accounts: {
    address: PublicKey;
    pre: AccountInfo<Buffer> | null | undefined;
    post: AccountInfo<Buffer> | null | undefined;
  }[];
  idls: Record<string, Idl>;
}): { withoutMetadata: WritableAccount[]; tokens: PublicKey[] } {
  const uniqueTokens: Set<string> = new Set();
  const withoutMetadata = accounts.map(({ address, pre, post }) => {
    let name = "Unknown";
    let type = "Unknown";
    let preParsed: null | any = null;
    let postParsed: null | any = null;
    let accountOwner: PublicKey | undefined = undefined;

    const postData = post && post.data;
    const postAccount =
      post && postData
        ? {
            executable: post.executable,
            owner: new PublicKey(post.owner),
            lamports: post.lamports,
            data: postData,
            rentEpoch: post.rentEpoch,
          }
        : null;

    const owner = pre?.owner || (post ? new PublicKey(post.owner) : null);
    switch (owner?.toBase58()) {
      case ACCOUNT_COMPRESSION_PROGRAM_ID.toBase58():
        name = "Merkle Tree";
        type = "MerkleTree";
        break;
      case SystemProgram.programId.toBase58():
        name = "Native SOL Account";
        type = "NativeAccount";
        accountOwner = address;
        break;
      case TOKEN_2022_PROGRAM_ID.toBase58():
        ({ parsed: preParsed, type } = decodeTokenStruct(
          address,
          pre,
          TOKEN_2022_PROGRAM_ID
        ) || { type });
        ({ parsed: postParsed, type } = decodeTokenStruct(
          address,
          postAccount,
          TOKEN_2022_PROGRAM_ID
        ) || { type });

        break;
      case TOKEN_PROGRAM_ID.toBase58():
        ({ parsed: preParsed, type } = decodeTokenStruct(
          address,
          pre,
          TOKEN_PROGRAM_ID
        ) || { type });
        ({ parsed: postParsed, type } = decodeTokenStruct(
          address,
          postAccount,
          TOKEN_PROGRAM_ID
        ) || { type });

        break;
      default:
        if (owner) {
          const idl = idls[owner.toBase58()];
          if (idl) {
            const decodedPre = decodeIdlStruct(idl, pre)
            const decodedPost = decodeIdlStruct(
              idl,
              postAccount
            )
            preParsed = decodedPre?.parsed
            postParsed = decodedPost?.parsed
            type =
              (decodedPre?.type !== "Unknown" && decodedPre?.type) ||
              (decodedPost?.type !== "Unknown" && decodedPost?.type) ||
              "Unknown";
            name = type;
          }
        }

        break;
    }

    // If token, get the name based on the metadata
    if (
      new Set([
        TOKEN_2022_PROGRAM_ID.toBase58(),
        TOKEN_PROGRAM_ID.toBase58(),
      ]).has(owner?.toBase58() || "")
    ) {
      if (type === "Mint") {
        uniqueTokens.add(address.toBase58());
      } else if (type === "TokenAccount") {
        const mint = (preParsed?.mint || postParsed?.mint).toBase58();
        accountOwner = preParsed?.owner || postParsed?.owner;
        uniqueTokens.add(mint);
      }
    }

    return {
      address,
      name,
      owner: accountOwner,
      pre: {
        type,
        account: pre || null,
        parsed: preParsed,
      },
      post: {
        type,
        account: post || null,
        parsed: postParsed,
      },
      changedInSimulation:
        pre && postData
          ? !pre.data.equals(postData) ||
            pre.lamports != post.lamports ||
            !pre.owner.equals(new PublicKey(post.owner))
          : true,
    };
  });

  const tokens = [...uniqueTokens].map((t) => new PublicKey(t));
  return {
    withoutMetadata,
    tokens,
  };
}

function decodeIdlStruct(
  idl: Idl,
  account: AccountInfo<Buffer> | null | undefined
): { type: string; parsed: any } | null {
  if (!account) {
    return null;
  }

  try {
    const coder = new BorshAccountsCoder(idl);
    const descriminator = account.data.slice(0, 8);
    const type = idl.accounts?.find((account) =>
      BorshAccountsCoder.accountDiscriminator(account.name).equals(
        descriminator
      )
    )?.name;
    if (type) {
      return {
        type,
        parsed: coder.decode(type, account.data),
      };
    }
  } catch (e: any) {
    // Ignore, not a valid account
  }

  return null;
}

function decodeTokenStruct(
  address: PublicKey,
  account: AccountInfo<Buffer> | null | undefined,
  programId: PublicKey
): { type: string; parsed: any } | null {
  if (!account) {
    return null;
  }

  try {
    return {
      type: "TokenAccount",
      parsed: unpackAccount(address, account, programId),
    };
  } catch (e: any) {
    // Not an account
  }

  try {
    return {
      type: "Mint",
      parsed: unpackMint(address, account, programId),
    };
  } catch (e: any) {
    // Not an account
  }

  try {
    return {
      type: "Multisig",
      parsed: unpackMultisig(address, account, programId),
    };
  } catch (e: any) {
    // Not an account
  }
  return null;
}

export function getMetadataId(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata", "utf-8"), MPL_PID.toBuffer(), mint.toBuffer()],
    MPL_PID
  )[0];
}

export async function fetchMetadatas(
  connection: Connection,
  tokens: PublicKey[]
): Promise<(TokenMetadata | null)[]> {
  const metadatas = tokens.map(getMetadataId);
  const all = await getMultipleAccounts({
    keys: [...metadatas, ...tokens],
    connection,
  });
  const metadataAccounts = all.slice(0, metadatas.length);
  const mintAccounts = all.slice(metadatas.length, metadatas.length * 2);
  return metadataAccounts.map((acc, index) => {
    try {
      const mint = unpackMint(tokens[index], mintAccounts[index]);
      if (acc) {
        const collectable = Metadata.fromAccountInfo(acc)[0];
        return {
          name: collectable.data.name.replace(/\0/g, ""),
          symbol: collectable.data.symbol.replace(/\0/g, ""),
          uri: collectable.data.uri.replace(/\0/g, ""),
          decimals: mint.decimals,
          mint: tokens[index],
        };
      }

      return {
        mint: tokens[index],
        decimals: mint.decimals,
      };
    } catch (e: any) {
      // Ignore, not a valid mint
    }

    return null
  });
}

type Truthy<T> = T extends false | "" | 0 | null | undefined ? never : T; // from lodash

const truthy = <T>(value: T): value is Truthy<T> => !!value;

async function isBurnHotspot(
  connection: Connection,
  ix: { parsed?: ParsedInstruction | undefined; raw: RawInstruction },
  assets?: Asset[]
): Promise<boolean> {
  if (
    ix.raw.programId.equals(BUBBLEGUM_PROGRAM_ID) &&
    ix.parsed?.name === "burn"
  ) {
    const tree = ix.parsed?.accounts.find(
      (acc) => acc.name === "Merkle Tree"
    )?.pubkey;
    if (tree) {
      const index = ix.parsed?.data?.index;
      const assetId = await getLeafAssetId(tree, new BN(index));
      let asset
      if (assets) {
        asset = assets.find(a => a.id === assetId.toBase58())
      } else {
        const assetResponse = await axios.post(connection.rpcEndpoint, {
          jsonrpc: "2.0",
          method: "getAsset",
          id: "get-asset-op-1",
          params: {
            id: assetId.toBase58(),
          },
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
            Expires: "0",
          },
        });
        asset = assetResponse.data.result
      }
      return (
        asset &&
        asset.creators[0]?.address == HELIUM_ENTITY_CREATOR.toBase58() &&
        asset.creators[0]?.verified
      );
    }
  }
  return false;
}

const DAO = PublicKey.findProgramAddressSync(
  [
    Buffer.from("dao", "utf-8"),
    new PublicKey("hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux").toBuffer(),
  ],
  new PublicKey("hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR")
)[0];
const HELIUM_ENTITY_CREATOR = PublicKey.findProgramAddressSync(
  [Buffer.from("entity_creator", "utf-8"), DAO.toBuffer()],
  new PublicKey("hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8")
)[0];
