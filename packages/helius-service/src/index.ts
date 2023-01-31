import fastify from 'fastify';
import {init, PROGRAM_ID} from "@helium/helium-entity-manager-sdk";
import { AnchorProvider, BN, BorshInstructionCoder, Program } from '@coral-xyz/anchor';
import { HeliumEntityManager } from '@helium/idls/lib/types/helium_entity_manager';
import { Keypair, PublicKey } from '@solana/web3.js';
import { sequelize, Entity, IotMetadata, MobileMetadata } from './model';
import { instructionParser } from './parser';

// sync the model with the database
sequelize.sync()
  .then(() => {
    console.log('Hotspot table synced');
  })
  .catch(error => {
    console.error('Error syncing Hotspot table:', error);
  });

function getLeafAssetId(tree: PublicKey, leafIndex: BN): PublicKey {
  const [assetId] = PublicKey.findProgramAddressSync(
    [Buffer.from('asset', 'utf8'), tree.toBuffer(), Uint8Array.from(leafIndex.toArray('le', 8))],
    new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY"),
  );
  return assetId;
}
const server = fastify();
let hemProgram: Program<HeliumEntityManager>;

server.post('/', async (request, reply) => {
  let tx = request.body[0].transaction;
  const instructions = tx.message.instructions;
  try {
    // iterate through instructions and update/create db rows
    for (const ix of instructions) {
      let decoded = (
        hemProgram.coder.instruction as BorshInstructionCoder
      ).decode(ix.data);
      const args = (decoded.data as any).args;
      if (!(decoded.name in instructionParser)) {
        continue;
      }
      const method = instructionParser[decoded.name];
      await method.parseAndWrite(hemProgram, tx, ix, args);
    }
    // send a response to the client
    reply.send({
      message: 'POST request received'
    });
  } catch(err) {
    reply.status(500).send({
      message: 'Request failed'
    });
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


