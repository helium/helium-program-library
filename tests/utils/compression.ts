import { resolveIndividual } from "@helium/spl-utils";
import {
  computeCompressedNFTHash,
  computeCreatorHash,
  computeDataHash,
  getLeafAssetId, PROGRAM_ID as BUBBLEGUM_PROGRAM_ID, TokenProgramVersion,
  TokenStandard
} from "@metaplex-foundation/mpl-bubblegum";
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
