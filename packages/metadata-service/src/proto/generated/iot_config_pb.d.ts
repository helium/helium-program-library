// package: helium.iot_config
// file: iot_config.proto

import * as jspb from "google-protobuf";
import * as blockchain_region_param_v1_pb from "./blockchain_region_param_v1_pb";
import * as region_pb from "./region_pb";

export class org_v1 extends jspb.Message {
  getOui(): number;
  setOui(value: number): void;

  getOwner(): Uint8Array | string;
  getOwner_asU8(): Uint8Array;
  getOwner_asB64(): string;
  setOwner(value: Uint8Array | string): void;

  getPayer(): Uint8Array | string;
  getPayer_asU8(): Uint8Array;
  getPayer_asB64(): string;
  setPayer(value: Uint8Array | string): void;

  clearDelegateKeysList(): void;
  getDelegateKeysList(): Array<Uint8Array | string>;
  getDelegateKeysList_asU8(): Array<Uint8Array>;
  getDelegateKeysList_asB64(): Array<string>;
  setDelegateKeysList(value: Array<Uint8Array | string>): void;
  addDelegateKeys(value: Uint8Array | string, index?: number): Uint8Array | string;

  getLocked(): boolean;
  setLocked(value: boolean): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): org_v1.AsObject;
  static toObject(includeInstance: boolean, msg: org_v1): org_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: org_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): org_v1;
  static deserializeBinaryFromReader(message: org_v1, reader: jspb.BinaryReader): org_v1;
}

export namespace org_v1 {
  export type AsObject = {
    oui: number,
    owner: Uint8Array | string,
    payer: Uint8Array | string,
    delegateKeysList: Array<Uint8Array | string>,
    locked: boolean,
  }
}

export class devaddr_range_v1 extends jspb.Message {
  getRouteId(): string;
  setRouteId(value: string): void;

  getStartAddr(): number;
  setStartAddr(value: number): void;

  getEndAddr(): number;
  setEndAddr(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): devaddr_range_v1.AsObject;
  static toObject(includeInstance: boolean, msg: devaddr_range_v1): devaddr_range_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: devaddr_range_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): devaddr_range_v1;
  static deserializeBinaryFromReader(message: devaddr_range_v1, reader: jspb.BinaryReader): devaddr_range_v1;
}

export namespace devaddr_range_v1 {
  export type AsObject = {
    routeId: string,
    startAddr: number,
    endAddr: number,
  }
}

export class devaddr_constraint_v1 extends jspb.Message {
  getStartAddr(): number;
  setStartAddr(value: number): void;

  getEndAddr(): number;
  setEndAddr(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): devaddr_constraint_v1.AsObject;
  static toObject(includeInstance: boolean, msg: devaddr_constraint_v1): devaddr_constraint_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: devaddr_constraint_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): devaddr_constraint_v1;
  static deserializeBinaryFromReader(message: devaddr_constraint_v1, reader: jspb.BinaryReader): devaddr_constraint_v1;
}

export namespace devaddr_constraint_v1 {
  export type AsObject = {
    startAddr: number,
    endAddr: number,
  }
}

export class eui_pair_v1 extends jspb.Message {
  getRouteId(): string;
  setRouteId(value: string): void;

  getAppEui(): number;
  setAppEui(value: number): void;

  getDevEui(): number;
  setDevEui(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): eui_pair_v1.AsObject;
  static toObject(includeInstance: boolean, msg: eui_pair_v1): eui_pair_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: eui_pair_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): eui_pair_v1;
  static deserializeBinaryFromReader(message: eui_pair_v1, reader: jspb.BinaryReader): eui_pair_v1;
}

export namespace eui_pair_v1 {
  export type AsObject = {
    routeId: string,
    appEui: number,
    devEui: number,
  }
}

export class protocol_packet_router_v1 extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): protocol_packet_router_v1.AsObject;
  static toObject(includeInstance: boolean, msg: protocol_packet_router_v1): protocol_packet_router_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: protocol_packet_router_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): protocol_packet_router_v1;
  static deserializeBinaryFromReader(message: protocol_packet_router_v1, reader: jspb.BinaryReader): protocol_packet_router_v1;
}

export namespace protocol_packet_router_v1 {
  export type AsObject = {
  }
}

export class protocol_gwmp_mapping_v1 extends jspb.Message {
  getRegion(): region_pb.regionMap[keyof region_pb.regionMap];
  setRegion(value: region_pb.regionMap[keyof region_pb.regionMap]): void;

  getPort(): number;
  setPort(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): protocol_gwmp_mapping_v1.AsObject;
  static toObject(includeInstance: boolean, msg: protocol_gwmp_mapping_v1): protocol_gwmp_mapping_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: protocol_gwmp_mapping_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): protocol_gwmp_mapping_v1;
  static deserializeBinaryFromReader(message: protocol_gwmp_mapping_v1, reader: jspb.BinaryReader): protocol_gwmp_mapping_v1;
}

export namespace protocol_gwmp_mapping_v1 {
  export type AsObject = {
    region: region_pb.regionMap[keyof region_pb.regionMap],
    port: number,
  }
}

export class protocol_gwmp_v1 extends jspb.Message {
  clearMappingList(): void;
  getMappingList(): Array<protocol_gwmp_mapping_v1>;
  setMappingList(value: Array<protocol_gwmp_mapping_v1>): void;
  addMapping(value?: protocol_gwmp_mapping_v1, index?: number): protocol_gwmp_mapping_v1;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): protocol_gwmp_v1.AsObject;
  static toObject(includeInstance: boolean, msg: protocol_gwmp_v1): protocol_gwmp_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: protocol_gwmp_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): protocol_gwmp_v1;
  static deserializeBinaryFromReader(message: protocol_gwmp_v1, reader: jspb.BinaryReader): protocol_gwmp_v1;
}

export namespace protocol_gwmp_v1 {
  export type AsObject = {
    mappingList: Array<protocol_gwmp_mapping_v1.AsObject>,
  }
}

export class protocol_http_roaming_v1 extends jspb.Message {
  getFlowType(): protocol_http_roaming_v1.flow_type_v1Map[keyof protocol_http_roaming_v1.flow_type_v1Map];
  setFlowType(value: protocol_http_roaming_v1.flow_type_v1Map[keyof protocol_http_roaming_v1.flow_type_v1Map]): void;

  getDedupeTimeout(): number;
  setDedupeTimeout(value: number): void;

  getPath(): string;
  setPath(value: string): void;

  getAuthHeader(): string;
  setAuthHeader(value: string): void;

  getReceiverNsid(): string;
  setReceiverNsid(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): protocol_http_roaming_v1.AsObject;
  static toObject(includeInstance: boolean, msg: protocol_http_roaming_v1): protocol_http_roaming_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: protocol_http_roaming_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): protocol_http_roaming_v1;
  static deserializeBinaryFromReader(message: protocol_http_roaming_v1, reader: jspb.BinaryReader): protocol_http_roaming_v1;
}

export namespace protocol_http_roaming_v1 {
  export type AsObject = {
    flowType: protocol_http_roaming_v1.flow_type_v1Map[keyof protocol_http_roaming_v1.flow_type_v1Map],
    dedupeTimeout: number,
    path: string,
    authHeader: string,
    receiverNsid: string,
  }

  export interface flow_type_v1Map {
    SYNC: 0;
    ASYNC: 1;
  }

  export const flow_type_v1: flow_type_v1Map;
}

export class server_v1 extends jspb.Message {
  getHost(): string;
  setHost(value: string): void;

  getPort(): number;
  setPort(value: number): void;

  hasPacketRouter(): boolean;
  clearPacketRouter(): void;
  getPacketRouter(): protocol_packet_router_v1 | undefined;
  setPacketRouter(value?: protocol_packet_router_v1): void;

  hasGwmp(): boolean;
  clearGwmp(): void;
  getGwmp(): protocol_gwmp_v1 | undefined;
  setGwmp(value?: protocol_gwmp_v1): void;

  hasHttpRoaming(): boolean;
  clearHttpRoaming(): void;
  getHttpRoaming(): protocol_http_roaming_v1 | undefined;
  setHttpRoaming(value?: protocol_http_roaming_v1): void;

  getProtocolCase(): server_v1.ProtocolCase;
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): server_v1.AsObject;
  static toObject(includeInstance: boolean, msg: server_v1): server_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: server_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): server_v1;
  static deserializeBinaryFromReader(message: server_v1, reader: jspb.BinaryReader): server_v1;
}

export namespace server_v1 {
  export type AsObject = {
    host: string,
    port: number,
    packetRouter?: protocol_packet_router_v1.AsObject,
    gwmp?: protocol_gwmp_v1.AsObject,
    httpRoaming?: protocol_http_roaming_v1.AsObject,
  }

  export enum ProtocolCase {
    PROTOCOL_NOT_SET = 0,
    PACKET_ROUTER = 3,
    GWMP = 4,
    HTTP_ROAMING = 5,
  }
}

export class route_v1 extends jspb.Message {
  getId(): string;
  setId(value: string): void;

  getNetId(): number;
  setNetId(value: number): void;

  getOui(): number;
  setOui(value: number): void;

  hasServer(): boolean;
  clearServer(): void;
  getServer(): server_v1 | undefined;
  setServer(value?: server_v1): void;

  getMaxCopies(): number;
  setMaxCopies(value: number): void;

  getActive(): boolean;
  setActive(value: boolean): void;

  getLocked(): boolean;
  setLocked(value: boolean): void;

  getIgnoreEmptySkf(): boolean;
  setIgnoreEmptySkf(value: boolean): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_v1): route_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_v1;
  static deserializeBinaryFromReader(message: route_v1, reader: jspb.BinaryReader): route_v1;
}

export namespace route_v1 {
  export type AsObject = {
    id: string,
    netId: number,
    oui: number,
    server?: server_v1.AsObject,
    maxCopies: number,
    active: boolean,
    locked: boolean,
    ignoreEmptySkf: boolean,
  }
}

export class org_list_req_v1 extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): org_list_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: org_list_req_v1): org_list_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: org_list_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): org_list_req_v1;
  static deserializeBinaryFromReader(message: org_list_req_v1, reader: jspb.BinaryReader): org_list_req_v1;
}

export namespace org_list_req_v1 {
  export type AsObject = {
  }
}

export class org_list_res_v1 extends jspb.Message {
  clearOrgsList(): void;
  getOrgsList(): Array<org_v1>;
  setOrgsList(value: Array<org_v1>): void;
  addOrgs(value?: org_v1, index?: number): org_v1;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): org_list_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: org_list_res_v1): org_list_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: org_list_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): org_list_res_v1;
  static deserializeBinaryFromReader(message: org_list_res_v1, reader: jspb.BinaryReader): org_list_res_v1;
}

export namespace org_list_res_v1 {
  export type AsObject = {
    orgsList: Array<org_v1.AsObject>,
    timestamp: number,
    signer: Uint8Array | string,
    signature: Uint8Array | string,
  }
}

export class org_get_req_v1 extends jspb.Message {
  getOui(): number;
  setOui(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): org_get_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: org_get_req_v1): org_get_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: org_get_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): org_get_req_v1;
  static deserializeBinaryFromReader(message: org_get_req_v1, reader: jspb.BinaryReader): org_get_req_v1;
}

export namespace org_get_req_v1 {
  export type AsObject = {
    oui: number,
  }
}

export class org_create_helium_req_v1 extends jspb.Message {
  getOwner(): Uint8Array | string;
  getOwner_asU8(): Uint8Array;
  getOwner_asB64(): string;
  setOwner(value: Uint8Array | string): void;

  getPayer(): Uint8Array | string;
  getPayer_asU8(): Uint8Array;
  getPayer_asB64(): string;
  setPayer(value: Uint8Array | string): void;

  getDevaddrs(): number;
  setDevaddrs(value: number): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  clearDelegateKeysList(): void;
  getDelegateKeysList(): Array<Uint8Array | string>;
  getDelegateKeysList_asU8(): Array<Uint8Array>;
  getDelegateKeysList_asB64(): Array<string>;
  setDelegateKeysList(value: Array<Uint8Array | string>): void;
  addDelegateKeys(value: Uint8Array | string, index?: number): Uint8Array | string;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getNetId(): org_create_helium_req_v1.helium_net_idMap[keyof org_create_helium_req_v1.helium_net_idMap];
  setNetId(value: org_create_helium_req_v1.helium_net_idMap[keyof org_create_helium_req_v1.helium_net_idMap]): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): org_create_helium_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: org_create_helium_req_v1): org_create_helium_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: org_create_helium_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): org_create_helium_req_v1;
  static deserializeBinaryFromReader(message: org_create_helium_req_v1, reader: jspb.BinaryReader): org_create_helium_req_v1;
}

export namespace org_create_helium_req_v1 {
  export type AsObject = {
    owner: Uint8Array | string,
    payer: Uint8Array | string,
    devaddrs: number,
    timestamp: number,
    signature: Uint8Array | string,
    delegateKeysList: Array<Uint8Array | string>,
    signer: Uint8Array | string,
    netId: org_create_helium_req_v1.helium_net_idMap[keyof org_create_helium_req_v1.helium_net_idMap],
  }

  export interface helium_net_idMap {
    TYPE0_0X00003C: 0;
    TYPE3_0X60002D: 1;
    TYPE6_0XC00053: 2;
  }

  export const helium_net_id: helium_net_idMap;
}

export class org_create_roamer_req_v1 extends jspb.Message {
  getOwner(): Uint8Array | string;
  getOwner_asU8(): Uint8Array;
  getOwner_asB64(): string;
  setOwner(value: Uint8Array | string): void;

  getPayer(): Uint8Array | string;
  getPayer_asU8(): Uint8Array;
  getPayer_asB64(): string;
  setPayer(value: Uint8Array | string): void;

  getNetId(): number;
  setNetId(value: number): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  clearDelegateKeysList(): void;
  getDelegateKeysList(): Array<Uint8Array | string>;
  getDelegateKeysList_asU8(): Array<Uint8Array>;
  getDelegateKeysList_asB64(): Array<string>;
  setDelegateKeysList(value: Array<Uint8Array | string>): void;
  addDelegateKeys(value: Uint8Array | string, index?: number): Uint8Array | string;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): org_create_roamer_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: org_create_roamer_req_v1): org_create_roamer_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: org_create_roamer_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): org_create_roamer_req_v1;
  static deserializeBinaryFromReader(message: org_create_roamer_req_v1, reader: jspb.BinaryReader): org_create_roamer_req_v1;
}

export namespace org_create_roamer_req_v1 {
  export type AsObject = {
    owner: Uint8Array | string,
    payer: Uint8Array | string,
    netId: number,
    timestamp: number,
    signature: Uint8Array | string,
    delegateKeysList: Array<Uint8Array | string>,
    signer: Uint8Array | string,
  }
}

export class org_update_req_v1 extends jspb.Message {
  getOui(): number;
  setOui(value: number): void;

  clearUpdatesList(): void;
  getUpdatesList(): Array<org_update_req_v1.update_v1>;
  setUpdatesList(value: Array<org_update_req_v1.update_v1>): void;
  addUpdates(value?: org_update_req_v1.update_v1, index?: number): org_update_req_v1.update_v1;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): org_update_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: org_update_req_v1): org_update_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: org_update_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): org_update_req_v1;
  static deserializeBinaryFromReader(message: org_update_req_v1, reader: jspb.BinaryReader): org_update_req_v1;
}

export namespace org_update_req_v1 {
  export type AsObject = {
    oui: number,
    updatesList: Array<org_update_req_v1.update_v1.AsObject>,
    timestamp: number,
    signer: Uint8Array | string,
    signature: Uint8Array | string,
  }

  export class delegate_key_update_v1 extends jspb.Message {
    getDelegateKey(): Uint8Array | string;
    getDelegateKey_asU8(): Uint8Array;
    getDelegateKey_asB64(): string;
    setDelegateKey(value: Uint8Array | string): void;

    getAction(): action_v1Map[keyof action_v1Map];
    setAction(value: action_v1Map[keyof action_v1Map]): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): delegate_key_update_v1.AsObject;
    static toObject(includeInstance: boolean, msg: delegate_key_update_v1): delegate_key_update_v1.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: delegate_key_update_v1, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): delegate_key_update_v1;
    static deserializeBinaryFromReader(message: delegate_key_update_v1, reader: jspb.BinaryReader): delegate_key_update_v1;
  }

  export namespace delegate_key_update_v1 {
    export type AsObject = {
      delegateKey: Uint8Array | string,
      action: action_v1Map[keyof action_v1Map],
    }
  }

  export class devaddr_constraint_update_v1 extends jspb.Message {
    hasConstraint(): boolean;
    clearConstraint(): void;
    getConstraint(): devaddr_constraint_v1 | undefined;
    setConstraint(value?: devaddr_constraint_v1): void;

    getAction(): action_v1Map[keyof action_v1Map];
    setAction(value: action_v1Map[keyof action_v1Map]): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): devaddr_constraint_update_v1.AsObject;
    static toObject(includeInstance: boolean, msg: devaddr_constraint_update_v1): devaddr_constraint_update_v1.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: devaddr_constraint_update_v1, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): devaddr_constraint_update_v1;
    static deserializeBinaryFromReader(message: devaddr_constraint_update_v1, reader: jspb.BinaryReader): devaddr_constraint_update_v1;
  }

  export namespace devaddr_constraint_update_v1 {
    export type AsObject = {
      constraint?: devaddr_constraint_v1.AsObject,
      action: action_v1Map[keyof action_v1Map],
    }
  }

  export class update_v1 extends jspb.Message {
    hasOwner(): boolean;
    clearOwner(): void;
    getOwner(): Uint8Array | string;
    getOwner_asU8(): Uint8Array;
    getOwner_asB64(): string;
    setOwner(value: Uint8Array | string): void;

    hasPayer(): boolean;
    clearPayer(): void;
    getPayer(): Uint8Array | string;
    getPayer_asU8(): Uint8Array;
    getPayer_asB64(): string;
    setPayer(value: Uint8Array | string): void;

    hasDelegateKey(): boolean;
    clearDelegateKey(): void;
    getDelegateKey(): org_update_req_v1.delegate_key_update_v1 | undefined;
    setDelegateKey(value?: org_update_req_v1.delegate_key_update_v1): void;

    hasDevaddrs(): boolean;
    clearDevaddrs(): void;
    getDevaddrs(): number;
    setDevaddrs(value: number): void;

    hasConstraint(): boolean;
    clearConstraint(): void;
    getConstraint(): org_update_req_v1.devaddr_constraint_update_v1 | undefined;
    setConstraint(value?: org_update_req_v1.devaddr_constraint_update_v1): void;

    getUpdateCase(): update_v1.UpdateCase;
    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): update_v1.AsObject;
    static toObject(includeInstance: boolean, msg: update_v1): update_v1.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: update_v1, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): update_v1;
    static deserializeBinaryFromReader(message: update_v1, reader: jspb.BinaryReader): update_v1;
  }

  export namespace update_v1 {
    export type AsObject = {
      owner: Uint8Array | string,
      payer: Uint8Array | string,
      delegateKey?: org_update_req_v1.delegate_key_update_v1.AsObject,
      devaddrs: number,
      constraint?: org_update_req_v1.devaddr_constraint_update_v1.AsObject,
    }

    export enum UpdateCase {
      UPDATE_NOT_SET = 0,
      OWNER = 1,
      PAYER = 2,
      DELEGATE_KEY = 3,
      DEVADDRS = 4,
      CONSTRAINT = 5,
    }
  }
}

export class org_res_v1 extends jspb.Message {
  hasOrg(): boolean;
  clearOrg(): void;
  getOrg(): org_v1 | undefined;
  setOrg(value?: org_v1): void;

  getNetId(): number;
  setNetId(value: number): void;

  clearDevaddrConstraintsList(): void;
  getDevaddrConstraintsList(): Array<devaddr_constraint_v1>;
  setDevaddrConstraintsList(value: Array<devaddr_constraint_v1>): void;
  addDevaddrConstraints(value?: devaddr_constraint_v1, index?: number): devaddr_constraint_v1;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): org_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: org_res_v1): org_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: org_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): org_res_v1;
  static deserializeBinaryFromReader(message: org_res_v1, reader: jspb.BinaryReader): org_res_v1;
}

export namespace org_res_v1 {
  export type AsObject = {
    org?: org_v1.AsObject,
    netId: number,
    devaddrConstraintsList: Array<devaddr_constraint_v1.AsObject>,
    timestamp: number,
    signer: Uint8Array | string,
    signature: Uint8Array | string,
  }
}

export class org_disable_req_v1 extends jspb.Message {
  getOui(): number;
  setOui(value: number): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): org_disable_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: org_disable_req_v1): org_disable_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: org_disable_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): org_disable_req_v1;
  static deserializeBinaryFromReader(message: org_disable_req_v1, reader: jspb.BinaryReader): org_disable_req_v1;
}

export namespace org_disable_req_v1 {
  export type AsObject = {
    oui: number,
    timestamp: number,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class org_disable_res_v1 extends jspb.Message {
  getOui(): number;
  setOui(value: number): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): org_disable_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: org_disable_res_v1): org_disable_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: org_disable_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): org_disable_res_v1;
  static deserializeBinaryFromReader(message: org_disable_res_v1, reader: jspb.BinaryReader): org_disable_res_v1;
}

export namespace org_disable_res_v1 {
  export type AsObject = {
    oui: number,
    timestamp: number,
    signer: Uint8Array | string,
    signature: Uint8Array | string,
  }
}

export class org_enable_req_v1 extends jspb.Message {
  getOui(): number;
  setOui(value: number): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): org_enable_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: org_enable_req_v1): org_enable_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: org_enable_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): org_enable_req_v1;
  static deserializeBinaryFromReader(message: org_enable_req_v1, reader: jspb.BinaryReader): org_enable_req_v1;
}

export namespace org_enable_req_v1 {
  export type AsObject = {
    oui: number,
    timestamp: number,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class org_enable_res_v1 extends jspb.Message {
  getOui(): number;
  setOui(value: number): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): org_enable_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: org_enable_res_v1): org_enable_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: org_enable_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): org_enable_res_v1;
  static deserializeBinaryFromReader(message: org_enable_res_v1, reader: jspb.BinaryReader): org_enable_res_v1;
}

export namespace org_enable_res_v1 {
  export type AsObject = {
    oui: number,
    timestamp: number,
    signer: Uint8Array | string,
    signature: Uint8Array | string,
  }
}

export class route_list_req_v1 extends jspb.Message {
  getOui(): number;
  setOui(value: number): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_list_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_list_req_v1): route_list_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_list_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_list_req_v1;
  static deserializeBinaryFromReader(message: route_list_req_v1, reader: jspb.BinaryReader): route_list_req_v1;
}

export namespace route_list_req_v1 {
  export type AsObject = {
    oui: number,
    timestamp: number,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class route_list_res_v1 extends jspb.Message {
  clearRoutesList(): void;
  getRoutesList(): Array<route_v1>;
  setRoutesList(value: Array<route_v1>): void;
  addRoutes(value?: route_v1, index?: number): route_v1;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_list_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_list_res_v1): route_list_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_list_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_list_res_v1;
  static deserializeBinaryFromReader(message: route_list_res_v1, reader: jspb.BinaryReader): route_list_res_v1;
}

export namespace route_list_res_v1 {
  export type AsObject = {
    routesList: Array<route_v1.AsObject>,
    timestamp: number,
    signer: Uint8Array | string,
    signature: Uint8Array | string,
  }
}

export class route_get_req_v1 extends jspb.Message {
  getId(): string;
  setId(value: string): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_get_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_get_req_v1): route_get_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_get_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_get_req_v1;
  static deserializeBinaryFromReader(message: route_get_req_v1, reader: jspb.BinaryReader): route_get_req_v1;
}

export namespace route_get_req_v1 {
  export type AsObject = {
    id: string,
    timestamp: number,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class route_create_req_v1 extends jspb.Message {
  getOui(): number;
  setOui(value: number): void;

  hasRoute(): boolean;
  clearRoute(): void;
  getRoute(): route_v1 | undefined;
  setRoute(value?: route_v1): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_create_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_create_req_v1): route_create_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_create_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_create_req_v1;
  static deserializeBinaryFromReader(message: route_create_req_v1, reader: jspb.BinaryReader): route_create_req_v1;
}

export namespace route_create_req_v1 {
  export type AsObject = {
    oui: number,
    route?: route_v1.AsObject,
    timestamp: number,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class route_update_req_v1 extends jspb.Message {
  hasRoute(): boolean;
  clearRoute(): void;
  getRoute(): route_v1 | undefined;
  setRoute(value?: route_v1): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_update_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_update_req_v1): route_update_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_update_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_update_req_v1;
  static deserializeBinaryFromReader(message: route_update_req_v1, reader: jspb.BinaryReader): route_update_req_v1;
}

export namespace route_update_req_v1 {
  export type AsObject = {
    route?: route_v1.AsObject,
    timestamp: number,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class route_delete_req_v1 extends jspb.Message {
  getId(): string;
  setId(value: string): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_delete_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_delete_req_v1): route_delete_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_delete_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_delete_req_v1;
  static deserializeBinaryFromReader(message: route_delete_req_v1, reader: jspb.BinaryReader): route_delete_req_v1;
}

export namespace route_delete_req_v1 {
  export type AsObject = {
    id: string,
    timestamp: number,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class route_res_v1 extends jspb.Message {
  hasRoute(): boolean;
  clearRoute(): void;
  getRoute(): route_v1 | undefined;
  setRoute(value?: route_v1): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_res_v1): route_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_res_v1;
  static deserializeBinaryFromReader(message: route_res_v1, reader: jspb.BinaryReader): route_res_v1;
}

export namespace route_res_v1 {
  export type AsObject = {
    route?: route_v1.AsObject,
    timestamp: number,
    signer: Uint8Array | string,
    signature: Uint8Array | string,
  }
}

export class route_get_euis_req_v1 extends jspb.Message {
  getRouteId(): string;
  setRouteId(value: string): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_get_euis_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_get_euis_req_v1): route_get_euis_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_get_euis_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_get_euis_req_v1;
  static deserializeBinaryFromReader(message: route_get_euis_req_v1, reader: jspb.BinaryReader): route_get_euis_req_v1;
}

export namespace route_get_euis_req_v1 {
  export type AsObject = {
    routeId: string,
    timestamp: number,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class route_update_euis_req_v1 extends jspb.Message {
  getAction(): action_v1Map[keyof action_v1Map];
  setAction(value: action_v1Map[keyof action_v1Map]): void;

  hasEuiPair(): boolean;
  clearEuiPair(): void;
  getEuiPair(): eui_pair_v1 | undefined;
  setEuiPair(value?: eui_pair_v1): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_update_euis_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_update_euis_req_v1): route_update_euis_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_update_euis_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_update_euis_req_v1;
  static deserializeBinaryFromReader(message: route_update_euis_req_v1, reader: jspb.BinaryReader): route_update_euis_req_v1;
}

export namespace route_update_euis_req_v1 {
  export type AsObject = {
    action: action_v1Map[keyof action_v1Map],
    euiPair?: eui_pair_v1.AsObject,
    timestamp: number,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class route_euis_res_v1 extends jspb.Message {
  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_euis_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_euis_res_v1): route_euis_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_euis_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_euis_res_v1;
  static deserializeBinaryFromReader(message: route_euis_res_v1, reader: jspb.BinaryReader): route_euis_res_v1;
}

export namespace route_euis_res_v1 {
  export type AsObject = {
    timestamp: number,
    signer: Uint8Array | string,
    signature: Uint8Array | string,
  }
}

export class route_get_devaddr_ranges_req_v1 extends jspb.Message {
  getRouteId(): string;
  setRouteId(value: string): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_get_devaddr_ranges_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_get_devaddr_ranges_req_v1): route_get_devaddr_ranges_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_get_devaddr_ranges_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_get_devaddr_ranges_req_v1;
  static deserializeBinaryFromReader(message: route_get_devaddr_ranges_req_v1, reader: jspb.BinaryReader): route_get_devaddr_ranges_req_v1;
}

export namespace route_get_devaddr_ranges_req_v1 {
  export type AsObject = {
    routeId: string,
    timestamp: number,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class route_update_devaddr_ranges_req_v1 extends jspb.Message {
  getAction(): action_v1Map[keyof action_v1Map];
  setAction(value: action_v1Map[keyof action_v1Map]): void;

  hasDevaddrRange(): boolean;
  clearDevaddrRange(): void;
  getDevaddrRange(): devaddr_range_v1 | undefined;
  setDevaddrRange(value?: devaddr_range_v1): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_update_devaddr_ranges_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_update_devaddr_ranges_req_v1): route_update_devaddr_ranges_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_update_devaddr_ranges_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_update_devaddr_ranges_req_v1;
  static deserializeBinaryFromReader(message: route_update_devaddr_ranges_req_v1, reader: jspb.BinaryReader): route_update_devaddr_ranges_req_v1;
}

export namespace route_update_devaddr_ranges_req_v1 {
  export type AsObject = {
    action: action_v1Map[keyof action_v1Map],
    devaddrRange?: devaddr_range_v1.AsObject,
    timestamp: number,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class route_devaddr_ranges_res_v1 extends jspb.Message {
  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_devaddr_ranges_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_devaddr_ranges_res_v1): route_devaddr_ranges_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_devaddr_ranges_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_devaddr_ranges_res_v1;
  static deserializeBinaryFromReader(message: route_devaddr_ranges_res_v1, reader: jspb.BinaryReader): route_devaddr_ranges_res_v1;
}

export namespace route_devaddr_ranges_res_v1 {
  export type AsObject = {
    timestamp: number,
    signer: Uint8Array | string,
    signature: Uint8Array | string,
  }
}

export class route_stream_req_v1 extends jspb.Message {
  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getSince(): number;
  setSince(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_stream_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_stream_req_v1): route_stream_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_stream_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_stream_req_v1;
  static deserializeBinaryFromReader(message: route_stream_req_v1, reader: jspb.BinaryReader): route_stream_req_v1;
}

export namespace route_stream_req_v1 {
  export type AsObject = {
    timestamp: number,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
    since: number,
  }
}

export class route_stream_res_v1 extends jspb.Message {
  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getAction(): action_v1Map[keyof action_v1Map];
  setAction(value: action_v1Map[keyof action_v1Map]): void;

  hasRoute(): boolean;
  clearRoute(): void;
  getRoute(): route_v1 | undefined;
  setRoute(value?: route_v1): void;

  hasEuiPair(): boolean;
  clearEuiPair(): void;
  getEuiPair(): eui_pair_v1 | undefined;
  setEuiPair(value?: eui_pair_v1): void;

  hasDevaddrRange(): boolean;
  clearDevaddrRange(): void;
  getDevaddrRange(): devaddr_range_v1 | undefined;
  setDevaddrRange(value?: devaddr_range_v1): void;

  hasSkf(): boolean;
  clearSkf(): void;
  getSkf(): skf_v1 | undefined;
  setSkf(value?: skf_v1): void;

  getDataCase(): route_stream_res_v1.DataCase;
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_stream_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_stream_res_v1): route_stream_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_stream_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_stream_res_v1;
  static deserializeBinaryFromReader(message: route_stream_res_v1, reader: jspb.BinaryReader): route_stream_res_v1;
}

export namespace route_stream_res_v1 {
  export type AsObject = {
    timestamp: number,
    signer: Uint8Array | string,
    signature: Uint8Array | string,
    action: action_v1Map[keyof action_v1Map],
    route?: route_v1.AsObject,
    euiPair?: eui_pair_v1.AsObject,
    devaddrRange?: devaddr_range_v1.AsObject,
    skf?: skf_v1.AsObject,
  }

  export enum DataCase {
    DATA_NOT_SET = 0,
    ROUTE = 5,
    EUI_PAIR = 6,
    DEVADDR_RANGE = 7,
    SKF = 8,
  }
}

export class skf_v1 extends jspb.Message {
  getRouteId(): string;
  setRouteId(value: string): void;

  getDevaddr(): number;
  setDevaddr(value: number): void;

  getSessionKey(): string;
  setSessionKey(value: string): void;

  getMaxCopies(): number;
  setMaxCopies(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): skf_v1.AsObject;
  static toObject(includeInstance: boolean, msg: skf_v1): skf_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: skf_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): skf_v1;
  static deserializeBinaryFromReader(message: skf_v1, reader: jspb.BinaryReader): skf_v1;
}

export namespace skf_v1 {
  export type AsObject = {
    routeId: string,
    devaddr: number,
    sessionKey: string,
    maxCopies: number,
  }
}

export class route_skf_list_req_v1 extends jspb.Message {
  getRouteId(): string;
  setRouteId(value: string): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_skf_list_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_skf_list_req_v1): route_skf_list_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_skf_list_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_skf_list_req_v1;
  static deserializeBinaryFromReader(message: route_skf_list_req_v1, reader: jspb.BinaryReader): route_skf_list_req_v1;
}

export namespace route_skf_list_req_v1 {
  export type AsObject = {
    routeId: string,
    timestamp: number,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class route_skf_get_req_v1 extends jspb.Message {
  getRouteId(): string;
  setRouteId(value: string): void;

  getDevaddr(): number;
  setDevaddr(value: number): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_skf_get_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_skf_get_req_v1): route_skf_get_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_skf_get_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_skf_get_req_v1;
  static deserializeBinaryFromReader(message: route_skf_get_req_v1, reader: jspb.BinaryReader): route_skf_get_req_v1;
}

export namespace route_skf_get_req_v1 {
  export type AsObject = {
    routeId: string,
    devaddr: number,
    timestamp: number,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class route_skf_update_req_v1 extends jspb.Message {
  getRouteId(): string;
  setRouteId(value: string): void;

  clearUpdatesList(): void;
  getUpdatesList(): Array<route_skf_update_req_v1.route_skf_update_v1>;
  setUpdatesList(value: Array<route_skf_update_req_v1.route_skf_update_v1>): void;
  addUpdates(value?: route_skf_update_req_v1.route_skf_update_v1, index?: number): route_skf_update_req_v1.route_skf_update_v1;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_skf_update_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_skf_update_req_v1): route_skf_update_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_skf_update_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_skf_update_req_v1;
  static deserializeBinaryFromReader(message: route_skf_update_req_v1, reader: jspb.BinaryReader): route_skf_update_req_v1;
}

export namespace route_skf_update_req_v1 {
  export type AsObject = {
    routeId: string,
    updatesList: Array<route_skf_update_req_v1.route_skf_update_v1.AsObject>,
    timestamp: number,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }

  export class route_skf_update_v1 extends jspb.Message {
    getDevaddr(): number;
    setDevaddr(value: number): void;

    getSessionKey(): string;
    setSessionKey(value: string): void;

    getAction(): action_v1Map[keyof action_v1Map];
    setAction(value: action_v1Map[keyof action_v1Map]): void;

    getMaxCopies(): number;
    setMaxCopies(value: number): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): route_skf_update_v1.AsObject;
    static toObject(includeInstance: boolean, msg: route_skf_update_v1): route_skf_update_v1.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: route_skf_update_v1, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): route_skf_update_v1;
    static deserializeBinaryFromReader(message: route_skf_update_v1, reader: jspb.BinaryReader): route_skf_update_v1;
  }

  export namespace route_skf_update_v1 {
    export type AsObject = {
      devaddr: number,
      sessionKey: string,
      action: action_v1Map[keyof action_v1Map],
      maxCopies: number,
    }
  }
}

export class route_skf_update_res_v1 extends jspb.Message {
  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): route_skf_update_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: route_skf_update_res_v1): route_skf_update_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: route_skf_update_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): route_skf_update_res_v1;
  static deserializeBinaryFromReader(message: route_skf_update_res_v1, reader: jspb.BinaryReader): route_skf_update_res_v1;
}

export namespace route_skf_update_res_v1 {
  export type AsObject = {
    timestamp: number,
    signer: Uint8Array | string,
    signature: Uint8Array | string,
  }
}

export class gateway_region_params_req_v1 extends jspb.Message {
  getRegion(): region_pb.regionMap[keyof region_pb.regionMap];
  setRegion(value: region_pb.regionMap[keyof region_pb.regionMap]): void;

  getAddress(): Uint8Array | string;
  getAddress_asU8(): Uint8Array;
  getAddress_asB64(): string;
  setAddress(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): gateway_region_params_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: gateway_region_params_req_v1): gateway_region_params_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: gateway_region_params_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): gateway_region_params_req_v1;
  static deserializeBinaryFromReader(message: gateway_region_params_req_v1, reader: jspb.BinaryReader): gateway_region_params_req_v1;
}

export namespace gateway_region_params_req_v1 {
  export type AsObject = {
    region: region_pb.regionMap[keyof region_pb.regionMap],
    address: Uint8Array | string,
    signature: Uint8Array | string,
  }
}

export class gateway_region_params_res_v1 extends jspb.Message {
  getRegion(): region_pb.regionMap[keyof region_pb.regionMap];
  setRegion(value: region_pb.regionMap[keyof region_pb.regionMap]): void;

  hasParams(): boolean;
  clearParams(): void;
  getParams(): blockchain_region_param_v1_pb.blockchain_region_params_v1 | undefined;
  setParams(value?: blockchain_region_param_v1_pb.blockchain_region_params_v1): void;

  getGain(): number;
  setGain(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): gateway_region_params_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: gateway_region_params_res_v1): gateway_region_params_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: gateway_region_params_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): gateway_region_params_res_v1;
  static deserializeBinaryFromReader(message: gateway_region_params_res_v1, reader: jspb.BinaryReader): gateway_region_params_res_v1;
}

export namespace gateway_region_params_res_v1 {
  export type AsObject = {
    region: region_pb.regionMap[keyof region_pb.regionMap],
    params?: blockchain_region_param_v1_pb.blockchain_region_params_v1.AsObject,
    gain: number,
    signature: Uint8Array | string,
    timestamp: number,
    signer: Uint8Array | string,
  }
}

export class gateway_location_req_v1 extends jspb.Message {
  getGateway(): Uint8Array | string;
  getGateway_asU8(): Uint8Array;
  getGateway_asB64(): string;
  setGateway(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): gateway_location_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: gateway_location_req_v1): gateway_location_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: gateway_location_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): gateway_location_req_v1;
  static deserializeBinaryFromReader(message: gateway_location_req_v1, reader: jspb.BinaryReader): gateway_location_req_v1;
}

export namespace gateway_location_req_v1 {
  export type AsObject = {
    gateway: Uint8Array | string,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class gateway_location_res_v1 extends jspb.Message {
  getLocation(): string;
  setLocation(value: string): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): gateway_location_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: gateway_location_res_v1): gateway_location_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: gateway_location_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): gateway_location_res_v1;
  static deserializeBinaryFromReader(message: gateway_location_res_v1, reader: jspb.BinaryReader): gateway_location_res_v1;
}

export namespace gateway_location_res_v1 {
  export type AsObject = {
    location: string,
    timestamp: number,
    signer: Uint8Array | string,
    signature: Uint8Array | string,
  }
}

export class admin_load_region_req_v1 extends jspb.Message {
  getRegion(): region_pb.regionMap[keyof region_pb.regionMap];
  setRegion(value: region_pb.regionMap[keyof region_pb.regionMap]): void;

  hasParams(): boolean;
  clearParams(): void;
  getParams(): blockchain_region_param_v1_pb.blockchain_region_params_v1 | undefined;
  setParams(value?: blockchain_region_param_v1_pb.blockchain_region_params_v1): void;

  getHexIndexes(): Uint8Array | string;
  getHexIndexes_asU8(): Uint8Array;
  getHexIndexes_asB64(): string;
  setHexIndexes(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): admin_load_region_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: admin_load_region_req_v1): admin_load_region_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: admin_load_region_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): admin_load_region_req_v1;
  static deserializeBinaryFromReader(message: admin_load_region_req_v1, reader: jspb.BinaryReader): admin_load_region_req_v1;
}

export namespace admin_load_region_req_v1 {
  export type AsObject = {
    region: region_pb.regionMap[keyof region_pb.regionMap],
    params?: blockchain_region_param_v1_pb.blockchain_region_params_v1.AsObject,
    hexIndexes: Uint8Array | string,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class admin_load_region_res_v1 extends jspb.Message {
  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): admin_load_region_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: admin_load_region_res_v1): admin_load_region_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: admin_load_region_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): admin_load_region_res_v1;
  static deserializeBinaryFromReader(message: admin_load_region_res_v1, reader: jspb.BinaryReader): admin_load_region_res_v1;
}

export namespace admin_load_region_res_v1 {
  export type AsObject = {
    timestamp: number,
    signer: Uint8Array | string,
    signature: Uint8Array | string,
  }
}

export class admin_add_key_req_v1 extends jspb.Message {
  getPubkey(): Uint8Array | string;
  getPubkey_asU8(): Uint8Array;
  getPubkey_asB64(): string;
  setPubkey(value: Uint8Array | string): void;

  getKeyType(): admin_add_key_req_v1.key_type_v1Map[keyof admin_add_key_req_v1.key_type_v1Map];
  setKeyType(value: admin_add_key_req_v1.key_type_v1Map[keyof admin_add_key_req_v1.key_type_v1Map]): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): admin_add_key_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: admin_add_key_req_v1): admin_add_key_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: admin_add_key_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): admin_add_key_req_v1;
  static deserializeBinaryFromReader(message: admin_add_key_req_v1, reader: jspb.BinaryReader): admin_add_key_req_v1;
}

export namespace admin_add_key_req_v1 {
  export type AsObject = {
    pubkey: Uint8Array | string,
    keyType: admin_add_key_req_v1.key_type_v1Map[keyof admin_add_key_req_v1.key_type_v1Map],
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }

  export interface key_type_v1Map {
    ADMINISTRATOR: 0;
    PACKET_ROUTER: 1;
    ORACLE: 2;
  }

  export const key_type_v1: key_type_v1Map;
}

export class admin_remove_key_req_v1 extends jspb.Message {
  getPubkey(): Uint8Array | string;
  getPubkey_asU8(): Uint8Array;
  getPubkey_asB64(): string;
  setPubkey(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): admin_remove_key_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: admin_remove_key_req_v1): admin_remove_key_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: admin_remove_key_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): admin_remove_key_req_v1;
  static deserializeBinaryFromReader(message: admin_remove_key_req_v1, reader: jspb.BinaryReader): admin_remove_key_req_v1;
}

export namespace admin_remove_key_req_v1 {
  export type AsObject = {
    pubkey: Uint8Array | string,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class admin_key_res_v1 extends jspb.Message {
  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): admin_key_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: admin_key_res_v1): admin_key_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: admin_key_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): admin_key_res_v1;
  static deserializeBinaryFromReader(message: admin_key_res_v1, reader: jspb.BinaryReader): admin_key_res_v1;
}

export namespace admin_key_res_v1 {
  export type AsObject = {
    timestamp: number,
    signer: Uint8Array | string,
    signature: Uint8Array | string,
  }
}

export class gateway_metadata extends jspb.Message {
  getLocation(): string;
  setLocation(value: string): void;

  getRegion(): region_pb.regionMap[keyof region_pb.regionMap];
  setRegion(value: region_pb.regionMap[keyof region_pb.regionMap]): void;

  getGain(): number;
  setGain(value: number): void;

  getElevation(): number;
  setElevation(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): gateway_metadata.AsObject;
  static toObject(includeInstance: boolean, msg: gateway_metadata): gateway_metadata.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: gateway_metadata, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): gateway_metadata;
  static deserializeBinaryFromReader(message: gateway_metadata, reader: jspb.BinaryReader): gateway_metadata;
}

export namespace gateway_metadata {
  export type AsObject = {
    location: string,
    region: region_pb.regionMap[keyof region_pb.regionMap],
    gain: number,
    elevation: number,
  }
}

export class gateway_info extends jspb.Message {
  getAddress(): Uint8Array | string;
  getAddress_asU8(): Uint8Array;
  getAddress_asB64(): string;
  setAddress(value: Uint8Array | string): void;

  getIsFullHotspot(): boolean;
  setIsFullHotspot(value: boolean): void;

  hasMetadata(): boolean;
  clearMetadata(): void;
  getMetadata(): gateway_metadata | undefined;
  setMetadata(value?: gateway_metadata): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): gateway_info.AsObject;
  static toObject(includeInstance: boolean, msg: gateway_info): gateway_info.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: gateway_info, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): gateway_info;
  static deserializeBinaryFromReader(message: gateway_info, reader: jspb.BinaryReader): gateway_info;
}

export namespace gateway_info {
  export type AsObject = {
    address: Uint8Array | string,
    isFullHotspot: boolean,
    metadata?: gateway_metadata.AsObject,
  }
}

export class gateway_info_req_v1 extends jspb.Message {
  getAddress(): Uint8Array | string;
  getAddress_asU8(): Uint8Array;
  getAddress_asB64(): string;
  setAddress(value: Uint8Array | string): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): gateway_info_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: gateway_info_req_v1): gateway_info_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: gateway_info_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): gateway_info_req_v1;
  static deserializeBinaryFromReader(message: gateway_info_req_v1, reader: jspb.BinaryReader): gateway_info_req_v1;
}

export namespace gateway_info_req_v1 {
  export type AsObject = {
    address: Uint8Array | string,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class gateway_info_res_v1 extends jspb.Message {
  getTimestamp(): number;
  setTimestamp(value: number): void;

  hasInfo(): boolean;
  clearInfo(): void;
  getInfo(): gateway_info | undefined;
  setInfo(value?: gateway_info): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): gateway_info_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: gateway_info_res_v1): gateway_info_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: gateway_info_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): gateway_info_res_v1;
  static deserializeBinaryFromReader(message: gateway_info_res_v1, reader: jspb.BinaryReader): gateway_info_res_v1;
}

export namespace gateway_info_res_v1 {
  export type AsObject = {
    timestamp: number,
    info?: gateway_info.AsObject,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class gateway_info_stream_req_v1 extends jspb.Message {
  getBatchSize(): number;
  setBatchSize(value: number): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): gateway_info_stream_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: gateway_info_stream_req_v1): gateway_info_stream_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: gateway_info_stream_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): gateway_info_stream_req_v1;
  static deserializeBinaryFromReader(message: gateway_info_stream_req_v1, reader: jspb.BinaryReader): gateway_info_stream_req_v1;
}

export namespace gateway_info_stream_req_v1 {
  export type AsObject = {
    batchSize: number,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class gateway_info_stream_res_v1 extends jspb.Message {
  getTimestamp(): number;
  setTimestamp(value: number): void;

  clearGatewaysList(): void;
  getGatewaysList(): Array<gateway_info>;
  setGatewaysList(value: Array<gateway_info>): void;
  addGateways(value?: gateway_info, index?: number): gateway_info;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): gateway_info_stream_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: gateway_info_stream_res_v1): gateway_info_stream_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: gateway_info_stream_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): gateway_info_stream_res_v1;
  static deserializeBinaryFromReader(message: gateway_info_stream_res_v1, reader: jspb.BinaryReader): gateway_info_stream_res_v1;
}

export namespace gateway_info_stream_res_v1 {
  export type AsObject = {
    timestamp: number,
    gatewaysList: Array<gateway_info.AsObject>,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class region_params_req_v1 extends jspb.Message {
  getRegion(): region_pb.regionMap[keyof region_pb.regionMap];
  setRegion(value: region_pb.regionMap[keyof region_pb.regionMap]): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): region_params_req_v1.AsObject;
  static toObject(includeInstance: boolean, msg: region_params_req_v1): region_params_req_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: region_params_req_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): region_params_req_v1;
  static deserializeBinaryFromReader(message: region_params_req_v1, reader: jspb.BinaryReader): region_params_req_v1;
}

export namespace region_params_req_v1 {
  export type AsObject = {
    region: region_pb.regionMap[keyof region_pb.regionMap],
    signature: Uint8Array | string,
    signer: Uint8Array | string,
  }
}

export class region_params_res_v1 extends jspb.Message {
  getRegion(): region_pb.regionMap[keyof region_pb.regionMap];
  setRegion(value: region_pb.regionMap[keyof region_pb.regionMap]): void;

  hasParams(): boolean;
  clearParams(): void;
  getParams(): blockchain_region_param_v1_pb.blockchain_region_params_v1 | undefined;
  setParams(value?: blockchain_region_param_v1_pb.blockchain_region_params_v1): void;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): void;

  getSigner(): Uint8Array | string;
  getSigner_asU8(): Uint8Array;
  getSigner_asB64(): string;
  setSigner(value: Uint8Array | string): void;

  getTimestamp(): number;
  setTimestamp(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): region_params_res_v1.AsObject;
  static toObject(includeInstance: boolean, msg: region_params_res_v1): region_params_res_v1.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: region_params_res_v1, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): region_params_res_v1;
  static deserializeBinaryFromReader(message: region_params_res_v1, reader: jspb.BinaryReader): region_params_res_v1;
}

export namespace region_params_res_v1 {
  export type AsObject = {
    region: region_pb.regionMap[keyof region_pb.regionMap],
    params?: blockchain_region_param_v1_pb.blockchain_region_params_v1.AsObject,
    signature: Uint8Array | string,
    signer: Uint8Array | string,
    timestamp: number,
  }
}

export interface action_v1Map {
  ADD: 0;
  REMOVE: 1;
}

export const action_v1: action_v1Map;

