import { Program } from '@coral-xyz/anchor';
import cors from '@fastify/cors';
import Address from '@helium/address/build/Address';
import {
  decodeEntityKey,
  init,
  iotInfoKey,
  mobileInfoKey,
  rewardableEntityConfigKey,
} from '@helium/helium-entity-manager-sdk';
import { HeliumEntityManager } from '@helium/idls/lib/types/helium_entity_manager';
import { PublicKey } from '@solana/web3.js';
// @ts-ignore
import animalHash from 'angry-purple-tiger';
import axios from 'axios';
import Fastify, { FastifyInstance } from 'fastify';
import {
  IOT_SUB_DAO_KEY,
  MOBILE_SUB_DAO_KEY,
  SHDW_DRIVE_URL,
} from './constants';
import { provider } from './solana';

const server: FastifyInstance = Fastify({
  logger: true,
});
server.register(cors, {
  origin: '*',
});
server.get('/health', async () => {
  return { ok: true };
});

let program: Program<HeliumEntityManager>;

server.get<{ Params: { keyToAssetKey: string } }>(
  '/v1/:keyToAssetKey',
  async (request, reply) => {
    program = program || (await init(provider));
    const { keyToAssetKey } = request.params;
    const keyToAsset = new PublicKey(keyToAssetKey);
    const keyToAssetAcc = await program.account.keyToAssetV0.fetch(keyToAsset);
    const { entityKey, keySerialization } = keyToAssetAcc;
    const keyStr = decodeEntityKey(entityKey, keySerialization);
    const digest = animalHash(keyStr);

    // HACK: If it has a long key, it's an RSA key, and this is a mobile hotspot.
    // In the future, we need to put different symbols on different types of hotspots
    const hotspotType = entityKey.length > 100 ? 'MOBILE' : 'IOT';
    const isMobile = hotspotType === 'MOBILE';
    const [configKey] = rewardableEntityConfigKey(
      isMobile ? MOBILE_SUB_DAO_KEY : IOT_SUB_DAO_KEY,
      hotspotType
    );

    const [info] = isMobile
      ? mobileInfoKey(configKey, entityKey)
      : iotInfoKey(configKey, entityKey);

    const infoAcc = await program.account[
      isMobile ? 'mobileHotspotInfoV0' : 'iotHotspotInfoV0'
    ].fetch(info);

    const image = `${SHDW_DRIVE_URL}/${
      infoAcc?.isActive
        ? isMobile
          ? 'mobile-hotspot-active.png'
          : 'hotspot-active.png'
        : isMobile
        ? 'mobile-hotspot.png'
        : 'hotspot.png'
    }`;

    return {
      image,
      name: keyStr === 'iot_operations_fund' ? 'IOT Operations Fund' : digest,
      description:
        keyStr === 'iot_operations_fund'
          ? 'IOT Operations Fund'
          : 'A Rewardable NFT on Helium',
      attributes: [
        keyStr && Address.isValid(keyStr)
          ? { trait_type: 'ecc_compact', value: keyStr }
          : undefined,
        { trait_type: 'entity_key_string', value: keyStr },
        {
          trait_type: 'entity_key',
          value: entityKey.toString('base64'),
        },
        { trait_type: 'rewardable', value: true },
      ],
    };
  }
);

server.get<{ Params: { eccCompact: string } }>(
  '/:eccCompact',
  async (request, reply) => {
    const { eccCompact } = request.params;

    // TODO: Remove this once we can update compressed nft metadata
    if (eccCompact?.length === 22) {
      try {
        const { data } = await axios(
          `https://sol.hellohelium.com/api/metadata/${eccCompact}`
        );
        return data;
      } catch (e: any) {
        console.error(e);
      }
    }

    const digest = animalHash(eccCompact);

    const [configKey] = rewardableEntityConfigKey(IOT_SUB_DAO_KEY, 'IOT');
    const [info] = iotInfoKey(configKey, eccCompact);
    const infoAcc = await program.account.iotHotspotInfoV0.fetch(info);
    const image = `${SHDW_DRIVE_URL}/${
      infoAcc?.isActive ? 'hotspot-active.png' : 'hotspot.png'
    }`;

    return {
      name: digest,
      description: 'A Hotspot NFT on Helium',
      image,
      attributes: [
        { trait_type: 'ecc_compact', value: eccCompact },
        { trait_type: 'rewardable', value: true },
      ],
    };
  }
);

const start = async () => {
  try {
    await server.listen({ port: 8081, host: '0.0.0.0' });

    const address = server.server.address();
    const port = typeof address === 'string' ? address : address?.port;
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
