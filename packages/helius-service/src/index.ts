import fastify from 'fastify';
import {init, PROGRAM_ID} from "@helium/helium-entity-manager-sdk";
import { AnchorProvider, BN, BorshInstructionCoder, Program } from '@coral-xyz/anchor';
import { HeliumEntityManager } from '@helium/idls/lib/types/helium_entity_manager';
import { Keypair, PublicKey } from '@solana/web3.js';
import { sequelize, Hotspot } from './model';

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
    // get relevant idl ixs
    const onboardHotspotIx = hemProgram.idl.instructions.find(
      (x) => x.name === "onboardIotHotspotV0"
    )!;
    const genesisIssueIx = hemProgram.idl.instructions.find(
      (x) => x.name === "genesisIssueHotspotV0"
    )!;
    const updateIotIx = hemProgram.idl.instructions.find(
      (x) => x.name === "updateIotInfoV0"
    )!;
    
    // get relevant indices
    const issueInfoIdx = onboardHotspotIx.accounts.findIndex(
      (x) => x.name === "iotInfo"
    )!
    const genesisIssueInfoIdx = genesisIssueIx.accounts.findIndex(
      (x) => x.name === "info"
    )!
    const treeIdx = updateIotIx.accounts.findIndex(
      (x) => x.name === "tree"
    )!

    // iterate through instructions and update/create db rows
    for (const ix of instructions) {
      let decoded = (
        hemProgram.coder.instruction as BorshInstructionCoder
      ).decode(ix.data);
      const args = (decoded.data as any).args;
      if (
        decoded.name == "onboardIotHotspotV0" ||
        decoded.name == "genesisIssueHotspotV0"
      ) {
        // Create a new hotspot with no location, elevation or gain metadata
        let idx =
          decoded.name == "onboardIotHotspotV0"
            ? issueInfoIdx
            : genesisIssueInfoIdx;
        let infoKey = tx.message.accountKeys[ix.accounts[idx]];
        let info = await hemProgram.account.iotHotspotInfoV0.fetch(infoKey);
        const hotspotData = {
          asset: info.asset,
          hotspot_key: args.hotspotKey,
          location: null,
          elevation: null,
          gain: null,
        };
        console.log(hotspotData);
        await Hotspot.create(hotspotData);
      } else if (decoded.name == "updateIotInfoV0") {
        const asset = getLeafAssetId(
          tx.message.accountKeys[ix.accounts[treeIdx]],
          args.index
        );
        const hotspot = await Hotspot.findOne({
          where: { asset: asset.toString() },
        });

        // Update the hotspot's location, elevation and gain
        if (args.location) {
          hotspot.set("location", `${args.location}`);
        }
        if (args.elevation) {
          hotspot.set("elevation", args.elevation);
        }
        if (args.gain) {
          hotspot.set("gain", args.gain);
        }

        await hotspot.save();
      }
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


