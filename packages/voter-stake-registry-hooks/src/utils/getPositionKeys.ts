import { AnchorProvider } from "@coral-xyz/anchor";
import {
  VoteService,
  getRegistrarKey,
  init as initVsr,
  positionKey,
} from "@helium/voter-stake-registry-sdk";
import { Metadata, Metaplex, Nft, Sft } from "@metaplex-foundation/js";
import { Mint, getMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Delegation, Registrar } from "../sdk/types";
import { BN } from "bn.js";

export interface GetPositionsArgs {
  wallet: PublicKey;
  mint: PublicKey;
  provider: AnchorProvider;
  voteService: VoteService;
}

export const getPositionKeys = async (
  args: GetPositionsArgs
): Promise<{
  votingDelegatedPositionKeys: PublicKey[];
  positionKeys: PublicKey[];
  nfts: (Metadata | Nft | Sft)[];
  delegations: Delegation[];
}> => {
  const { mint, wallet, provider, voteService } = args;
  const connection = provider.connection;

  const me = wallet;

  const metaplex = new Metaplex(connection);
  const registrarPk = getRegistrarKey(mint);
  const program = await initVsr(provider as any);
  const registrar = (await program.account.registrar.fetch(
    registrarPk
  )) as Registrar;
  const myDelegations = await voteService.getDelegationsForWallet(me);
  const delegationPositions = myDelegations.map(
    (del) => positionKey(new PublicKey(del.asset))[0]
  );
  const mintCfgs = registrar.votingMints;
  const mints: Record<string, Mint> = {};
  for (const mcfg of mintCfgs) {
    const mint = await getMint(connection, mcfg.mint);
    mints[mcfg.mint.toBase58()] = mint;
  }

  const nfts = (await metaplex.nfts().findAllByOwner({ owner: wallet })).filter(
    (nft) => nft.collection?.address.equals(registrar.collection)
  );

  const positionKeys = nfts.map(
    (nft) => positionKey((nft as any).mintAddress)[0]
  );

  return {
    positionKeys,
    votingDelegatedPositionKeys: delegationPositions,
    delegations: myDelegations.map((d) => ({
      owner: new PublicKey(d.owner),
      nextOwner: new PublicKey(d.nextOwner),
      address: new PublicKey(d.address),
      asset: new PublicKey(d.asset),
      rentRefund: new PublicKey(d.rentRefund),
      delegationConfig: new PublicKey(d.delegationConfig),
      index: d.index,
      bumpSeed: d.bumpSeed,
      expirationTime: new BN(d.expirationTime)
    })),
    nfts,
  };
};
