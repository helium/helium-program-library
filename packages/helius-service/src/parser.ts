import { Program } from '@project-serum/anchor';
import { HeliumEntityManager } from '@helium/idls/lib/types/helium_entity_manager';
import { PublicKey } from '@solana/web3.js';
import { Entity, IotMetadata, MobileMetadata } from './model';

type Parser = {
  parseAndWrite: (program: Program<HeliumEntityManager>, tx: any, ix: any, args: any) => Promise<void>,
}

export function findAccountKey(program: Program<HeliumEntityManager>, tx: any, ix: any, ixName: string, accName: string): PublicKey | null {
  const idlIx = program.idl.instructions.find(
    (x) => x.name === ixName
  )!;
  const accIdx = idlIx.accounts.findIndex(
    (x) => x.name === accName
  )!;
  return tx.message.accountKeys[ix.accounts[accIdx]];
}

async function getAssetIdFromInfo(program: Program<HeliumEntityManager>, tx: any, ix: any, ixName: string): Promise<PublicKey | null> {
  const idlIx = program.idl.instructions.find(
    (x) => x.name === ixName
  )!;
  const infoIdx = idlIx.accounts.findIndex(
    (x) => x.name === "info" || x.name === "iotInfo" || x.name === "mobileInfo"
  )!;
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

async function getKeysFromKeyToAsset(program: Program<HeliumEntityManager>, tx: any, ix: any, ixName: string): Promise<[PublicKey, string]> {
  let keyToAssetKey = findAccountKey(program, tx, ix, ixName, "keyToAsset")!;
  let keyToAsset = await program.account.keyToAssetV0.fetch(keyToAssetKey);
  return [keyToAsset.asset, keyToAsset.entityKey.toString()];
}

export const instructionParser: Record<string, Parser>  = {
  "onboardIotHotspotV0": {
    async parseAndWrite(program, tx, ix, args) {
      const hotspotKey = (await getKeysFromKeyToAsset(program, tx, ix, "onboardIotHotspotV0"))[1];
      await IotMetadata.upsert({
        hotspotKey,
        location: args.location ? args.location.toString() : null,
        elevation: args.elevation,
        gain: args.gain,
        isFullHotspot: true,
      });
    }
  },
  "onboardMobileHotspotV0": {
    async parseAndWrite(program, tx, ix, args) {
      const hotspotKey = (await getKeysFromKeyToAsset(program, tx, ix, "onboardMobileHotspotV0"))[1];

      await MobileMetadata.upsert({
        hotspotKey,
        location: args.location ? args.location.toString() : null,
        isFullHotspot: true,
      });
    }
  },
  "genesisIssueHotspotV0": {
    async parseAndWrite(program, tx, ix, args) {
      const [assetId, hotspotKey] = await getKeysFromKeyToAsset(program, tx, ix, "genesisIssueHotspotV0");
      const makerKey = findAccountKey(program, tx, ix, "genesisIssueHotspotV0", "maker");
      await Entity.upsert({
        hotspotKey,
        assetId: assetId.toString(),
        maker: makerKey.toString(),
      });

      await IotMetadata.upsert({
        hotspotKey,
        location: args.location ? args.location.toString() : null,
        elevation: args.elevation,
        gain: args.gain,
        isFullHotspot: args.isFullHotspot,
      });

      const idlIx = program.idl.instructions.find(
        (x) => x.name === "genesisIssueHotspotV0"
      )!;
      // iot hotspot is also a mobile hotspot if there's remaining accounts
      const isMobile = ix.accounts.length() > idlIx.accounts.length
      if (isMobile) {
        await MobileMetadata.upsert({
          hotspotKey,
          location: args.location ? args.location.toString() : null,
          isFullHotspot: args.isFullHotspot,
        })
      }
    }
  },
  "issueEntityV0": {
    async parseAndWrite(program, tx, ix, args) {
      const [assetId, hotspotKey] = await getKeysFromKeyToAsset(program, tx, ix, "issueEntityV0");
      const makerKey = findAccountKey(program, tx, ix, "issueEntityV0", "maker");
      await Entity.create({
        assetId: assetId.toString(),
        hotspotKey,
        maker: makerKey.toString(),
      })
    }
  },
  "updateIotInfoV0": {
    async parseAndWrite(program, tx, ix, args) {
      const assetId = await getAssetIdFromInfo(program, tx, ix, "updateIotInfoV0");
      const record = await Entity.findOne({
        where: {
          assetId: assetId.toString(),
        }
      });
      await IotMetadata.update({
        ...(args.location && {location: args.location.toString()}),
        ...(args.elevation && {elevation: args.elevation}),
        ...(args.gain && {gain: args.gain}),
      }, {
        where: {hotspotKey: record.getDataValue("hotspotKey")}
      });
    }
  },
  "updateMobileInfoV0": {
    async parseAndWrite(program, tx, ix, args) {
      const assetId = await getAssetIdFromInfo(program, tx, ix, "updateIotInfoV0");
      const record = await Entity.findOne({
        where: {
          assetId: assetId.toString(),
        }
      });
      
      await MobileMetadata.update({
        ...(args.location && {location: args.location.toString()}),
      }, {
        where: {hotspotKey: record.getDataValue("hotspotKey")}
      });
    }
  }
}