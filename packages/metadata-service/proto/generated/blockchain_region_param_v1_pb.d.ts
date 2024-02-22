// package: helium
// file: blockchain_region_param_v1.proto

import * as jspb from "google-protobuf";

export class blockchain_region_params_v1 extends jspb.Message {
  clearRegionParamsList(): void;
  getRegionParamsList(): Array<blockchain_region_param_v1>;
  setRegionParamsList(value: Array<blockchain_region_param_v1>): void;
  addRegionParams(value?: blockchain_region_param_v1, index?: number): blockchain_region_param_v1;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): blockchain_region_params_v1.AsObject;
  static toObject(includeInstance: boolean, msg: blockchain_region_params_v1): blockchain_region_params_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: blockchain_region_params_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): blockchain_region_params_v1;
  static deserializeBinaryFromReader(message: blockchain_region_params_v1, reader: jspb.BinaryReader): blockchain_region_params_v1;
}

export namespace blockchain_region_params_v1 {
  export type AsObject = {
    regionParamsList: Array<blockchain_region_param_v1.AsObject>,
  }
}

export class tagged_spreading extends jspb.Message {
  getRegionSpreading(): RegionSpreadingMap[keyof RegionSpreadingMap];
  setRegionSpreading(value: RegionSpreadingMap[keyof RegionSpreadingMap]): void;

  getMaxPacketSize(): number;
  setMaxPacketSize(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): tagged_spreading.AsObject;
  static toObject(includeInstance: boolean, msg: tagged_spreading): tagged_spreading.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: tagged_spreading, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): tagged_spreading;
  static deserializeBinaryFromReader(message: tagged_spreading, reader: jspb.BinaryReader): tagged_spreading;
}

export namespace tagged_spreading {
  export type AsObject = {
    regionSpreading: RegionSpreadingMap[keyof RegionSpreadingMap],
    maxPacketSize: number,
  }
}

export class blockchain_region_spreading_v1 extends jspb.Message {
  clearTaggedSpreadingList(): void;
  getTaggedSpreadingList(): Array<tagged_spreading>;
  setTaggedSpreadingList(value: Array<tagged_spreading>): void;
  addTaggedSpreading(value?: tagged_spreading, index?: number): tagged_spreading;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): blockchain_region_spreading_v1.AsObject;
  static toObject(includeInstance: boolean, msg: blockchain_region_spreading_v1): blockchain_region_spreading_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: blockchain_region_spreading_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): blockchain_region_spreading_v1;
  static deserializeBinaryFromReader(message: blockchain_region_spreading_v1, reader: jspb.BinaryReader): blockchain_region_spreading_v1;
}

export namespace blockchain_region_spreading_v1 {
  export type AsObject = {
    taggedSpreadingList: Array<tagged_spreading.AsObject>,
  }
}

export class blockchain_region_param_v1 extends jspb.Message {
  getChannelFrequency(): number;
  setChannelFrequency(value: number): void;

  getBandwidth(): number;
  setBandwidth(value: number): void;

  getMaxEirp(): number;
  setMaxEirp(value: number): void;

  hasSpreading(): boolean;
  clearSpreading(): void;
  getSpreading(): blockchain_region_spreading_v1 | undefined;
  setSpreading(value?: blockchain_region_spreading_v1): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): blockchain_region_param_v1.AsObject;
  static toObject(includeInstance: boolean, msg: blockchain_region_param_v1): blockchain_region_param_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: blockchain_region_param_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): blockchain_region_param_v1;
  static deserializeBinaryFromReader(message: blockchain_region_param_v1, reader: jspb.BinaryReader): blockchain_region_param_v1;
}

export namespace blockchain_region_param_v1 {
  export type AsObject = {
    channelFrequency: number,
    bandwidth: number,
    maxEirp: number,
    spreading?: blockchain_region_spreading_v1.AsObject,
  }
}

export interface RegionSpreadingMap {
  SF_INVALID: 0;
  SF7: 1;
  SF8: 2;
  SF9: 3;
  SF10: 4;
  SF11: 5;
  SF12: 6;
}

export const RegionSpreading: RegionSpreadingMap;

