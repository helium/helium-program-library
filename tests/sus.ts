import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { init as initDc } from "@helium/data-credits-sdk";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import { DC_MINT, HNT_MINT, IOT_MINT } from "@helium/spl-utils";
import { Asset, sus } from "@helium/sus";
import {
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  createBurnInstruction as createBubblegumBurnInstruction,
  createTransferInstruction as createBubblegumTransferInstruction
} from "@metaplex-foundation/mpl-bubblegum";
import {
  ConcurrentMerkleTreeAccount,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  AccountMeta,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import axios from "axios";
import { BN } from "bn.js";
import bs58 from "bs58";
import { expect } from "chai";
import { ensureDCIdl } from "./utils/fixtures";

const SUS = new PublicKey("sustWW3deA7acADNGJnkYj2EAf65EmqUNLxKekDpu6w");
const hotspot = "9Cyj2K3Fi7xH8fZ1xrp4gtr1CU6Zk8VFM4fZN9NR9ncz";
describe("sus", () => {
  const connection = new Connection(
    "https://solana-rpc.web.test-helium.com?session-key=Pluto"
  );
  it("handles basic token changes", async () => {
    const transaction = new Transaction({
      feePayer: SUS,
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    });
    const dest = getAssociatedTokenAddressSync(HNT_MINT, PublicKey.default);
    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(
        SUS,
        dest,
        PublicKey.default,
        HNT_MINT
      ),
      createTransferInstruction(
        getAssociatedTokenAddressSync(HNT_MINT, SUS),
        dest,
        SUS,
        BigInt(1000000000)
      )
    );
    const susR = await sus({
      connection,
      wallet: SUS,
      serializedTransactions: [transaction.serialize({
        verifySignatures: false,
        requireAllSignatures: false,
      })],
      cluster: "devnet"
    });

    const { writableAccounts, balanceChanges } = susR[0];
    expect(writableAccounts[0].name).to.eq("Native SOL Account");
    expect(writableAccounts[0].address.toBase58()).to.eq(SUS.toBase58());
    expect(writableAccounts[0].changedInSimulation).to.be.true;

    expect(writableAccounts[1].name).to.eq("HNT Token Account");
    expect(writableAccounts[1].owner?.toBase58()).to.eq(
      "11111111111111111111111111111111"
    );

    expect(writableAccounts[2].name).to.eq("HNT Token Account");
    expect(writableAccounts[2].owner?.toBase58()).to.eq(SUS.toBase58());
    expect(writableAccounts[2].metadata?.decimals).to.eq(8);

    console.log(balanceChanges[0])
    expect(balanceChanges[0].owner.toBase58()).to.eq(SUS.toBase58());
    expect(balanceChanges[0].amount).to.eq(BigInt(-2044280));

    expect(balanceChanges[1].owner.toBase58()).to.eq(
      PublicKey.default.toBase58()
    );
    expect(balanceChanges[1].amount).to.eq(BigInt(1000000000));

    expect(balanceChanges[2].owner.toBase58()).to.eq(SUS.toBase58());
    expect(balanceChanges[2].amount).to.eq(BigInt(-1000000000));
  });

  it("handles anchor transactions", async () => {
    const transaction = new Transaction({
      feePayer: SUS,
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    });
    const dataCredits = await initDc(
      new AnchorProvider(
        connection,
        {
          publicKey: SUS,
        } as Wallet,
        {}
      )
    );
    await ensureDCIdl(dataCredits);

    transaction.add(
      await dataCredits.methods
        .mintDataCreditsV0({
          hntAmount: null,
          dcAmount: new BN(10),
        })
        .accounts({
          dcMint: DC_MINT,
        })
        .instruction(),
      await dataCredits.methods
        .delegateDataCreditsV0({
          amount: new BN(10),
          routerKey: "Foo",
        })
        .accounts({
          subDao: subDaoKey(IOT_MINT)[0],
        })
        .instruction()
    );
    const [susR] = await sus({
      connection,
      wallet: SUS,
      serializedTransactions: [transaction.serialize({
        verifySignatures: false,
        requireAllSignatures: false,
      })],
      cluster: "devnet"
    });

    console.log(susR.writableAccounts.map((r) => r.name));
    expect(susR.writableAccounts.map((r) => r.name)).to.deep.eq([
      "Native SOL Account",
      "DelegatedDataCreditsV0",
      "DC Mint",
      "DC Token Account",
      "HNT Token Account",
      "HNT Mint",
      "DC Token Account",
      "MintWindowedCircuitBreakerV0",
    ]);
    expect(susR.instructions[0].parsed?.name).to.eq("mintDataCreditsV0");
    expect(susR.instructions[0].parsed?.data.args.dcAmount.toNumber()).to.eq(
      10
    );
  });

  it("can warn of cNFT changes", async () => {
    const assetResponse = await axios.post(connection.rpcEndpoint, {
      jsonrpc: "2.0",
      method: "getAsset",
      id: "get-asset-op-1",
      params: {
        id: hotspot,
      },
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
    const asset = assetResponse.data.result;
    const transaction = await transferCompressedCollectable(
      connection,
      SUS,
      asset,
      PublicKey.default
    );
    const [susR] = await sus({
      connection,
      wallet: SUS,
      serializedTransactions: [transaction.serialize({
        verifySignatures: false,
        requireAllSignatures: false,
      })],
      checkCNfts: true,
      cNfts: [asset],
    });

    expect(susR.possibleCNftChanges[0]).to.eq(asset);
  });

  it("can warn of hotspot burn", async () => {
    const assetResponse = await axios.post(connection.rpcEndpoint, {
      jsonrpc: "2.0",
      method: "getAsset",
      id: "get-asset-op-1",
      params: {
        id: hotspot,
      },
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
    const asset = assetResponse.data.result;
    const transaction = await burnCompressedCollectable(
      connection,
      SUS,
      asset,
    );
    const [susR] = await sus({
      connection,
      wallet: SUS,
      serializedTransactions: [transaction.serialize({
        verifySignatures: false,
        requireAllSignatures: false,
      })],
      checkCNfts: true,
      cNfts: [asset],
      cluster: "devnet"
    });
    console.log(susR.explorerLink)

    expect(susR.possibleCNftChanges[0]).to.eq(asset);
    expect(susR.warnings[0].message).to.eq(
      "This transaction will brick your Hotspot!"
    );
  });
});

async function getBubblegumAuthorityPDA(merkleRollPubKey: PublicKey) {
  const [bubblegumAuthorityPDAKey] = await PublicKey.findProgramAddress(
    [merkleRollPubKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );
  return bubblegumAuthorityPDAKey;
}

const burnCompressedCollectable = async (
  connection: Connection,
  wallet: PublicKey,
  collectable: Asset,
): Promise<Transaction> => {
  const payer = wallet;

  const instructions: TransactionInstruction[] = [];

  const assetResponse = await axios.post(connection.rpcEndpoint, {
    jsonrpc: "2.0",
    method: "getAssetProof",
    id: "get-asset-op-1",
    params: {
      id: collectable.id,
    },
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
  const assetProof = assetResponse.data.result;

  const treeAuthority = await getBubblegumAuthorityPDA(
    new PublicKey(assetProof.tree_id)
  );

  const leafDelegate = collectable.ownership.delegate
    ? new PublicKey(collectable.ownership.delegate)
    : new PublicKey(collectable.ownership.owner);

  const merkleTree = new PublicKey(assetProof.tree_id);

  const tree = await ConcurrentMerkleTreeAccount.fromAccountAddress(
    connection,
    merkleTree,
    "confirmed"
  );

  const canopyHeight = tree.getCanopyDepth();
  const proofPath = mapProof(assetProof);

  const anchorRemainingAccounts = proofPath.slice(
    0,
    proofPath.length - (canopyHeight || 0)
  );

  instructions.push(
    createBubblegumBurnInstruction(
      {
        treeAuthority,
        leafOwner: new PublicKey(collectable.ownership.owner),
        leafDelegate,
        merkleTree,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        anchorRemainingAccounts,
      },
      {
        root: bufferToArray(Buffer.from(bs58.decode(assetProof.root))),
        dataHash: bufferToArray(
          Buffer.from(bs58.decode(collectable.compression.data_hash!.trim()))
        ),
        creatorHash: bufferToArray(
          Buffer.from(bs58.decode(collectable.compression.creator_hash!.trim()))
        ),
        nonce: collectable.compression.leaf_id!,
        index: collectable.compression.leaf_id!,
      }
    )
  );

  const { blockhash } = await connection.getLatestBlockhash();

  const transaction = new Transaction();
  transaction.add(...instructions);

  transaction.recentBlockhash = blockhash;
  transaction.feePayer = payer;

  return transaction;
};


const transferCompressedCollectable = async (
  connection: Connection,
  wallet: PublicKey,
  collectable: Asset,
  payee: PublicKey
): Promise<Transaction> => {
  const payer = wallet;
  const recipientPubKey = payee;

  const instructions: TransactionInstruction[] = [];

  const assetResponse = await axios.post(connection.rpcEndpoint, {
    jsonrpc: "2.0",
    method: "getAssetProof",
    id: "get-asset-op-1",
    params: {
      id: collectable.id,
    },
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
  const assetProof = assetResponse.data.result;

  const treeAuthority = await getBubblegumAuthorityPDA(
    new PublicKey(assetProof.tree_id)
  );

  const leafDelegate = collectable.ownership.delegate
    ? new PublicKey(collectable.ownership.delegate)
    : new PublicKey(collectable.ownership.owner);

  const merkleTree = new PublicKey(assetProof.tree_id);

  const tree = await ConcurrentMerkleTreeAccount.fromAccountAddress(
    connection,
    merkleTree,
    "confirmed"
  );

  const canopyHeight = tree.getCanopyDepth();
  const proofPath = mapProof(assetProof);

  const anchorRemainingAccounts = proofPath.slice(
    0,
    proofPath.length - (canopyHeight || 0)
  );

  instructions.push(
    createBubblegumTransferInstruction(
      {
        treeAuthority,
        leafOwner: new PublicKey(collectable.ownership.owner),
        leafDelegate,
        newLeafOwner: recipientPubKey,
        merkleTree,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        anchorRemainingAccounts,
      },
      {
        root: bufferToArray(Buffer.from(bs58.decode(assetProof.root))),
        dataHash: bufferToArray(
          Buffer.from(bs58.decode(collectable.compression.data_hash!.trim()))
        ),
        creatorHash: bufferToArray(
          Buffer.from(bs58.decode(collectable.compression.creator_hash!.trim()))
        ),
        nonce: collectable.compression.leaf_id!,
        index: collectable.compression.leaf_id!,
      }
    )
  );

  const { blockhash } = await connection.getLatestBlockhash();

  const transaction = new Transaction();
  transaction.add(...instructions);

  transaction.recentBlockhash = blockhash;
  transaction.feePayer = payer;

  return transaction;
};

function bufferToArray(buffer: Buffer): number[] {
  const nums: number[] = [];
  for (let i = 0; i < buffer.length; i += 1) {
    nums.push(buffer[i]);
  }
  return nums;
}

const mapProof = (assetProof: { proof: string[] }): AccountMeta[] => {
  if (!assetProof.proof || assetProof.proof.length === 0) {
    throw new Error("Proof is empty");
  }
  return assetProof.proof.map((node) => ({
    pubkey: new PublicKey(node),
    isSigner: false,
    isWritable: false,
  }));
};
