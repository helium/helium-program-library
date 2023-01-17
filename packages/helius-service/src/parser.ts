import fastify from 'fastify';
import {init, PROGRAM_ID} from "@helium/helium-entity-manager-sdk";
import { AnchorProvider, BN, BorshInstructionCoder, Instruction, Program } from '@project-serum/anchor';
import { HeliumEntityManager } from '@helium/idls/lib/types/helium_entity_manager';
import { Keypair, PublicKey } from '@solana/web3.js';
import { sequelize, Hotspot } from './model';

type Parser = {
  getAssetId: (program: Program<HeliumEntityManager>, tx: any, ix: any) => Promise<PublicKey>,
  getHotspotKey: (program: Program<HeliumEntityManager>, tx: any, ix: any, args: any) => Promise<string>,
  getHotspotData: (assetId: PublicKey, hotspotKey: string, args: any) => any,
}

async function getAssetIdFromInfo(program: Program<HeliumEntityManager>, tx: any, ix: any, ixName: string): Promise<PublicKey | null> {
  const idlIx = program.idl.instructions.find(
    (x) => x.name === ixName
  )!;
  const infoIdx = idlIx.accounts.findIndex(
    (x) => x.name === "info" || x.name === "iotInfo" || x.name === "mobileInfo"
  )!
  let infoKey = tx.message.accountKeys[ix.accounts[infoIdx]];
  let infoName = idlIx.accounts[infoIdx].name;
  let info;
  if (infoName === "iotInfo" || infoName === "info") {
    info = await program.account.iotHotspotInfoV0.fetch(infoKey);
  } else if (infoName === "mobileInfo") {
    info = await program.account.mobileHotspotInfoV0.fetch(infoKey);
  }
  return info.asset;
}

export const instructionParser: Record<string, Parser>  = {
  "onboardIotHotspotV0": {
    async getAssetId(program, tx, ix) {
      return await getAssetIdFromInfo(program, tx, ix, "onboardIotHotspotV0");
    },
    async getHotspotKey(program, tx, ix, args) {
      return args.hotspotKey;
    },
    getHotspotData(assetId, hotspotKey, args) {
      return {
        asset: assetId.toString(),
        hotspot_key: hotspotKey,
        location: null,
        elevation: null,
        gain: null,
      };
    },
  },
  "onboardMobileHotspotV0": {
    async getAssetId(program, tx, ix) {
      return await getAssetIdFromInfo(program, tx, ix, "onboardMobileHotspotV0");
    },
    async getHotspotKey(program, tx, ix, args) {
      return args.hotspotKey;
    },
    getHotspotData(assetId, hotspotKey, args) {
      return {
        asset: assetId.toString(),
        hotspot_key: hotspotKey,
        location: null,
        elevation: null,
        gain: null,
      };
    },
  },
  "genesisIssueHotspotV0": {
    async getAssetId(program, tx, ix) {
      return await getAssetIdFromInfo(program, tx, ix, "genesisIssueHotspotV0");
    },
    async getHotspotKey(program, tx, ix, args) {
      return args.hotspotKey;
    },
    getHotspotData(assetId, hotspotKey, args) {
      return {
        asset: assetId.toString(),
        hotspot_key: hotspotKey,
        location: null,
        elevation: null,
        gain: null,
      };
    },
  },
  "issueEntityV0": {
    async getAssetId(program, tx, ix) {
      return await getAssetIdFromInfo(program, tx, ix, "issueEntityV0");
    },
    async getHotspotKey(program, tx, ix, args) {
      return args.entityKey;
    },
    getHotspotData(assetId, hotspotKey, args) {
      return {
        asset: assetId.toString(),
        hotspot_key: hotspotKey,
        location: null,
        elevation: null,
        gain: null,
      };
    },
  },
  "updateIotInfoV0": {
    async getAssetId(program, tx, ix) {
      return await getAssetIdFromInfo(program, tx, ix, "updateIotInfoV0");
    },
    async getHotspotKey(program, tx, ix, args) {
      return null
    },
    getHotspotData(assetId, hotspotKey, args) {
      return {
        asset: assetId.toString(),
        ...(args.location && {location: args.location}),
        ...(args.elevation && {elevation: args.elevation}),
        ...(args.gain && {gain: args.gain}),
      };
    },
  },
  "updateMobileInfoV0": {
    async getAssetId(program, tx, ix) {
      return await getAssetIdFromInfo(program, tx, ix, "updateMobileInfoV0");
    },
    async getHotspotKey(program, tx, ix, args) {
      return null;
    },
    getHotspotData(assetId, hotspotKey, args) {
      return {
        asset: assetId.toString(),
        ...(args.location && {location: args.location}),
        ...(args.elevation && {elevation: args.elevation}),
        ...(args.gain && {gain: args.gain}),

      };
    },
  }
}