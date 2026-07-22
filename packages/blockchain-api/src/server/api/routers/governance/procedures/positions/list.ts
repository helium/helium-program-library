import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection } from "@/lib/solana";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";
import { headers } from "next/headers";
import {
  createRateLimiter,
  getClientIp,
  parseRateLimit,
} from "@/lib/utils/rate-limit";
import { getLockupKind } from "../helpers/constants";
import { fetchRegistrarsByKey, getPositionsForOwner } from "../helpers";

// Courtesy throttle (per-process, XFF-keyed) on a public endpoint whose cost
// is server-side RPC fan-out.
const getPositionsIpRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: () => parseRateLimit(process.env.GET_POSITIONS_RATE_LIMIT_PER_IP, 60),
});

export const getPositions = publicProcedure.governance.getPositions.handler(
  async ({ input, errors }) => {
    const { wallet } = input;

    if (!getPositionsIpRateLimiter(getClientIp(await headers()))) {
      throw errors.RATE_LIMITED();
    }
    const walletPubkey = new PublicKey(wallet);

    const { connection, provider } = createSolanaConnection(wallet);
    const vsrProgram = await initVsr(provider);

    const owned = await getPositionsForOwner({
      connection,
      vsrProgram,
      owner: walletPubkey,
    });
    if (owned.length === 0) return [];

    // Registrars are shared across positions — fetch each unique one once.
    const registrarByKey = await fetchRegistrarsByKey(vsrProgram, owned);

    const positions = await Promise.all(
      owned.map(async ({ mint, position, account: acc }) => {
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
