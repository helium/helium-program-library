import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes'
import { PROGRAM_ID, daoKey, init } from '@helium/helium-sub-daos-sdk'
import { HNT_MINT } from '@helium/spl-utils'
import { Metaplex } from '@metaplex-foundation/js'
import { PublicKey } from '@solana/web3.js'
import { SubDaoWithMeta } from '../sdk/types'

export const getSubDaos = async (
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID
): Promise<SubDaoWithMeta[]> => {
  const connection = provider.connection;
  try {
    const subDaos: SubDaoWithMeta[] = []
    const idl = await Program.fetchIdl(programId, provider)
    const hsdProgram = await init(provider as any, programId, idl)

    const metaplex = new Metaplex(connection)
    const dao = await daoKey(HNT_MINT, programId)[0]
    const subdaos = await hsdProgram.account.subDaoV0.all([
      {
        memcmp: {
          offset: 8,
          bytes: bs58.encode(dao.toBuffer()),
        },
      },
    ])

    const dntMetadatas = await Promise.all(
      subdaos.map(async (subDao) =>
        metaplex.nfts().findByMint({
          mintAddress: subDao.account.dntMint,
        })
      )
    )

    subDaos.push(
      ...subdaos.map((subDao, idx) => {
        return {
          ...subDao.account,
          pubkey: subDao.publicKey,
          dntMetadata: dntMetadatas[idx],
        } as SubDaoWithMeta
      })
    )

    return subDaos
  } catch (error) {
    console.error(error)
    throw error
  }
}
