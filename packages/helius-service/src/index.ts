import { AnchorProvider, BorshInstructionCoder, Program } from '@coral-xyz/anchor';
import { init } from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { HeliumEntityManager } from '@helium/idls/lib/types/helium_entity_manager';
import { PublicKey } from '@solana/web3.js';
import fastify from 'fastify';
import { sequelize } from './model';
import { findAccountKey, instructionParser } from './parser';
import * as dotenv from 'dotenv';
dotenv.config();

// sync the model with the database
sequelize.sync()
  .then(() => {
    console.log('Tables synced');
  })
  .catch(error => {
    console.error('Error syncing tables:', error);
  });

const server = fastify();
let hemProgram: Program<HeliumEntityManager>;

server.post('/', async (request, reply) => {
  if (request.headers.authorization != process.env.HELIUS_AUTH ) {
    reply.status(403).send({
      message: 'Invalid authorization'
    });
    return;
  }
  let tx = request.body[0].transaction;
  // testing code for localnet txs
  // let sig = request.body.sig;
  // let tx = (await hemProgram.provider.connection.getTransaction(sig, {commitment: 'finalized'}))!.transaction;
  const instructions = tx.message.instructions;
  try {
    // iterate through instructions and update/create db rows
    for (const ix of instructions) {
      let decoded = (
        hemProgram.coder.instruction as BorshInstructionCoder
      ).decode(ix.data, "hex");

      // if hex decode didn't succeed, try decoding as base58
      if (!decoded) {
        decoded = (
          hemProgram.coder.instruction as BorshInstructionCoder
        ).decode(ix.data, "base58");
      }
      if (!decoded || !(decoded.name in instructionParser)) {
        continue;
      }
      const args = (decoded.data as any).args;
 
      const method = instructionParser[decoded.name];
      //@ts-ignore
      const ixDaoKey = findAccountKey(hemProgram, tx, ix, decoded.name, "dao")
      // ignore txs relating to other daos
      if (!ixDaoKey.equals(daoKey(new PublicKey(process.env.HNT_MINT))[0])) {
        continue;
      }
      //@ts-ignore
      await method.parseAndWrite(hemProgram, tx, ix, args); 
      console.log("wrote successfully");
    }
    // send a response to the client
    reply.send({
      message: 'Success'
    });
  } catch(err) {
    reply.status(500).send({
      message: 'Request failed'
    });
    console.error(err);
  }
});

const start = async () => {
  try {
    const provider = AnchorProvider.env();
    hemProgram = await init(provider);
    // start the server
    await server.listen({ port: 3000, host: "0.0.0.0" });

    const address = server.server.address();
    const port = typeof address === "string" ? address : address?.port;
    console.log(`Running on 0.0.0.0:${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};
start();


