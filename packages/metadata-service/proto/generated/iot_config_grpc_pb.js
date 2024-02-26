// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var iot_config_pb = require('./iot_config_pb.js');
var blockchain_region_param_v1_pb = require('./blockchain_region_param_v1_pb.js');
var region_pb = require('./region_pb.js');

function serialize_helium_iot_config_admin_add_key_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.admin_add_key_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.admin_add_key_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_admin_add_key_req_v1(buffer_arg) {
  return iot_config_pb.admin_add_key_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_admin_key_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.admin_key_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.admin_key_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_admin_key_res_v1(buffer_arg) {
  return iot_config_pb.admin_key_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_admin_load_region_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.admin_load_region_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.admin_load_region_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_admin_load_region_req_v1(buffer_arg) {
  return iot_config_pb.admin_load_region_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_admin_load_region_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.admin_load_region_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.admin_load_region_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_admin_load_region_res_v1(buffer_arg) {
  return iot_config_pb.admin_load_region_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_admin_remove_key_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.admin_remove_key_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.admin_remove_key_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_admin_remove_key_req_v1(buffer_arg) {
  return iot_config_pb.admin_remove_key_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_devaddr_range_v1(arg) {
  if (!(arg instanceof iot_config_pb.devaddr_range_v1)) {
    throw new Error('Expected argument of type helium.iot_config.devaddr_range_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_devaddr_range_v1(buffer_arg) {
  return iot_config_pb.devaddr_range_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_eui_pair_v1(arg) {
  if (!(arg instanceof iot_config_pb.eui_pair_v1)) {
    throw new Error('Expected argument of type helium.iot_config.eui_pair_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_eui_pair_v1(buffer_arg) {
  return iot_config_pb.eui_pair_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_gateway_info_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.gateway_info_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.gateway_info_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_gateway_info_req_v1(buffer_arg) {
  return iot_config_pb.gateway_info_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_gateway_info_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.gateway_info_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.gateway_info_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_gateway_info_res_v1(buffer_arg) {
  return iot_config_pb.gateway_info_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_gateway_info_stream_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.gateway_info_stream_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.gateway_info_stream_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_gateway_info_stream_req_v1(buffer_arg) {
  return iot_config_pb.gateway_info_stream_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_gateway_info_stream_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.gateway_info_stream_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.gateway_info_stream_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_gateway_info_stream_res_v1(buffer_arg) {
  return iot_config_pb.gateway_info_stream_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_gateway_location_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.gateway_location_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.gateway_location_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_gateway_location_req_v1(buffer_arg) {
  return iot_config_pb.gateway_location_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_gateway_location_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.gateway_location_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.gateway_location_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_gateway_location_res_v1(buffer_arg) {
  return iot_config_pb.gateway_location_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_gateway_region_params_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.gateway_region_params_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.gateway_region_params_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_gateway_region_params_req_v1(buffer_arg) {
  return iot_config_pb.gateway_region_params_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_gateway_region_params_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.gateway_region_params_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.gateway_region_params_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_gateway_region_params_res_v1(buffer_arg) {
  return iot_config_pb.gateway_region_params_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_org_create_helium_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.org_create_helium_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.org_create_helium_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_org_create_helium_req_v1(buffer_arg) {
  return iot_config_pb.org_create_helium_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_org_create_roamer_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.org_create_roamer_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.org_create_roamer_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_org_create_roamer_req_v1(buffer_arg) {
  return iot_config_pb.org_create_roamer_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_org_disable_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.org_disable_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.org_disable_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_org_disable_req_v1(buffer_arg) {
  return iot_config_pb.org_disable_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_org_disable_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.org_disable_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.org_disable_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_org_disable_res_v1(buffer_arg) {
  return iot_config_pb.org_disable_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_org_enable_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.org_enable_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.org_enable_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_org_enable_req_v1(buffer_arg) {
  return iot_config_pb.org_enable_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_org_enable_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.org_enable_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.org_enable_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_org_enable_res_v1(buffer_arg) {
  return iot_config_pb.org_enable_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_org_get_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.org_get_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.org_get_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_org_get_req_v1(buffer_arg) {
  return iot_config_pb.org_get_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_org_list_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.org_list_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.org_list_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_org_list_req_v1(buffer_arg) {
  return iot_config_pb.org_list_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_org_list_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.org_list_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.org_list_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_org_list_res_v1(buffer_arg) {
  return iot_config_pb.org_list_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_org_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.org_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.org_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_org_res_v1(buffer_arg) {
  return iot_config_pb.org_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_org_update_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.org_update_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.org_update_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_org_update_req_v1(buffer_arg) {
  return iot_config_pb.org_update_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_region_params_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.region_params_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.region_params_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_region_params_req_v1(buffer_arg) {
  return iot_config_pb.region_params_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_region_params_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.region_params_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.region_params_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_region_params_res_v1(buffer_arg) {
  return iot_config_pb.region_params_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_create_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_create_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_create_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_create_req_v1(buffer_arg) {
  return iot_config_pb.route_create_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_delete_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_delete_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_delete_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_delete_req_v1(buffer_arg) {
  return iot_config_pb.route_delete_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_devaddr_ranges_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_devaddr_ranges_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_devaddr_ranges_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_devaddr_ranges_res_v1(buffer_arg) {
  return iot_config_pb.route_devaddr_ranges_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_euis_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_euis_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_euis_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_euis_res_v1(buffer_arg) {
  return iot_config_pb.route_euis_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_get_devaddr_ranges_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_get_devaddr_ranges_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_get_devaddr_ranges_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_get_devaddr_ranges_req_v1(buffer_arg) {
  return iot_config_pb.route_get_devaddr_ranges_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_get_euis_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_get_euis_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_get_euis_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_get_euis_req_v1(buffer_arg) {
  return iot_config_pb.route_get_euis_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_get_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_get_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_get_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_get_req_v1(buffer_arg) {
  return iot_config_pb.route_get_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_list_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_list_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_list_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_list_req_v1(buffer_arg) {
  return iot_config_pb.route_list_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_list_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_list_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_list_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_list_res_v1(buffer_arg) {
  return iot_config_pb.route_list_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_res_v1(buffer_arg) {
  return iot_config_pb.route_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_skf_get_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_skf_get_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_skf_get_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_skf_get_req_v1(buffer_arg) {
  return iot_config_pb.route_skf_get_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_skf_list_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_skf_list_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_skf_list_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_skf_list_req_v1(buffer_arg) {
  return iot_config_pb.route_skf_list_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_skf_update_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_skf_update_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_skf_update_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_skf_update_req_v1(buffer_arg) {
  return iot_config_pb.route_skf_update_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_skf_update_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_skf_update_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_skf_update_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_skf_update_res_v1(buffer_arg) {
  return iot_config_pb.route_skf_update_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_stream_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_stream_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_stream_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_stream_req_v1(buffer_arg) {
  return iot_config_pb.route_stream_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_stream_res_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_stream_res_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_stream_res_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_stream_res_v1(buffer_arg) {
  return iot_config_pb.route_stream_res_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_update_devaddr_ranges_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_update_devaddr_ranges_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_update_devaddr_ranges_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_update_devaddr_ranges_req_v1(buffer_arg) {
  return iot_config_pb.route_update_devaddr_ranges_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_update_euis_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_update_euis_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_update_euis_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_update_euis_req_v1(buffer_arg) {
  return iot_config_pb.route_update_euis_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_route_update_req_v1(arg) {
  if (!(arg instanceof iot_config_pb.route_update_req_v1)) {
    throw new Error('Expected argument of type helium.iot_config.route_update_req_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_route_update_req_v1(buffer_arg) {
  return iot_config_pb.route_update_req_v1.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_helium_iot_config_skf_v1(arg) {
  if (!(arg instanceof iot_config_pb.skf_v1)) {
    throw new Error('Expected argument of type helium.iot_config.skf_v1');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_helium_iot_config_skf_v1(buffer_arg) {
  return iot_config_pb.skf_v1.deserializeBinary(new Uint8Array(buffer_arg));
}


// ------------------------------------------------------------------
// Service Definitions
// ------------------------------------------------------------------
//
var orgService = exports.orgService = {
  // List Org (no auth)
list: {
    path: '/helium.iot_config.org/list',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.org_list_req_v1,
    responseType: iot_config_pb.org_list_res_v1,
    requestSerialize: serialize_helium_iot_config_org_list_req_v1,
    requestDeserialize: deserialize_helium_iot_config_org_list_req_v1,
    responseSerialize: serialize_helium_iot_config_org_list_res_v1,
    responseDeserialize: deserialize_helium_iot_config_org_list_res_v1,
  },
  // Get Org (no auth)
get: {
    path: '/helium.iot_config.org/get',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.org_get_req_v1,
    responseType: iot_config_pb.org_res_v1,
    requestSerialize: serialize_helium_iot_config_org_get_req_v1,
    requestDeserialize: deserialize_helium_iot_config_org_get_req_v1,
    responseSerialize: serialize_helium_iot_config_org_res_v1,
    responseDeserialize: deserialize_helium_iot_config_org_res_v1,
  },
  // Create Org on Helium Network (auth admin only)
create_helium: {
    path: '/helium.iot_config.org/create_helium',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.org_create_helium_req_v1,
    responseType: iot_config_pb.org_res_v1,
    requestSerialize: serialize_helium_iot_config_org_create_helium_req_v1,
    requestDeserialize: deserialize_helium_iot_config_org_create_helium_req_v1,
    responseSerialize: serialize_helium_iot_config_org_res_v1,
    responseDeserialize: deserialize_helium_iot_config_org_res_v1,
  },
  // Create Org on any network (auth admin only)
create_roamer: {
    path: '/helium.iot_config.org/create_roamer',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.org_create_roamer_req_v1,
    responseType: iot_config_pb.org_res_v1,
    requestSerialize: serialize_helium_iot_config_org_create_roamer_req_v1,
    requestDeserialize: deserialize_helium_iot_config_org_create_roamer_req_v1,
    responseSerialize: serialize_helium_iot_config_org_res_v1,
    responseDeserialize: deserialize_helium_iot_config_org_res_v1,
  },
  // Update any Org (Helium or Roaming)
// Modify payer and add/remove delegate keys (owner/admin)
// Modify owner and add/remove devaddr constraints (auth admin only)
update: {
    path: '/helium.iot_config.org/update',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.org_update_req_v1,
    responseType: iot_config_pb.org_res_v1,
    requestSerialize: serialize_helium_iot_config_org_update_req_v1,
    requestDeserialize: deserialize_helium_iot_config_org_update_req_v1,
    responseSerialize: serialize_helium_iot_config_org_res_v1,
    responseDeserialize: deserialize_helium_iot_config_org_res_v1,
  },
  // Disable an org, this sends a stream route delete update to HPR
// for all associated routes (auth admin only)
disable: {
    path: '/helium.iot_config.org/disable',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.org_disable_req_v1,
    responseType: iot_config_pb.org_disable_res_v1,
    requestSerialize: serialize_helium_iot_config_org_disable_req_v1,
    requestDeserialize: deserialize_helium_iot_config_org_disable_req_v1,
    responseSerialize: serialize_helium_iot_config_org_disable_res_v1,
    responseDeserialize: deserialize_helium_iot_config_org_disable_res_v1,
  },
  // Enable an org, this sends a stream route create update to HPR
// for all associated routes (auth admin only)
enable: {
    path: '/helium.iot_config.org/enable',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.org_enable_req_v1,
    responseType: iot_config_pb.org_enable_res_v1,
    requestSerialize: serialize_helium_iot_config_org_enable_req_v1,
    requestDeserialize: deserialize_helium_iot_config_org_enable_req_v1,
    responseSerialize: serialize_helium_iot_config_org_enable_res_v1,
    responseDeserialize: deserialize_helium_iot_config_org_enable_res_v1,
  },
};

exports.orgClient = grpc.makeGenericClientConstructor(orgService);
var routeService = exports.routeService = {
  // List Routes for an Org (auth delegate_keys/owner/admin)
list: {
    path: '/helium.iot_config.route/list',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.route_list_req_v1,
    responseType: iot_config_pb.route_list_res_v1,
    requestSerialize: serialize_helium_iot_config_route_list_req_v1,
    requestDeserialize: deserialize_helium_iot_config_route_list_req_v1,
    responseSerialize: serialize_helium_iot_config_route_list_res_v1,
    responseDeserialize: deserialize_helium_iot_config_route_list_res_v1,
  },
  // Get Route for an Org (auth delegate_keys/owner/admin)
get: {
    path: '/helium.iot_config.route/get',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.route_get_req_v1,
    responseType: iot_config_pb.route_res_v1,
    requestSerialize: serialize_helium_iot_config_route_get_req_v1,
    requestDeserialize: deserialize_helium_iot_config_route_get_req_v1,
    responseSerialize: serialize_helium_iot_config_route_res_v1,
    responseDeserialize: deserialize_helium_iot_config_route_res_v1,
  },
  // Create Route for an Org (auth delegate_keys/owner/admin)
create: {
    path: '/helium.iot_config.route/create',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.route_create_req_v1,
    responseType: iot_config_pb.route_res_v1,
    requestSerialize: serialize_helium_iot_config_route_create_req_v1,
    requestDeserialize: deserialize_helium_iot_config_route_create_req_v1,
    responseSerialize: serialize_helium_iot_config_route_res_v1,
    responseDeserialize: deserialize_helium_iot_config_route_res_v1,
  },
  // Update Route for an Org (auth delegate_keys/owner/admin)
update: {
    path: '/helium.iot_config.route/update',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.route_update_req_v1,
    responseType: iot_config_pb.route_res_v1,
    requestSerialize: serialize_helium_iot_config_route_update_req_v1,
    requestDeserialize: deserialize_helium_iot_config_route_update_req_v1,
    responseSerialize: serialize_helium_iot_config_route_res_v1,
    responseDeserialize: deserialize_helium_iot_config_route_res_v1,
  },
  // Delete Route for an Org (auth delegate_keys/owner/admin)
delete: {
    path: '/helium.iot_config.route/delete',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.route_delete_req_v1,
    responseType: iot_config_pb.route_res_v1,
    requestSerialize: serialize_helium_iot_config_route_delete_req_v1,
    requestDeserialize: deserialize_helium_iot_config_route_delete_req_v1,
    responseSerialize: serialize_helium_iot_config_route_res_v1,
    responseDeserialize: deserialize_helium_iot_config_route_res_v1,
  },
  // Stream Routes update (auth admin only)
stream: {
    path: '/helium.iot_config.route/stream',
    requestStream: false,
    responseStream: true,
    requestType: iot_config_pb.route_stream_req_v1,
    responseType: iot_config_pb.route_stream_res_v1,
    requestSerialize: serialize_helium_iot_config_route_stream_req_v1,
    requestDeserialize: deserialize_helium_iot_config_route_stream_req_v1,
    responseSerialize: serialize_helium_iot_config_route_stream_res_v1,
    responseDeserialize: deserialize_helium_iot_config_route_stream_res_v1,
  },
  // EUIs
//
// Get EUIs for a Route (auth delegate_keys/owner/admin)
get_euis: {
    path: '/helium.iot_config.route/get_euis',
    requestStream: false,
    responseStream: true,
    requestType: iot_config_pb.route_get_euis_req_v1,
    responseType: iot_config_pb.eui_pair_v1,
    requestSerialize: serialize_helium_iot_config_route_get_euis_req_v1,
    requestDeserialize: deserialize_helium_iot_config_route_get_euis_req_v1,
    responseSerialize: serialize_helium_iot_config_eui_pair_v1,
    responseDeserialize: deserialize_helium_iot_config_eui_pair_v1,
  },
  // Update (single add or remove) EUIs for a Route (auth
// delegate_keys/owner/admin)
update_euis: {
    path: '/helium.iot_config.route/update_euis',
    requestStream: true,
    responseStream: false,
    requestType: iot_config_pb.route_update_euis_req_v1,
    responseType: iot_config_pb.route_euis_res_v1,
    requestSerialize: serialize_helium_iot_config_route_update_euis_req_v1,
    requestDeserialize: deserialize_helium_iot_config_route_update_euis_req_v1,
    responseSerialize: serialize_helium_iot_config_route_euis_res_v1,
    responseDeserialize: deserialize_helium_iot_config_route_euis_res_v1,
  },
  // DevAddr Ranges
//
// Get DevAddr Ranges for a Route (auth delegate_keys/owner/admin)
get_devaddr_ranges: {
    path: '/helium.iot_config.route/get_devaddr_ranges',
    requestStream: false,
    responseStream: true,
    requestType: iot_config_pb.route_get_devaddr_ranges_req_v1,
    responseType: iot_config_pb.devaddr_range_v1,
    requestSerialize: serialize_helium_iot_config_route_get_devaddr_ranges_req_v1,
    requestDeserialize: deserialize_helium_iot_config_route_get_devaddr_ranges_req_v1,
    responseSerialize: serialize_helium_iot_config_devaddr_range_v1,
    responseDeserialize: deserialize_helium_iot_config_devaddr_range_v1,
  },
  // Update (single add or remove) DevAddr Ranges for a Route (auth
// delegate_keys/owner/admin)
update_devaddr_ranges: {
    path: '/helium.iot_config.route/update_devaddr_ranges',
    requestStream: true,
    responseStream: false,
    requestType: iot_config_pb.route_update_devaddr_ranges_req_v1,
    responseType: iot_config_pb.route_devaddr_ranges_res_v1,
    requestSerialize: serialize_helium_iot_config_route_update_devaddr_ranges_req_v1,
    requestDeserialize: deserialize_helium_iot_config_route_update_devaddr_ranges_req_v1,
    responseSerialize: serialize_helium_iot_config_route_devaddr_ranges_res_v1,
    responseDeserialize: deserialize_helium_iot_config_route_devaddr_ranges_res_v1,
  },
  // Session Key Filters (aka SKFs)
//
// List Filters for a Route (auth delegate_keys/owner/admin)
list_skfs: {
    path: '/helium.iot_config.route/list_skfs',
    requestStream: false,
    responseStream: true,
    requestType: iot_config_pb.route_skf_list_req_v1,
    responseType: iot_config_pb.skf_v1,
    requestSerialize: serialize_helium_iot_config_route_skf_list_req_v1,
    requestDeserialize: deserialize_helium_iot_config_route_skf_list_req_v1,
    responseSerialize: serialize_helium_iot_config_skf_v1,
    responseDeserialize: deserialize_helium_iot_config_skf_v1,
  },
  // List Filters for a DevAddr (auth delegate_keys/owner/admin
get_skfs: {
    path: '/helium.iot_config.route/get_skfs',
    requestStream: false,
    responseStream: true,
    requestType: iot_config_pb.route_skf_get_req_v1,
    responseType: iot_config_pb.skf_v1,
    requestSerialize: serialize_helium_iot_config_route_skf_get_req_v1,
    requestDeserialize: deserialize_helium_iot_config_route_skf_get_req_v1,
    responseSerialize: serialize_helium_iot_config_skf_v1,
    responseDeserialize: deserialize_helium_iot_config_skf_v1,
  },
  // Update Filters for an Org (auth delegate_keys/owner/admin)
update_skfs: {
    path: '/helium.iot_config.route/update_skfs',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.route_skf_update_req_v1,
    responseType: iot_config_pb.route_skf_update_res_v1,
    requestSerialize: serialize_helium_iot_config_route_skf_update_req_v1,
    requestDeserialize: deserialize_helium_iot_config_route_skf_update_req_v1,
    responseSerialize: serialize_helium_iot_config_route_skf_update_res_v1,
    responseDeserialize: deserialize_helium_iot_config_route_skf_update_res_v1,
  },
};

exports.routeClient = grpc.makeGenericClientConstructor(routeService);
var gatewayService = exports.gatewayService = {
  // Return the region params for the asserted location of the signed gateway
// address (no auth, but signature validated)
region_params: {
    path: '/helium.iot_config.gateway/region_params',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.gateway_region_params_req_v1,
    responseType: iot_config_pb.gateway_region_params_res_v1,
    requestSerialize: serialize_helium_iot_config_gateway_region_params_req_v1,
    requestDeserialize: deserialize_helium_iot_config_gateway_region_params_req_v1,
    responseSerialize: serialize_helium_iot_config_gateway_region_params_res_v1,
    responseDeserialize: deserialize_helium_iot_config_gateway_region_params_res_v1,
  },
  // Get H3 Location for a gateway (auth admin only)
location: {
    path: '/helium.iot_config.gateway/location',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.gateway_location_req_v1,
    responseType: iot_config_pb.gateway_location_res_v1,
    requestSerialize: serialize_helium_iot_config_gateway_location_req_v1,
    requestDeserialize: deserialize_helium_iot_config_gateway_location_req_v1,
    responseSerialize: serialize_helium_iot_config_gateway_location_res_v1,
    responseDeserialize: deserialize_helium_iot_config_gateway_location_res_v1,
  },
  // Get info for the specified gateway
info: {
    path: '/helium.iot_config.gateway/info',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.gateway_info_req_v1,
    responseType: iot_config_pb.gateway_info_res_v1,
    requestSerialize: serialize_helium_iot_config_gateway_info_req_v1,
    requestDeserialize: deserialize_helium_iot_config_gateway_info_req_v1,
    responseSerialize: serialize_helium_iot_config_gateway_info_res_v1,
    responseDeserialize: deserialize_helium_iot_config_gateway_info_res_v1,
  },
  // Get a stream of gateway info
info_stream: {
    path: '/helium.iot_config.gateway/info_stream',
    requestStream: false,
    responseStream: true,
    requestType: iot_config_pb.gateway_info_stream_req_v1,
    responseType: iot_config_pb.gateway_info_stream_res_v1,
    requestSerialize: serialize_helium_iot_config_gateway_info_stream_req_v1,
    requestDeserialize: deserialize_helium_iot_config_gateway_info_stream_req_v1,
    responseSerialize: serialize_helium_iot_config_gateway_info_stream_res_v1,
    responseDeserialize: deserialize_helium_iot_config_gateway_info_stream_res_v1,
  },
};

exports.gatewayClient = grpc.makeGenericClientConstructor(gatewayService);
var adminService = exports.adminService = {
  // Authorize a public key for validating trusted rpcs
add_key: {
    path: '/helium.iot_config.admin/add_key',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.admin_add_key_req_v1,
    responseType: iot_config_pb.admin_key_res_v1,
    requestSerialize: serialize_helium_iot_config_admin_add_key_req_v1,
    requestDeserialize: deserialize_helium_iot_config_admin_add_key_req_v1,
    responseSerialize: serialize_helium_iot_config_admin_key_res_v1,
    responseDeserialize: deserialize_helium_iot_config_admin_key_res_v1,
  },
  // Deauthorize a public key for validating trusted rpcs
remove_key: {
    path: '/helium.iot_config.admin/remove_key',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.admin_remove_key_req_v1,
    responseType: iot_config_pb.admin_key_res_v1,
    requestSerialize: serialize_helium_iot_config_admin_remove_key_req_v1,
    requestDeserialize: deserialize_helium_iot_config_admin_remove_key_req_v1,
    responseSerialize: serialize_helium_iot_config_admin_key_res_v1,
    responseDeserialize: deserialize_helium_iot_config_admin_key_res_v1,
  },
  // Load params and cell indexes for a region into the config service (auth
// admin only)
load_region: {
    path: '/helium.iot_config.admin/load_region',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.admin_load_region_req_v1,
    responseType: iot_config_pb.admin_load_region_res_v1,
    requestSerialize: serialize_helium_iot_config_admin_load_region_req_v1,
    requestDeserialize: deserialize_helium_iot_config_admin_load_region_req_v1,
    responseSerialize: serialize_helium_iot_config_admin_load_region_res_v1,
    responseDeserialize: deserialize_helium_iot_config_admin_load_region_res_v1,
  },
  // Return the region params for the specified region
region_params: {
    path: '/helium.iot_config.admin/region_params',
    requestStream: false,
    responseStream: false,
    requestType: iot_config_pb.region_params_req_v1,
    responseType: iot_config_pb.region_params_res_v1,
    requestSerialize: serialize_helium_iot_config_region_params_req_v1,
    requestDeserialize: deserialize_helium_iot_config_region_params_req_v1,
    responseSerialize: serialize_helium_iot_config_region_params_res_v1,
    responseDeserialize: deserialize_helium_iot_config_region_params_res_v1,
  },
};

exports.adminClient = grpc.makeGenericClientConstructor(adminService);
