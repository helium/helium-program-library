import {
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
  PublicKey,
  SimulatedTransactionAccountInfo,
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

type TokenMetadata = {
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
  warnings?: Warning[];
  pre: {
    type: "TokenAccount" | string;
    account: AccountInfo<Buffer> | null;
    parsed: any | null;
  };
  post: {
    type: "TokenAccount" | string;
    account: SimulatedTransactionAccountInfo | null;
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
  /// Note that individual writable accounts may have their own warnings NOT included in this list
  warnings: Warning[];
};

type Warning = {
  severity: "critical" | "warning";
  shortMessage: string;
  message: string;
};

export async function sus({
  connection,
  wallet,
  serializedTransaction,

  /// CNFT specific params
  checkCNfts = false,
  extraSearchAssetParams,
  cNfts,
  // Cluster for explorer
  cluster = "mainnet-beta",
}: {
  connection: Connection;
  wallet: PublicKey;
  serializedTransaction: Buffer;
  /// See docs for SusResult `possibleCNftChanges`
  checkCNfts?: boolean;
  extraSearchAssetParams?: any;
  /// Optionally pass cnfts to check instead of searchAssets it
  cNfts?: Asset[];
  cluster?: string;
}): Promise<SusResult> {
  const warnings: Warning[] = [];
  const transaction = VersionedTransaction.deserialize(serializedTransaction);
  const message = transaction.message.serialize().toString("base64");
  const explorerLink = `https://explorer.solana.com/tx/inspector?cluster=${cluster}&message=${encodeURIComponent(
    message
  )}`;
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
  const accountKeys = transaction.message.getAccountKeys({
    addressLookupTableAccounts,
  });

  const simulationAccounts = [
    ...new Set(
      accountKeys.staticAccountKeys
        .filter((_, index) => transaction.message.isAccountWritable(index))
        .concat(
          accountKeys.accountKeysFromLookups
            ? // Only writable accounts will contribute to balance changes
              accountKeys.accountKeysFromLookups.writable
            : []
        )
    ),
  ];
  const fetchedAccounts = await connection.getMultipleAccountsInfo(
    simulationAccounts
  );
  const { blockhash } = await connection?.getLatestBlockhash();
  transaction.message.recentBlockhash = blockhash;
  const simulatedTxn = await connection?.simulateTransaction(transaction, {
    accounts: {
      encoding: "base64",
      addresses: simulationAccounts?.map((account) => account.toBase58()) || [],
    },
  });
  const fullAccounts = simulationAccounts.map((account, index) => ({
    address: account,
    post: simulatedTxn.value.accounts?.[index],
    pre: fetchedAccounts[index],
  }));

  const programKeys = fullAccounts
    .map(
      (acc) =>
        acc?.pre?.owner || (acc.post ? new PublicKey(acc.post.owner) : null)
    )
    .concat(
      ...transaction.message.compiledInstructions.map(
        (ix) => accountKeys.get(ix.programIdIndex) || null
      )
    )
    .filter(truthy);
  const idlKeys = programKeys.map(getIdlKey);
  const idls = (await connection.getMultipleAccountsInfo(idlKeys))
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

  const writableAccounts = await getDetailedWritableAccounts({
    connection,
    accounts: fullAccounts,
    idls,
  });

  const instructions = await parseInstructions({
    idls,
    instructions: transaction.message.compiledInstructions.map((ix) => ({
      data: Buffer.from(ix.data),
      programId: accountKeys.get(ix.programIdIndex)!,
      accounts: ix.accountKeyIndexes.map((ix) => ({
        pubkey: accountKeys.get(ix)!,
        isSigner: transaction.message.isAccountSigner(ix),
        isWritable: transaction.message.isAccountWritable(ix),
      })),
    })),
  });

  if (
    instructions.some((ix) => ix.parsed?.name === "ledgerTransferPositionV0")
  ) {
    warnings.push({
      severity: 'critical',
      shortMessage: 'Theft of Locked HNT',
      message: "This transaction is attempting to steal your locked HNT positions"
    });
  }

  if (instructions.some((ix) => isBurnHotspot(connection, ix))) {
    warnings.push({
      severity: 'critical',
      shortMessage: 'Hotspot Destroyed',
      message: "This transaction will brick your Hotspot!"
    });
  }

  const logs = simulatedTxn.value.logs;
  if (simulatedTxn?.value.err) {
    if (isInsufficientBal(simulatedTxn?.value.err)) {
      warnings.push({
        severity: 'warning',
        shortMessage: 'Simulation Failed',
        message: "Transaction failed in simulation"
      });
      return {
        instructions,
        error: simulatedTxn.value.err,
        logs,
        solFee: 0,
        priorityFee: 0,
        insufficientFunds: true,
        explorerLink,
        balanceChanges: [],
        possibleCNftChanges: [],
        writableAccounts,
        rawSimulation: simulatedTxn.value,
        warnings,
      };
    }
  }

  let solFee = (transaction?.signatures.length || 1) * 5000;
  let priorityFee = 0;

  const warningsByWritableAcc: Record<string, Warning[]> = {}
  const fee =
    (await connection?.getFeeForMessage(transaction.message, "confirmed"))
      .value || solFee;
  priorityFee = fee - solFee;
  const balanceChanges = writableAccounts
    .map((acc) => {
      const type = acc.pre.type || acc.post.type;
      switch (type) {
        case "TokenAccount":
          warningsByWritableAcc[acc.address.toBase58()] = []
          if (acc.post.parsed?.delegate && !acc.pre.parsed?.delegate) {
            warningsByWritableAcc[acc.address.toBase58()].push({
              severity: "warning",
              shortMessage: "Withdraw Authority Given",
              message: `Delegation was taken. This gives permission to withdraw tokens without the owner's permission.`,
            });
          }
          if (acc.post.parsed && acc.pre.parsed && !acc.post.parsed.owner.equals(acc.pre.parsed.owner)) {
            warningsByWritableAcc[acc.address.toBase58()].push({
              severity: "warning",
              shortMessage: "Account Owner Changed",
              message: `The owner changed to ${acc.post.parsed?.owner}. This gives that wallet full custody of these tokens.`,
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

  if (
    balanceChanges.filter((b) => b.owner.equals(wallet) && b.amount < BigInt(0))
      .length > 2
  ) {
    warnings.push({
      severity: 'warning',
      shortMessage: '2+ Writable Accounts',
      message: "More than 2 accounts with negative balance change. Is this emptying your wallet?"
    });
  }

  let possibleCNftChanges: Asset[] = [];
  if (checkCNfts) {
    let assets = cNfts;
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

  return {
    instructions,
    logs,
    solFee,
    priorityFee,
    insufficientFunds: false,
    explorerLink,
    balanceChanges,
    possibleCNftChanges,
    writableAccounts: writableAccounts.map((wa) => ({
      ...wa,
      warnings: warningsByWritableAcc[wa.address.toBase58()] || [],
    })),
    rawSimulation: simulatedTxn.value,
    warnings,
  };
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
async function parseInstructions({
  idls,
  instructions,
}: {
  idls: Record<string, Idl>;
  instructions: RawInstruction[];
}): Promise<{ parsed?: ParsedInstruction; raw: RawInstruction }[]> {
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

export async function getDetailedWritableAccounts({
  connection,
  accounts,
  idls,
}: {
  connection: Connection;
  accounts: {
    address: PublicKey;
    pre: AccountInfo<Buffer> | null | undefined;
    post: SimulatedTransactionAccountInfo | null | undefined;
  }[];
  idls: Record<string, Idl>;
}): Promise<WritableAccount[]> {
  const uniqueTokens: Set<string> = new Set();
  const withoutMetadata = accounts.map(({ address, pre, post }) => {
    let name = "Unknown";
    let type = "Unknown";
    let preParsed: null | any = null;
    let postParsed: null | any = null;
    let accountOwner: PublicKey | undefined = undefined;

    const postData =
      post &&
      Buffer.from(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        post.data[0] as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        post.data[1] as any
      );
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
        ) || { type: "Unknown Token Program" });
        ({ parsed: postParsed, type } = decodeTokenStruct(
          address,
          postAccount,
          TOKEN_2022_PROGRAM_ID
        ) || { type: "Unknown Token Program" });

        break;
      case TOKEN_PROGRAM_ID.toBase58():
        ({ parsed: preParsed, type } = decodeTokenStruct(
          address,
          pre,
          TOKEN_PROGRAM_ID
        ) || { type: "Unknown Token Program" });
        ({ parsed: postParsed, type } = decodeTokenStruct(
          address,
          postAccount,
          TOKEN_PROGRAM_ID
        ) || { type: "Unknown Token Program" });

        break;
      default:
        if (owner) {
          const idl = idls[owner.toBase58()];
          if (idl) {
            ({ parsed: preParsed, type } = decodeIdlStruct(idl, pre) || {
              type: "No Published IDL",
            });
            ({ parsed: postParsed, type } = decodeIdlStruct(
              idl,
              postAccount
            ) || {
              type: "No Published IDL",
            });
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
  const metadatas = (await fetchMetadatas(connection, tokens)).reduce(
    (acc, m, index) => {
      if (m) {
        acc[tokens[index].toBase58()] = m;
      }
      return acc;
    },
    {} as Record<string, TokenMetadata>
  );
  return withoutMetadata.map((acc) => {
    let name = acc.name;
    let metadata;
    const type = acc.pre.type || acc.post.type;
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
        metadatas[(acc.pre.parsed?.mint || acc.post.parsed?.mint).toBase58()];
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
  const all = await connection.getMultipleAccountsInfo([
    ...metadatas,
    ...tokens,
  ]);
  const metadataAccounts = all.slice(0, metadatas.length);
  const mintAccounts = all.slice(metadatas.length, metadatas.length * 2);
  return metadataAccounts.map((acc, index) => {
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
  });
}

type Truthy<T> = T extends false | "" | 0 | null | undefined ? never : T; // from lodash

const truthy = <T>(value: T): value is Truthy<T> => !!value;

async function isBurnHotspot(
  connection: Connection,
  ix: { parsed?: ParsedInstruction | undefined; raw: RawInstruction }
): Promise<boolean> {
  if (
    ix.raw.programId.equals(BUBBLEGUM_PROGRAM_ID) &&
    ix.parsed?.name === "burn"
  ) {
    const tree = ix.parsed?.accounts.find(
      (acc) => acc.name === "merkleTree"
    )?.pubkey;
    if (tree) {
      const assetId = await getLeafAssetId(tree, ix.parsed?.data[4]);
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
      const asset = assetResponse.data.result;
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
