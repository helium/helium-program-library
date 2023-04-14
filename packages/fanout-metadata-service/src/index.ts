import cors from "@fastify/cors";
import { init, membershipVoucherKey } from "@helium/fanout-sdk";
import { humanReadable } from "@helium/spl-utils";
import { getMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import Fastify, { FastifyInstance } from "fastify";
import { provider } from "./solana";

const server: FastifyInstance = Fastify({
  logger: true
});
server.register(cors, {
  origin: "*"
});
server.get("/health", async () => {
  return { ok: true };
})

server.get<{ Params: { mintKey: string } }>("/:mintKey", async (request, reply) => {
  const { mintKey } = request.params;
  const mint = new PublicKey(mintKey);
  const fanoutProgram = await init(provider);
  const voucher = membershipVoucherKey(mint)[0];
  const voucherAcc = await fanoutProgram.account.fanoutVoucherV0.fetch(voucher);
  const fanout = await fanoutProgram.account.fanoutV0.fetch(voucherAcc.fanout);
  const decimals = (await getMint(provider.connection, fanout.membershipMint)).decimals;
  const uiAmount = humanReadable(voucherAcc.shares, decimals)
  return {
    description: `${uiAmount} tokens staked in a fanout wallet, receiving ${fanout.fanoutMint.toBase58()} tokens`,
    image:
      "https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib/vsr.png",
    attributes: [
      { trait_type: "amount_deposited", value: uiAmount },
    ],
  };
});

const start = async () => {
  try {
    await server.listen({ port: 8081, host: "0.0.0.0" });

    const address = server.server.address();
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
