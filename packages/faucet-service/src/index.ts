import { PublicKey } from '@solana/web3.js';
import fastify from 'fastify';
import * as anchor from "@coral-xyz/anchor";
import { createAtaAndTransfer, toBN } from "@helium/spl-utils";
import { getMint } from "@solana/spl-token";

const server = fastify({ logger: true });
anchor.setProvider(anchor.AnchorProvider.local());
const provider = anchor.getProvider() as anchor.AnchorProvider;
const HNT_MINT = new PublicKey(process.env.HNT_MINT!);
const IOT_MINT = new PublicKey(process.env.IOT_MINT!);
const MOBILE_MINT = new PublicKey(process.env.MOBILE_MINT!);
let HNT_MINT_DECIMALS: number;
let IOT_MINT_DECIMALS: number;
let MOBILE_MINT_DECIMALS: number;

const walletLastAccessedMap = new Map<string, number>();
const ipLastAccessedMap = new Map<string, number>();

server.get('/faucet', {
  handler: async (request, reply) => {
    //@ts-ignore
    const walletStr = request.query.wallet as string;
    try {
      const wallet = new PublicKey(walletStr);

      // Check if the wallet has been accessed within the rate limit window
      const lastAccessed = walletLastAccessedMap.get(walletStr);
      const now = Date.now();
      if (lastAccessed && now - lastAccessed < 5 * 60 * 1000) {
        reply.code(429).send('Too Many Requests');
        return;
      }
      walletLastAccessedMap.set(walletStr, now);

      // Check if the IP needs to be rate limited
      const ip = (request.headers['x-real-ip'] // nginx
        || request.headers['x-client-ip'] // apache
        || request.ip).toString() // fallback to default
      const ipLastAccessed = ipLastAccessedMap.get(ip);
      if (ipLastAccessed && now - ipLastAccessed < 5 * 60 * 1000) {
        reply.code(429).send('Too Many Requests');
        return;
      }
      ipLastAccessedMap.set(ip, now);
  
      // transfer some of each helium token
      await createAtaAndTransfer(provider, HNT_MINT, toBN(1, HNT_MINT_DECIMALS), provider.wallet.publicKey, wallet);
      await createAtaAndTransfer(provider, IOT_MINT, toBN(1, IOT_MINT_DECIMALS), provider.wallet.publicKey, wallet);
      await createAtaAndTransfer(provider, MOBILE_MINT, toBN(1, MOBILE_MINT_DECIMALS), provider.wallet.publicKey, wallet);

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