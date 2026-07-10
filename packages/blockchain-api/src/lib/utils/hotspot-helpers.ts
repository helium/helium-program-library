import KeyToAsset from "@/lib/models/key-to-asset";
import {
  entityCreatorKey,
  init,
  keyToAssetKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { HNT_MINT, type Asset } from "@helium/spl-utils";
import { PROGRAM_ID as BUBBLEGUM_PROGRAM_ID } from "@metaplex-foundation/mpl-bubblegum";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { env } from "../env";
import { connectToDb } from "./db";
import * as anchor from "@coral-xyz/anchor";

const DAO_KEY = daoKey(HNT_MINT)[0];

/** Derive the bubblegum tree authority PDA for a cNFT's Merkle tree. */
export const getBubblegumAuthorityPDA = async (
  merkleRollPubKey: PublicKey,
): Promise<PublicKey> => {
  const [bubblegumAuthorityPDAKey] = await PublicKey.findProgramAddress(
    [merkleRollPubKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID,
  );
  return bubblegumAuthorityPDAKey;
};

/** Whether a cNFT was verified-minted by the Helium entity creator. */
export const validateHeliumHotspot = (asset: Asset): boolean => {
  const heliumEntityCreator = entityCreatorKey(DAO_KEY)[0].toBase58();

  return (
    asset.creators?.some((creator) => {
      const address =
        typeof creator.address === "string"
          ? creator.address
          : creator.address.toBase58();
      return address === heliumEntityCreator && creator.verified;
    }) || false
  );
};

type HemProgram = Awaited<ReturnType<typeof init>>;
type HemIdl = HemProgram extends anchor.Program<infer T> ? T : never;

let hemProgram: HemProgram | null = null;

export const initHemLocal = async (
  provider: anchor.AnchorProvider,
): Promise<HemProgram> => {
  if (hemProgram) {
    return hemProgram;
  }
  const HEM_PROGRAM_ID = new PublicKey(
    "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8",
  );
  const idl = await anchor.Program.fetchIdl(HEM_PROGRAM_ID, provider);
  hemProgram = new anchor.Program(idl as HemIdl, provider);
  process.on("exit", () => {
    closeHemLocal();
  });
  process.on("SIGINT", () => {
    closeHemLocal();
  });
  process.on("SIGTERM", () => {
    closeHemLocal();
  });
  return hemProgram;
};

export const closeHemLocal = () => {
  if (hemProgram) {
    hemProgram = null;
  }
};

const decodeEntityKey = (encodedEntityKey: string): Buffer | null => {
  try {
    // Try bs58 decoding first (most common case for hotspots)
    return Buffer.from(bs58.decode(encodedEntityKey));
  } catch {
    try {
      // Fall back to utf8 decoding
      return Buffer.from(encodedEntityKey, "utf8");
    } catch {
      return null;
    }
  }
};

export const getAssetIdFromPubkey = async (
  encodedEntityKey: string,
): Promise<string | null> => {
  if (env.NO_PG === "true") {
    // Use ASSET_ENDPOINT when available — surfpool may not have KeyToAsset PDAs
    const rpcUrl = env.ASSET_ENDPOINT || env.SOLANA_RPC_URL;
    const connection = new Connection(rpcUrl);
    const wallet = {
      publicKey: Keypair.generate().publicKey,
      signTransaction: async () => {
        throw new Error("not supported");
      },
      signAllTransactions: async () => {
        throw new Error("not supported");
      },
    };
    const provider = new anchor.AnchorProvider(
      connection,
      wallet,
      anchor.AnchorProvider.defaultOptions(),
    );
    const [keyToAssetK] = keyToAssetKey(daoKey(HNT_MINT)[0], encodedEntityKey);
    const program = await initHemLocal(provider);
    const keyToAsset =
      await program.account.keyToAssetV0.fetchNullable(keyToAssetK);
    return keyToAsset?.asset.toBase58() || null;
  } else {
    await connectToDb();

    // Decode the encoded entity key back to raw buffer
    const entityKeyBuffer = decodeEntityKey(encodedEntityKey);
    if (!entityKeyBuffer) {
      return null;
    }

    const keyToAsset = await KeyToAsset.findOne({
      where: { entityKey: entityKeyBuffer },
    });

    return keyToAsset?.asset || null;
  }
};
