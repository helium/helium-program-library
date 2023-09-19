import cors from '@fastify/cors';
import { PublicKey } from '@solana/web3.js';
import Fastify, { FastifyInstance } from 'fastify';
import * as jup from './jupiter';
import { HNT_MINT, IOT_MINT, MOBILE_MINT } from '@helium/spl-utils';

const server: FastifyInstance = Fastify({ logger: true });
server.register(cors, { origin: '*' });

server.get('/health', async (req, res) => {
  res.send({ ok: true });
});

server.post<{
  Body: { wallet: string; mint: string };
}>('/fees', async (req, res) => {
  try {
    const { wallet, mint } = req.body;
    const walletPk = new PublicKey(wallet);
    const mintPk = new PublicKey(mint);

    res.send(
      Buffer.from(
        (await jup.fundFees({ userWallet: walletPk, mint: mintPk })).serialize()
      ).toJSON().data
    );
  } catch (err) {
    res.code(500).send(err);
    console.error(err);
  }
});

server.post<{
  Body: { mint: string };
}>('/estimate', async (req, res) => {
  try {
    const { mint } = req.body;
    const mintPk = new PublicKey(mint);

    res.send({
      estimate: await jup.estimate({ mint: mintPk }),
    });
  } catch (err) {
    res.code(500).send(err);
    console.error(err);
  }
});

server.get<{}>('/estimates', async (req, res) => {
  try {
    res.send({
      [HNT_MINT.toBase58()]: await jup.estimate({ mint: HNT_MINT }),
      [MOBILE_MINT.toBase58()]: await jup.estimate({ mint: MOBILE_MINT }),
      [IOT_MINT.toBase58()]: await jup.estimate({ mint: IOT_MINT }),
    });
  } catch (err) {
    res.code(500).send(err);
    console.error(err);
  }
});

const start = async () => {
  try {
    await server.listen({
      port: Number(process.env.PORT) || 8081,
      host: '0.0.0.0',
    });

    const address = server.server.address();
    const port = typeof address === 'string' ? address : address?.port;
    console.log(`Running on 0.0.0.0:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
