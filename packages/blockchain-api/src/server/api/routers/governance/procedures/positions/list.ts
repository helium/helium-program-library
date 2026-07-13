import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection } from "@/lib/solana";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";
import { getLockupKind } from "../helpers/constants";
import { getPositionsForOwner } from "../helpers";

export const getPositions = publicProcedure.governance.getPositions.handler(
  async ({ input }) => {
    const { wallet } = input;
    const walletPubkey = new PublicKey(wallet);

    const { connection, provider } = createSolanaConnection(wallet);
    const vsrProgram = await initVsr(provider);

    const owned = await getPositionsForOwner({
      connection,
      vsrProgram,
      owner: walletPubkey,
    });
    if (owned.length === 0) return [];

    const positionAccs = await vsrProgram.account.positionV0.fetchMultiple(
      owned.map((p) => p.position)
    );

    // Registrars are shared across positions — fetch each unique one once.
    const registrarKeys = Array.from(
      new Set(
        positionAccs
          .filter((acc) => acc !== null)
          .map((acc) => acc!.registrar.toBase58())
      )
    );
    const registrars = await vsrProgram.account.registrar.fetchMultiple(
      registrarKeys.map((k) => new PublicKey(k))
    );
    const registrarByKey = new Map(
      registrarKeys.map((k, i) => [k, registrars[i]])
    );

    const positions = await Promise.all(
      owned.map(async ({ mint, position }, i) => {
        const acc = positionAccs[i];
        if (!acc) return null;

        const registrar = registrarByKey.get(acc.registrar.toBase58());
        if (!registrar) return null;

        const votingMint =
          registrar.votingMints[acc.votingMintConfigIdx].mint.toBase58();

        return {
          positionMint: mint.toBase58(),
          position: position.toBase58(),
          registrar: acc.registrar.toBase58(),
          amountDeposited: await toTokenAmountOutput(
            acc.amountDepositedNative,
            votingMint
          ),
          numActiveVotes: acc.numActiveVotes,
          lockup: {
            kind: getLockupKind(acc.lockup),
            startTs: acc.lockup.startTs.toString(),
            endTs: acc.lockup.endTs.toString(),
          },
        };
      })
    );

    return positions.filter((p) => p !== null);
  }
);
