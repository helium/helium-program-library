import cors from "@fastify/cors";
import { humanReadable } from "@helium/spl-utils";
import { init, positionKey } from "@helium/voter-stake-registry-sdk";
import { AccountLayout, getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
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
  const vsrProgram = await init(provider);
  const position = positionKey(mint)[0];
  const positionAcc = await vsrProgram.account.positionV0.fetch(position);
  const registrar = await vsrProgram.account.registrar.fetch(positionAcc.registrar);
  const votingMint = registrar.votingMints[positionAcc.votingMintConfigIdx];
  const decimals = (await getMint(provider.connection, votingMint.mint)).decimals;
  const uiAmount = humanReadable(positionAcc.amountDepositedNative, decimals)
  const lockEndDate = new Date(
    positionAcc.lockup.endTs.toNumber() * 1000
  ).toLocaleDateString();
  const kind = Object.keys(positionAcc.lockup.kind)[0];

  const name = `${uiAmount} (${kind})${
    kind === "constant" ? "" : `, ${lockEndDate}`
  }`;

  const accounts = await provider.connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      {
        dataSize: AccountLayout.span,
      },
      {
        memcmp: {
          offset: 0,
          bytes: mint.toBase58(),
        },
      },
    ]});

  let owner: string | undefined = undefined;
  for (const account of accounts) {
    const accountData = AccountLayout.decode(account.account.data);
    if (accountData.amount.toString() === '1') {
      owner = accountData.owner.toBase58();
      break;
    }
  }

  return {
    name,
    description: `Voting Escrow Token Position of ${uiAmount} tokens${kind === 'constant' ? '.' : ` locked until ${lockEndDate} with kind ${kind}`}`,
    image:
      "https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP/vsr.png",
    attributes: [
      { trait_type: "owner", owner },
      { trait_type: "registrar", value: positionAcc.registrar.toBase58() },
      { trait_type: "amount_deposited_native", value: positionAcc.amountDepositedNative.toString() },
      { trait_type: "amount_deposited", value: uiAmount },
      { trait_type: "voting_mint_config_idx", value: positionAcc.votingMintConfigIdx },
      { trait_type: "voting_mint", value: votingMint.mint.toBase58() },
      { trait_type: "start_ts", value: positionAcc.lockup.startTs.toString() },
      { trait_type: "end_ts", value: positionAcc.lockup.endTs.toString() },
      { trait_type: "kind", value: kind },
      { trait_type: "genesis_end", value: positionAcc.genesisEnd },
      { trait_type: "num_active_votes", value: positionAcc.numActiveVotes },
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
