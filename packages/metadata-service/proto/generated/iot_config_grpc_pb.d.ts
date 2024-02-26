// GENERATED CODE -- DO NOT EDIT!

// package: helium.iot_config
// file: iot_config.proto

import * as iot_config_pb from "./iot_config_pb";
import * as grpc from "@grpc/grpc-js";

interface IorgService extends grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
  list: grpc.MethodDefinition<iot_config_pb.org_list_req_v1, iot_config_pb.org_list_res_v1>;
  get: grpc.MethodDefinition<iot_config_pb.org_get_req_v1, iot_config_pb.org_res_v1>;
  create_helium: grpc.MethodDefinition<iot_config_pb.org_create_helium_req_v1, iot_config_pb.org_res_v1>;
  create_roamer: grpc.MethodDefinition<iot_config_pb.org_create_roamer_req_v1, iot_config_pb.org_res_v1>;
  update: grpc.MethodDefinition<iot_config_pb.org_update_req_v1, iot_config_pb.org_res_v1>;
  disable: grpc.MethodDefinition<iot_config_pb.org_disable_req_v1, iot_config_pb.org_disable_res_v1>;
  enable: grpc.MethodDefinition<iot_config_pb.org_enable_req_v1, iot_config_pb.org_enable_res_v1>;
}

export const orgService: IorgService;

export interface IorgServer extends grpc.UntypedServiceImplementation {
  list: grpc.handleUnaryCall<iot_config_pb.org_list_req_v1, iot_config_pb.org_list_res_v1>;
  get: grpc.handleUnaryCall<iot_config_pb.org_get_req_v1, iot_config_pb.org_res_v1>;
  create_helium: grpc.handleUnaryCall<iot_config_pb.org_create_helium_req_v1, iot_config_pb.org_res_v1>;
  create_roamer: grpc.handleUnaryCall<iot_config_pb.org_create_roamer_req_v1, iot_config_pb.org_res_v1>;
  update: grpc.handleUnaryCall<iot_config_pb.org_update_req_v1, iot_config_pb.org_res_v1>;
  disable: grpc.handleUnaryCall<iot_config_pb.org_disable_req_v1, iot_config_pb.org_disable_res_v1>;
  enable: grpc.handleUnaryCall<iot_config_pb.org_enable_req_v1, iot_config_pb.org_enable_res_v1>;
}

export class orgClient extends grpc.Client {
  constructor(address: string, credentials: grpc.ChannelCredentials, options?: object);
  list(argument: iot_config_pb.org_list_req_v1, callback: grpc.requestCallback<iot_config_pb.org_list_res_v1>): grpc.ClientUnaryCall;
  list(argument: iot_config_pb.org_list_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.org_list_res_v1>): grpc.ClientUnaryCall;
  list(argument: iot_config_pb.org_list_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.org_list_res_v1>): grpc.ClientUnaryCall;
  get(argument: iot_config_pb.org_get_req_v1, callback: grpc.requestCallback<iot_config_pb.org_res_v1>): grpc.ClientUnaryCall;
  get(argument: iot_config_pb.org_get_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.org_res_v1>): grpc.ClientUnaryCall;
  get(argument: iot_config_pb.org_get_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.org_res_v1>): grpc.ClientUnaryCall;
  create_helium(argument: iot_config_pb.org_create_helium_req_v1, callback: grpc.requestCallback<iot_config_pb.org_res_v1>): grpc.ClientUnaryCall;
  create_helium(argument: iot_config_pb.org_create_helium_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.org_res_v1>): grpc.ClientUnaryCall;
  create_helium(argument: iot_config_pb.org_create_helium_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.org_res_v1>): grpc.ClientUnaryCall;
  create_roamer(argument: iot_config_pb.org_create_roamer_req_v1, callback: grpc.requestCallback<iot_config_pb.org_res_v1>): grpc.ClientUnaryCall;
  create_roamer(argument: iot_config_pb.org_create_roamer_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.org_res_v1>): grpc.ClientUnaryCall;
  create_roamer(argument: iot_config_pb.org_create_roamer_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.org_res_v1>): grpc.ClientUnaryCall;
  update(argument: iot_config_pb.org_update_req_v1, callback: grpc.requestCallback<iot_config_pb.org_res_v1>): grpc.ClientUnaryCall;
  update(argument: iot_config_pb.org_update_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.org_res_v1>): grpc.ClientUnaryCall;
  update(argument: iot_config_pb.org_update_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.org_res_v1>): grpc.ClientUnaryCall;
  disable(argument: iot_config_pb.org_disable_req_v1, callback: grpc.requestCallback<iot_config_pb.org_disable_res_v1>): grpc.ClientUnaryCall;
  disable(argument: iot_config_pb.org_disable_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.org_disable_res_v1>): grpc.ClientUnaryCall;
  disable(argument: iot_config_pb.org_disable_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.org_disable_res_v1>): grpc.ClientUnaryCall;
  enable(argument: iot_config_pb.org_enable_req_v1, callback: grpc.requestCallback<iot_config_pb.org_enable_res_v1>): grpc.ClientUnaryCall;
  enable(argument: iot_config_pb.org_enable_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.org_enable_res_v1>): grpc.ClientUnaryCall;
  enable(argument: iot_config_pb.org_enable_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.org_enable_res_v1>): grpc.ClientUnaryCall;
}

interface IrouteService extends grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
  list: grpc.MethodDefinition<iot_config_pb.route_list_req_v1, iot_config_pb.route_list_res_v1>;
  get: grpc.MethodDefinition<iot_config_pb.route_get_req_v1, iot_config_pb.route_res_v1>;
  create: grpc.MethodDefinition<iot_config_pb.route_create_req_v1, iot_config_pb.route_res_v1>;
  update: grpc.MethodDefinition<iot_config_pb.route_update_req_v1, iot_config_pb.route_res_v1>;
  delete: grpc.MethodDefinition<iot_config_pb.route_delete_req_v1, iot_config_pb.route_res_v1>;
  stream: grpc.MethodDefinition<iot_config_pb.route_stream_req_v1, iot_config_pb.route_stream_res_v1>;
  get_euis: grpc.MethodDefinition<iot_config_pb.route_get_euis_req_v1, iot_config_pb.eui_pair_v1>;
  update_euis: grpc.MethodDefinition<iot_config_pb.route_update_euis_req_v1, iot_config_pb.route_euis_res_v1>;
  get_devaddr_ranges: grpc.MethodDefinition<iot_config_pb.route_get_devaddr_ranges_req_v1, iot_config_pb.devaddr_range_v1>;
  update_devaddr_ranges: grpc.MethodDefinition<iot_config_pb.route_update_devaddr_ranges_req_v1, iot_config_pb.route_devaddr_ranges_res_v1>;
  list_skfs: grpc.MethodDefinition<iot_config_pb.route_skf_list_req_v1, iot_config_pb.skf_v1>;
  get_skfs: grpc.MethodDefinition<iot_config_pb.route_skf_get_req_v1, iot_config_pb.skf_v1>;
  update_skfs: grpc.MethodDefinition<iot_config_pb.route_skf_update_req_v1, iot_config_pb.route_skf_update_res_v1>;
}

export const routeService: IrouteService;

export interface IrouteServer extends grpc.UntypedServiceImplementation {
  list: grpc.handleUnaryCall<iot_config_pb.route_list_req_v1, iot_config_pb.route_list_res_v1>;
  get: grpc.handleUnaryCall<iot_config_pb.route_get_req_v1, iot_config_pb.route_res_v1>;
  create: grpc.handleUnaryCall<iot_config_pb.route_create_req_v1, iot_config_pb.route_res_v1>;
  update: grpc.handleUnaryCall<iot_config_pb.route_update_req_v1, iot_config_pb.route_res_v1>;
  delete: grpc.handleUnaryCall<iot_config_pb.route_delete_req_v1, iot_config_pb.route_res_v1>;
  stream: grpc.handleServerStreamingCall<iot_config_pb.route_stream_req_v1, iot_config_pb.route_stream_res_v1>;
  get_euis: grpc.handleServerStreamingCall<iot_config_pb.route_get_euis_req_v1, iot_config_pb.eui_pair_v1>;
  update_euis: grpc.handleClientStreamingCall<iot_config_pb.route_update_euis_req_v1, iot_config_pb.route_euis_res_v1>;
  get_devaddr_ranges: grpc.handleServerStreamingCall<iot_config_pb.route_get_devaddr_ranges_req_v1, iot_config_pb.devaddr_range_v1>;
  update_devaddr_ranges: grpc.handleClientStreamingCall<iot_config_pb.route_update_devaddr_ranges_req_v1, iot_config_pb.route_devaddr_ranges_res_v1>;
  list_skfs: grpc.handleServerStreamingCall<iot_config_pb.route_skf_list_req_v1, iot_config_pb.skf_v1>;
  get_skfs: grpc.handleServerStreamingCall<iot_config_pb.route_skf_get_req_v1, iot_config_pb.skf_v1>;
  update_skfs: grpc.handleUnaryCall<iot_config_pb.route_skf_update_req_v1, iot_config_pb.route_skf_update_res_v1>;
}

export class routeClient extends grpc.Client {
  constructor(address: string, credentials: grpc.ChannelCredentials, options?: object);
  list(argument: iot_config_pb.route_list_req_v1, callback: grpc.requestCallback<iot_config_pb.route_list_res_v1>): grpc.ClientUnaryCall;
  list(argument: iot_config_pb.route_list_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.route_list_res_v1>): grpc.ClientUnaryCall;
  list(argument: iot_config_pb.route_list_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.route_list_res_v1>): grpc.ClientUnaryCall;
  get(argument: iot_config_pb.route_get_req_v1, callback: grpc.requestCallback<iot_config_pb.route_res_v1>): grpc.ClientUnaryCall;
  get(argument: iot_config_pb.route_get_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.route_res_v1>): grpc.ClientUnaryCall;
  get(argument: iot_config_pb.route_get_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.route_res_v1>): grpc.ClientUnaryCall;
  create(argument: iot_config_pb.route_create_req_v1, callback: grpc.requestCallback<iot_config_pb.route_res_v1>): grpc.ClientUnaryCall;
  create(argument: iot_config_pb.route_create_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.route_res_v1>): grpc.ClientUnaryCall;
  create(argument: iot_config_pb.route_create_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.route_res_v1>): grpc.ClientUnaryCall;
  update(argument: iot_config_pb.route_update_req_v1, callback: grpc.requestCallback<iot_config_pb.route_res_v1>): grpc.ClientUnaryCall;
  update(argument: iot_config_pb.route_update_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.route_res_v1>): grpc.ClientUnaryCall;
  update(argument: iot_config_pb.route_update_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.route_res_v1>): grpc.ClientUnaryCall;
  delete(argument: iot_config_pb.route_delete_req_v1, callback: grpc.requestCallback<iot_config_pb.route_res_v1>): grpc.ClientUnaryCall;
  delete(argument: iot_config_pb.route_delete_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.route_res_v1>): grpc.ClientUnaryCall;
  delete(argument: iot_config_pb.route_delete_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.route_res_v1>): grpc.ClientUnaryCall;
  stream(argument: iot_config_pb.route_stream_req_v1, metadataOrOptions?: grpc.Metadata | grpc.CallOptions | null): grpc.ClientReadableStream<iot_config_pb.route_stream_res_v1>;
  stream(argument: iot_config_pb.route_stream_req_v1, metadata?: grpc.Metadata | null, options?: grpc.CallOptions | null): grpc.ClientReadableStream<iot_config_pb.route_stream_res_v1>;
  get_euis(argument: iot_config_pb.route_get_euis_req_v1, metadataOrOptions?: grpc.Metadata | grpc.CallOptions | null): grpc.ClientReadableStream<iot_config_pb.eui_pair_v1>;
  get_euis(argument: iot_config_pb.route_get_euis_req_v1, metadata?: grpc.Metadata | null, options?: grpc.CallOptions | null): grpc.ClientReadableStream<iot_config_pb.eui_pair_v1>;
  update_euis(callback: grpc.requestCallback<iot_config_pb.route_euis_res_v1>): grpc.ClientWritableStream<iot_config_pb.route_update_euis_req_v1>;
  update_euis(metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.route_euis_res_v1>): grpc.ClientWritableStream<iot_config_pb.route_update_euis_req_v1>;
  update_euis(metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.route_euis_res_v1>): grpc.ClientWritableStream<iot_config_pb.route_update_euis_req_v1>;
  get_devaddr_ranges(argument: iot_config_pb.route_get_devaddr_ranges_req_v1, metadataOrOptions?: grpc.Metadata | grpc.CallOptions | null): grpc.ClientReadableStream<iot_config_pb.devaddr_range_v1>;
  get_devaddr_ranges(argument: iot_config_pb.route_get_devaddr_ranges_req_v1, metadata?: grpc.Metadata | null, options?: grpc.CallOptions | null): grpc.ClientReadableStream<iot_config_pb.devaddr_range_v1>;
  update_devaddr_ranges(callback: grpc.requestCallback<iot_config_pb.route_devaddr_ranges_res_v1>): grpc.ClientWritableStream<iot_config_pb.route_update_devaddr_ranges_req_v1>;
  update_devaddr_ranges(metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.route_devaddr_ranges_res_v1>): grpc.ClientWritableStream<iot_config_pb.route_update_devaddr_ranges_req_v1>;
  update_devaddr_ranges(metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.route_devaddr_ranges_res_v1>): grpc.ClientWritableStream<iot_config_pb.route_update_devaddr_ranges_req_v1>;
  list_skfs(argument: iot_config_pb.route_skf_list_req_v1, metadataOrOptions?: grpc.Metadata | grpc.CallOptions | null): grpc.ClientReadableStream<iot_config_pb.skf_v1>;
  list_skfs(argument: iot_config_pb.route_skf_list_req_v1, metadata?: grpc.Metadata | null, options?: grpc.CallOptions | null): grpc.ClientReadableStream<iot_config_pb.skf_v1>;
  get_skfs(argument: iot_config_pb.route_skf_get_req_v1, metadataOrOptions?: grpc.Metadata | grpc.CallOptions | null): grpc.ClientReadableStream<iot_config_pb.skf_v1>;
  get_skfs(argument: iot_config_pb.route_skf_get_req_v1, metadata?: grpc.Metadata | null, options?: grpc.CallOptions | null): grpc.ClientReadableStream<iot_config_pb.skf_v1>;
  update_skfs(argument: iot_config_pb.route_skf_update_req_v1, callback: grpc.requestCallback<iot_config_pb.route_skf_update_res_v1>): grpc.ClientUnaryCall;
  update_skfs(argument: iot_config_pb.route_skf_update_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.route_skf_update_res_v1>): grpc.ClientUnaryCall;
  update_skfs(argument: iot_config_pb.route_skf_update_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.route_skf_update_res_v1>): grpc.ClientUnaryCall;
}

interface IgatewayService extends grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
  region_params: grpc.MethodDefinition<iot_config_pb.gateway_region_params_req_v1, iot_config_pb.gateway_region_params_res_v1>;
  location: grpc.MethodDefinition<iot_config_pb.gateway_location_req_v1, iot_config_pb.gateway_location_res_v1>;
  info: grpc.MethodDefinition<iot_config_pb.gateway_info_req_v1, iot_config_pb.gateway_info_res_v1>;
  info_stream: grpc.MethodDefinition<iot_config_pb.gateway_info_stream_req_v1, iot_config_pb.gateway_info_stream_res_v1>;
}

export const gatewayService: IgatewayService;

export interface IgatewayServer extends grpc.UntypedServiceImplementation {
  region_params: grpc.handleUnaryCall<iot_config_pb.gateway_region_params_req_v1, iot_config_pb.gateway_region_params_res_v1>;
  location: grpc.handleUnaryCall<iot_config_pb.gateway_location_req_v1, iot_config_pb.gateway_location_res_v1>;
  info: grpc.handleUnaryCall<iot_config_pb.gateway_info_req_v1, iot_config_pb.gateway_info_res_v1>;
  info_stream: grpc.handleServerStreamingCall<iot_config_pb.gateway_info_stream_req_v1, iot_config_pb.gateway_info_stream_res_v1>;
}

export class gatewayClient extends grpc.Client {
  constructor(address: string, credentials: grpc.ChannelCredentials, options?: object);
  region_params(argument: iot_config_pb.gateway_region_params_req_v1, callback: grpc.requestCallback<iot_config_pb.gateway_region_params_res_v1>): grpc.ClientUnaryCall;
  region_params(argument: iot_config_pb.gateway_region_params_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.gateway_region_params_res_v1>): grpc.ClientUnaryCall;
  region_params(argument: iot_config_pb.gateway_region_params_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.gateway_region_params_res_v1>): grpc.ClientUnaryCall;
  location(argument: iot_config_pb.gateway_location_req_v1, callback: grpc.requestCallback<iot_config_pb.gateway_location_res_v1>): grpc.ClientUnaryCall;
  location(argument: iot_config_pb.gateway_location_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.gateway_location_res_v1>): grpc.ClientUnaryCall;
  location(argument: iot_config_pb.gateway_location_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.gateway_location_res_v1>): grpc.ClientUnaryCall;
  info(argument: iot_config_pb.gateway_info_req_v1, callback: grpc.requestCallback<iot_config_pb.gateway_info_res_v1>): grpc.ClientUnaryCall;
  info(argument: iot_config_pb.gateway_info_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.gateway_info_res_v1>): grpc.ClientUnaryCall;
  info(argument: iot_config_pb.gateway_info_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.gateway_info_res_v1>): grpc.ClientUnaryCall;
  info_stream(argument: iot_config_pb.gateway_info_stream_req_v1, metadataOrOptions?: grpc.Metadata | grpc.CallOptions | null): grpc.ClientReadableStream<iot_config_pb.gateway_info_stream_res_v1>;
  info_stream(argument: iot_config_pb.gateway_info_stream_req_v1, metadata?: grpc.Metadata | null, options?: grpc.CallOptions | null): grpc.ClientReadableStream<iot_config_pb.gateway_info_stream_res_v1>;
}

interface IadminService extends grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
  add_key: grpc.MethodDefinition<iot_config_pb.admin_add_key_req_v1, iot_config_pb.admin_key_res_v1>;
  remove_key: grpc.MethodDefinition<iot_config_pb.admin_remove_key_req_v1, iot_config_pb.admin_key_res_v1>;
  load_region: grpc.MethodDefinition<iot_config_pb.admin_load_region_req_v1, iot_config_pb.admin_load_region_res_v1>;
  region_params: grpc.MethodDefinition<iot_config_pb.region_params_req_v1, iot_config_pb.region_params_res_v1>;
}

export const adminService: IadminService;

export interface IadminServer extends grpc.UntypedServiceImplementation {
  add_key: grpc.handleUnaryCall<iot_config_pb.admin_add_key_req_v1, iot_config_pb.admin_key_res_v1>;
  remove_key: grpc.handleUnaryCall<iot_config_pb.admin_remove_key_req_v1, iot_config_pb.admin_key_res_v1>;
  load_region: grpc.handleUnaryCall<iot_config_pb.admin_load_region_req_v1, iot_config_pb.admin_load_region_res_v1>;
  region_params: grpc.handleUnaryCall<iot_config_pb.region_params_req_v1, iot_config_pb.region_params_res_v1>;
}

export class adminClient extends grpc.Client {
  constructor(address: string, credentials: grpc.ChannelCredentials, options?: object);
  add_key(argument: iot_config_pb.admin_add_key_req_v1, callback: grpc.requestCallback<iot_config_pb.admin_key_res_v1>): grpc.ClientUnaryCall;
  add_key(argument: iot_config_pb.admin_add_key_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.admin_key_res_v1>): grpc.ClientUnaryCall;
  add_key(argument: iot_config_pb.admin_add_key_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.admin_key_res_v1>): grpc.ClientUnaryCall;
  remove_key(argument: iot_config_pb.admin_remove_key_req_v1, callback: grpc.requestCallback<iot_config_pb.admin_key_res_v1>): grpc.ClientUnaryCall;
  remove_key(argument: iot_config_pb.admin_remove_key_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.admin_key_res_v1>): grpc.ClientUnaryCall;
  remove_key(argument: iot_config_pb.admin_remove_key_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.admin_key_res_v1>): grpc.ClientUnaryCall;
  load_region(argument: iot_config_pb.admin_load_region_req_v1, callback: grpc.requestCallback<iot_config_pb.admin_load_region_res_v1>): grpc.ClientUnaryCall;
  load_region(argument: iot_config_pb.admin_load_region_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.admin_load_region_res_v1>): grpc.ClientUnaryCall;
  load_region(argument: iot_config_pb.admin_load_region_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.admin_load_region_res_v1>): grpc.ClientUnaryCall;
  region_params(argument: iot_config_pb.region_params_req_v1, callback: grpc.requestCallback<iot_config_pb.region_params_res_v1>): grpc.ClientUnaryCall;
  region_params(argument: iot_config_pb.region_params_req_v1, metadataOrOptions: grpc.Metadata | grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.region_params_res_v1>): grpc.ClientUnaryCall;
  region_params(argument: iot_config_pb.region_params_req_v1, metadata: grpc.Metadata | null, options: grpc.CallOptions | null, callback: grpc.requestCallback<iot_config_pb.region_params_res_v1>): grpc.ClientUnaryCall;
}
