import { PublicKey } from '@solana/web3.js';
import fastify from 'fastify';
import * as anchor from "@coral-xyz/anchor";
import { createAtaAndTransfer, toBN } from "@helium/spl-utils";
import { getMint } from "@solana/spl-token";

const server = fastify({ logger: true });
anchor.setProvider(anchor.AnchorProvider.local(process.env.SOLANA_URL));
const provider = anchor.getProvider() as anchor.AnchorProvider;
const HNT_MINT = new PublicKey(process.env.HNT_MINT!);
const IOT_MINT = new PublicKey(process.env.IOT_MINT!);
const MOBILE_MINT = new PublicKey(process.env.MOBILE_MINT!);
let HNT_MINT_DECIMALS: number;
let IOT_MINT_DECIMALS: number;
let MOBILE_MINT_DECIMALS: number;

const window = 30 * 1000; // 30 seconds
const rateLimit = {
  "hnt": {
    wallet: new Map<string, number>(),
    ip: new Map<string, number>(),
  },
  "iot": {
    wallet: new Map<string, number>(),
    ip: new Map<string, number>(),
  },
  "mobile": {
    wallet: new Map<string, number>(),
    ip: new Map<string, number>(),
  }
}
type RateLimitTracker = {
  wallet: Map<string, number>;
  ip: Map<string, number>;
}
function isRateLimited(request: any, walletStr: string, rateLimitTracker: RateLimitTracker): boolean {
  // Check if the wallet has been accessed within the rate limit window
  const walletLastAccessed = rateLimitTracker.wallet.get(walletStr);
  const now = Date.now();
  if (walletLastAccessed && now - walletLastAccessed < window) {
    return true;
  }
  rateLimitTracker.wallet.set(walletStr, now);

  // Check if the IP needs to be rate limited
  const ip = (request.headers['x-real-ip'] // nginx
    || request.headers['x-client-ip'] // apache
    || request.ip).toString() // fallback to default
  const ipLastAccessed = rateLimitTracker.ip.get(ip);
  if (ipLastAccessed && now - ipLastAccessed < window) {
    return true;
  }
  rateLimitTracker.ip.set(ip, now);

  return false;
}

server.get("/health", async () => {
  return { ok: true };
});

server.get<{Params: { wallet: string } }>('/hnt/:wallet', {
  handler: async (request, reply) => {
    const walletStr = request.params.wallet;
    try {
      //@ts-ignore
      const amount = Number(request.query.amount) || 1;
      const wallet = new PublicKey(walletStr);

      if (amount > 10) {
        reply.code(403).send('Must be less than 10');
        return;
      }

      const limit = isRateLimited(request, walletStr, rateLimit.hnt);
      if (limit) {
        reply.code(429).send('Too Many Requests');
        return;
      }
  
      await createAtaAndTransfer(provider, HNT_MINT, toBN(amount, HNT_MINT_DECIMALS), provider.wallet.publicKey, wallet);

      reply.status(200).send({
        message: "Airdrop sent",
      })
    } catch (err) {
      console.error(err);
      reply.status(500).send({
        message: 'Request failed'
      });
    }
  },
});

server.get<{ Params: { wallet: string } }>("/iot/:wallet", {
  handler: async (request, reply) => {
    const walletStr = request.params.wallet;

    try {
      //@ts-ignore
      const amount = Number(request.query.amount) || 1;
      const wallet = new PublicKey(walletStr);

      if (amount > 10) {
        reply.code(403).send("Must be less than 10");
        return;
      }

      const limit = isRateLimited(request, walletStr, rateLimit.iot);
      if (limit) {
        reply.code(429).send("Too Many Requests");
        return;
      }

      await createAtaAndTransfer(
        provider,
        IOT_MINT,
        toBN(amount, IOT_MINT_DECIMALS),
        provider.wallet.publicKey,
        wallet
      );

      reply.status(200).send({
        message: "Airdrop sent",
      });
    } catch (err) {
      console.error(err);
      reply.status(500).send({
        message: "Request failed",
      });
    }
  },
});

server.get<{ Params: { wallet: string } }>("/mobile/:wallet", {
  handler: async (request, reply) => {
    const walletStr = request.params.wallet;

    try {
      //@ts-ignore
      const amount = Number(request.query.amount) || 1;
      const wallet = new PublicKey(walletStr);

      if (amount > 10) {
        reply.code(403).send("Must be less than 10");
        return;
      }

      const limit = isRateLimited(request, walletStr, rateLimit.mobile);
      if (limit) {
        reply.code(429).send("Too Many Requests");
        return;
      }

      await createAtaAndTransfer(
        provider,
        MOBILE_MINT,
        toBN(amount, MOBILE_MINT_DECIMALS),
        provider.wallet.publicKey,
        wallet
      );

      reply.status(200).send({
        message: "Airdrop sent",
      });
    } catch (err) {
      console.error(err);
      reply.status(500).send({
        message: "Request failed",
      });
    }
  },
});

const start = async () => {
  HNT_MINT_DECIMALS = (await getMint(provider.connection, HNT_MINT)).decimals;
  IOT_MINT_DECIMALS = (await getMint(provider.connection, IOT_MINT)).decimals;
  MOBILE_MINT_DECIMALS = (await getMint(provider.connection, MOBILE_MINT)).decimals;

  try {
    await server.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();