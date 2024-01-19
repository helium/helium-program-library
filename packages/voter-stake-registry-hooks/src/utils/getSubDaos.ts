import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { PROGRAM_ID, daoKey, init } from "@helium/helium-sub-daos-sdk";
import { HNT_MINT } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { SubDaoWithMeta } from "../sdk/types";
import axios from "axios";
import {
  PROGRAM_ID as MPL_PID,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";

const cache = {};

export const getSubDaos = async (
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID
): Promise<SubDaoWithMeta[]> => {
  const connection = provider.connection;
  try {
    const subDaos: SubDaoWithMeta[] = [];
    const idl = await Program.fetchIdl(programId, provider);
    const hsdProgram = await init(provider as any, programId, idl);

    const dao = await daoKey(HNT_MINT, programId)[0];
    const subdaos = await hsdProgram.account.subDaoV0.all([
      {
        memcmp: {
          offset: 8,
          bytes: bs58.encode(dao.toBuffer()),
        },
      },
    ]);

    const dntMetadatas = await Promise.all(
      subdaos.map(async (subDao) => {
        const metadata = PublicKey.findProgramAddressSync(
          [
            Buffer.from("metadata", "utf-8"),
            MPL_PID.toBuffer(),
            subDao.account.dntMint.toBuffer(),
          ],
          MPL_PID
        )[0];
        const acc = Metadata.fromAccountInfo(
          (await connection.getAccountInfo(metadata))!
        )[0];
        let json = cache[acc.data.uri];
        if (!json) {
          json = await (await axios.get(acc.data.uri.replace(/\0/g, ""))).data;
          cache[acc.data.uri] = json;
        }
        return {
          ...acc.data,
          json,
        };
      })
    );

    subDaos.push(
      ...subdaos.map((subDao, idx) => {
        return {
          ...subDao.account,
          pubkey: subDao.publicKey,
          dntMetadata: dntMetadatas[idx],
        } as SubDaoWithMeta;
      })
    );

    return subDaos;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
