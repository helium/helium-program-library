import {
  computeCompressedNFTHash,
  computeCreatorHash,
  computeDataHash,
  getLeafAssetId, PROGRAM_ID as BUBBLEGUM_PROGRAM_ID, TokenProgramVersion,
  TokenStandard
} from "@metaplex-foundation/mpl-bubblegum";
import { Asset, AssetProof, resolveIndividual } from "@helium/spl-utils";
import { Metadata, PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  ConcurrentMerkleTreeAccount,
  getConcurrentMerkleTreeAccountSize,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID
} from "@solana/spl-account-compression";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { MerkleTree } from "../../deps/solana-program-library/account-compression/sdk/src/merkle-tree";
import { Bubblegum as MplBubblegum, IDL as BubblegumIdl } from "./bubblegum";
import { entityCreatorKey } from "@helium/helium-entity-manager-sdk";
// @ts-ignore
import animalHash from "angry-purple-tiger";
import { BN } from "bn.js";


export async function createCompressionNft({
  provider,
  recipient,
  merkle = Keypair.generate(),
  data = {},
  collectionKey,
}: {
  provider: anchor.AnchorProvider;
  recipient: PublicKey;
  merkle?: Keypair;
  data?: any;
  collectionKey?: PublicKey;
}): Promise<{
  merkle: Keypair;
  asset: PublicKey;
  collectionKey: PublicKey | undefined;
  merkleTree: MerkleTree;
  metadata: any;
  creatorHash: Buffer;
  dataHash: Buffer;
}> {
  const bubblegum = new Program<MplBubblegum>(
    BubblegumIdl as MplBubblegum,
    new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY"),
    provider,
    undefined,
    () => {
      return resolveIndividual(async ({ path }) => {
        switch (path[path.length - 1]) {
          case "tokenMetadataProgram":
            return new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
          case "compressionProgram":
            return new PublicKey("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK");
          case "logWrapper":
            return new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");
          default:
            return;
        }
      });
    }
  ) as Program<MplBubblegum>;
  if (!(await provider.connection.getAccountInfo(merkle.publicKey))) {
    const space = getConcurrentMerkleTreeAccountSize(3, 8);
    await bubblegum.methods
      .createTree(3, 8, false)
      .preInstructions([
        SystemProgram.createAccount({
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: merkle.publicKey,
          lamports: await provider.connection.getMinimumBalanceForRentExemption(
            space
          ),
          space: space,
          programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        }),
      ])
      .accounts({
        merkleTree: merkle.publicKey,
      })
      .signers([merkle])
      .rpc();
  }

  const metadata = {
    name: "Test Compressed NFT",
    symbol: "TST",
    uri: "https://metaplex.com",
    creators: [],
    editionNonce: 0,
    tokenProgramVersion: TokenProgramVersion.Original,
    tokenStandard: TokenStandard.Fungible,
    uses: null,
    collection: null,
    primarySaleHappened: false,
    sellerFeeBasisPoints: 0,
    isMutable: false,
    ...data,
  };

  if (collectionKey) {
    const collectionMetadata = await PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata", "utf-8"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        collectionKey.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    )[0];
    const editionAccount = await PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata", "utf-8"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        collectionKey.toBuffer(),
        Buffer.from("edition", "utf8"),
      ],
      TOKEN_METADATA_PROGRAM_ID
    )[0];
    const collection = await Metadata.fromAccountAddress(provider.connection, collectionMetadata);

    await bubblegum.methods
      .mintToCollectionV1({
        ...metadata,
        tokenStandard: { fungible: {} },
        tokenProgramVersion: { original: {} },
      })
      .accounts({
        merkleTree: merkle.publicKey,
        leafOwner: recipient,
        leafDelegate: recipient,
        collectionMint: collectionKey,
        collectionMetadata: collectionMetadata,
        editionAccount,
        collectionAuthority: collection.updateAuthority,
        collectionAuthorityRecordPda: BUBBLEGUM_PROGRAM_ID,
      })
      .rpc({ skipPreflight: true });
  } else {
    await bubblegum.methods
      .mintV1({
        ...metadata,
        tokenStandard: { fungible: {} },
        tokenProgramVersion: { original: {} },
      })
      .accounts({
        merkleTree: merkle.publicKey,
        leafOwner: recipient,
        leafDelegate: recipient,
      })
      .rpc({ skipPreflight: true });
  }

  const asset = await getLeafAssetId(merkle.publicKey, new anchor.BN(0));
  const tree = await ConcurrentMerkleTreeAccount.fromAccountAddress(
    provider.connection,
    merkle.publicKey,
    "confirmed"
  );
  const leaves = Array(2 ** tree.getMaxDepth()).fill(Buffer.alloc(32));
  leaves[0] = computeCompressedNFTHash(
    asset,
    recipient,
    recipient,
    new anchor.BN(0),
    metadata
  );
  const merkleTree = new MerkleTree(leaves);

  return {
    asset,
    merkle,
    collectionKey,
    metadata,
    merkleTree,
    creatorHash: computeCreatorHash([]),
    dataHash: computeDataHash(metadata),
  };
}

// Setup merkle tree -- this isn't needed anywhere but localnet,
// we're effectively duplicating metaplex digital asset api
export async function createMockCompression({
  collection,
  dao,
  merkle,
  ecc,
  hotspotOwner = Keypair.generate(),
} : {
  collection: PublicKey,
  dao: PublicKey,
  ecc: string,
  merkle: PublicKey,
  hotspotOwner: Keypair,
}) {

  const creators = [
    {
      address: entityCreatorKey(dao)[0],
      verified: true,
      share: 100,
    },
  ];
  let metadata: any = {
    name: animalHash(ecc).replace(/\s/g, "-").toLowerCase().slice(0, 32),
    symbol: "HOTSPOT",
    uri: `https://entities.nft.helium.io/${ecc}`,
    collection: {
      key: collection,
      verified: true,
    },
    creators,
    sellerFeeBasisPoints: 0,
    primarySaleHappened: true,
    isMutable: true,
    editionNonce: null,
    tokenStandard: TokenStandard.NonFungible,
    uses: null,
    tokenProgramVersion: TokenProgramVersion.Original,
  };
  let hotspot = await getLeafAssetId(merkle, new BN(0));

  const hash = computeCompressedNFTHash(
    hotspot,
    hotspotOwner.publicKey,
    hotspotOwner.publicKey,
    new anchor.BN(0),
    metadata
  );
  const leaves = Array(2 ** 3).fill(Buffer.alloc(32));
  leaves[0] = hash;
  let merkleTree = new MerkleTree(leaves);
  const proof = merkleTree.getProof(0);
  let getAssetFn = async () =>
    ({
      id: hotspot,
      content: {
        metadata: {
          name: metadata.name,
          symbol: metadata.symbol,
        },
        json_uri: metadata.uri,
      },
      royalty: {
        basis_points: metadata.sellerFeeBasisPoints,
        primary_sale_happened: true,
      },
      mutable: true,
      supply: {
        edition_nonce: null,
      },
      grouping: metadata.collection.key,
      uses: metadata.uses,
      creators: metadata.creators,
      ownership: { owner: hotspotOwner.publicKey },
      compression: {
        compressed: true,
        eligible: true,
        dataHash: computeDataHash(metadata),
        creatorHash: computeCreatorHash(creators),
      },
    } as Asset);
  let getAssetProofFn = async () => {
    return {
      root: new PublicKey(proof.root),
      proof: proof.proof.map((p) => new PublicKey(p)),
      nodeIndex: 0,
      leaf: new PublicKey(proof.leaf),
      treeId: merkle,
    };
  };

  return {
    getAssetFn,
    getAssetProofFn,
    hotspot,
  }
}