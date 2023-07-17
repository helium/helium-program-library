import { BN, Provider } from "@coral-xyz/anchor";
import {
  EPOCH_LENGTH,
  delegatedPositionKey,
  init
} from "@helium/helium-sub-daos-sdk";
import { HNT_MINT, IOT_MINT, MOBILE_MINT, chunks } from "@helium/spl-utils";
import { init as initVsr, positionKey, registrarKey } from "@helium/voter-stake-registry-sdk";
import { Metaplex, NftClient } from "@metaplex-foundation/js";
import { getMint } from "@solana/spl-token";
import { PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import {
  DelegatedPositionV0,
  PositionV0,
  PositionWithMeta,
  Registrar,
} from "../sdk/types";
import { calcPositionVotingPower } from "./calcPositionVotingPower";

export interface GetPositionsArgs {
  wallet: PublicKey;
  mint: PublicKey;
  provider: Provider;
}

const realmNames: Record<string, string> = {
  [HNT_MINT.toBase58()]: "Helium DAO",
  [MOBILE_MINT.toBase58()]: "Helium MOBILE SubDAO",
  [IOT_MINT.toBase58()]: "Helium IOT SubDAO",
};
export const getPositionKeys = async (
  args: GetPositionsArgs
): Promise<{ positionKeys: PublicKey[], nfts: NftClient[] }> => {
  const { mint, wallet, provider } = args;
  const connection = provider.connection;
  const positions: PositionWithMeta[] = [];
  let amountLocked = new BN(0);
  let votingPower = new BN(0);

  const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const now = new BN(Number(clock!.data.readBigInt64LE(8 * 4)));
  const metaplex = new Metaplex(connection);
  const registrarPk = registrarKey(
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance", "utf-8"),
        Buffer.from(realmNames[mint.toBase58()], "utf-8"),
      ],
      new PublicKey("hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S")
    )[0],
    mint
  )[0];
  const program = await initVsr(provider as any);
  const registrar = (await program.account.registrar.fetch(
    registrarPk
  )) as Registrar;
  const mintCfgs = registrar.votingMints;
  const mints = {};
  for (const mcfg of mintCfgs) {
    const mint = await getMint(connection, mcfg.mint);
    mints[mcfg.mint.toBase58()] = mint;
  }

  const nfts = (
    await metaplex.nfts().findAllByOwner({ owner: wallet })
  ).filter((nft) => nft.collection?.address.equals(registrar.collection));

  const positionKeys = nfts.map(
    (nft) => positionKey((nft as any).mintAddress)[0]
  );

  positions.push(
    ...positionAccInfos.map((posAccInfo, idx) => {
      const pos = program.coder.accounts.decode(
        "PositionV0",
        posAccInfo!.data
      ) as PositionV0;

      const isDelegated = !!delegatedPositionAccs[idx];
      const delegatedSubDao = isDelegated
        ? delegatedPositionAccs[idx]?.subDao
        : null;
      const hasRewards = isDelegated
        ? delegatedPositionAccs[idx]!.lastClaimedEpoch.add(new BN(1)).lt(
            now.div(new BN(EPOCH_LENGTH))
          )
        : false;

      const posVotingPower = calcPositionVotingPower({
        position: pos,
        registrar,
        unixNow: now,
      });

      amountLocked = amountLocked.add(pos.amountDepositedNative);
      votingPower = votingPower.add(posVotingPower);

      return {
        ...pos,
        pubkey: posKeys[idx],
        isDelegated,
        delegatedSubDao,
        hasRewards,
        hasGenesisMultiplier: pos.genesisEnd.gt(now),
        votingPower: posVotingPower,
        votingMint: {
          ...mintCfgs[pos.votingMintConfigIdx],
          mint: mints[mintCfgs[pos.votingMintConfigIdx].mint.toBase58()],
        },
      } as PositionWithMeta;
    })
  );

  return {
    positionKeys,
    nfts,
  };
};
