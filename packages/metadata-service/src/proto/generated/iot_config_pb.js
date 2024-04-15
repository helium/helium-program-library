// source: iot_config.proto
/**
 * @fileoverview
 * @enhanceable
 * @suppress {missingRequire} reports error on implicit type usages.
 * @suppress {messageConventions} JS Compiler reports an error if a variable or
 *     field starts with 'MSG_' and isn't a translatable message.
 * @public
 */
// GENERATED CODE -- DO NOT EDIT!
/* eslint-disable */
// @ts-nocheck

var jspb = require('google-protobuf');
var goog = jspb;
var global =
    (typeof globalThis !== 'undefined' && globalThis) ||
    (typeof window !== 'undefined' && window) ||
    (typeof global !== 'undefined' && global) ||
    (typeof self !== 'undefined' && self) ||
    (function () { return this; }).call(null) ||
    Function('return this')();

var blockchain_region_param_v1_pb = require('./blockchain_region_param_v1_pb.js');
goog.object.extend(proto, blockchain_region_param_v1_pb);
var region_pb = require('./region_pb.js');
goog.object.extend(proto, region_pb);
goog.exportSymbol('proto.helium.iot_config.action_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.admin_add_key_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.admin_add_key_req_v1.key_type_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.admin_key_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.admin_load_region_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.admin_load_region_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.admin_remove_key_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.devaddr_constraint_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.devaddr_range_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.eui_pair_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.gateway_info', null, global);
goog.exportSymbol('proto.helium.iot_config.gateway_info_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.gateway_info_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.gateway_info_stream_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.gateway_info_stream_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.gateway_location_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.gateway_location_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.gateway_metadata', null, global);
goog.exportSymbol('proto.helium.iot_config.gateway_region_params_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.gateway_region_params_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.org_create_helium_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.org_create_helium_req_v1.helium_net_id', null, global);
goog.exportSymbol('proto.helium.iot_config.org_create_roamer_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.org_disable_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.org_disable_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.org_enable_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.org_enable_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.org_get_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.org_list_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.org_list_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.org_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.org_update_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.org_update_req_v1.update_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.org_update_req_v1.update_v1.UpdateCase', null, global);
goog.exportSymbol('proto.helium.iot_config.org_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.protocol_gwmp_mapping_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.protocol_gwmp_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.protocol_http_roaming_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.protocol_http_roaming_v1.flow_type_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.protocol_packet_router_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.region_params_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.region_params_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_create_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_delete_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_devaddr_ranges_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_euis_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_get_devaddr_ranges_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_get_euis_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_get_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_list_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_list_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_skf_get_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_skf_list_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_skf_update_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_skf_update_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_stream_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_stream_res_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_stream_res_v1.DataCase', null, global);
goog.exportSymbol('proto.helium.iot_config.route_update_devaddr_ranges_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_update_euis_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_update_req_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.route_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.server_v1', null, global);
goog.exportSymbol('proto.helium.iot_config.server_v1.ProtocolCase', null, global);
goog.exportSymbol('proto.helium.iot_config.skf_v1', null, global);
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.org_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, proto.helium.iot_config.org_v1.repeatedFields_, null);
};
goog.inherits(proto.helium.iot_config.org_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.org_v1.displayName = 'proto.helium.iot_config.org_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.devaddr_range_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.devaddr_range_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.devaddr_range_v1.displayName = 'proto.helium.iot_config.devaddr_range_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.devaddr_constraint_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.devaddr_constraint_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.devaddr_constraint_v1.displayName = 'proto.helium.iot_config.devaddr_constraint_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.eui_pair_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.eui_pair_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.eui_pair_v1.displayName = 'proto.helium.iot_config.eui_pair_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.protocol_packet_router_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.protocol_packet_router_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.protocol_packet_router_v1.displayName = 'proto.helium.iot_config.protocol_packet_router_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.protocol_gwmp_mapping_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.protocol_gwmp_mapping_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.protocol_gwmp_mapping_v1.displayName = 'proto.helium.iot_config.protocol_gwmp_mapping_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.protocol_gwmp_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, proto.helium.iot_config.protocol_gwmp_v1.repeatedFields_, null);
};
goog.inherits(proto.helium.iot_config.protocol_gwmp_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.protocol_gwmp_v1.displayName = 'proto.helium.iot_config.protocol_gwmp_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.protocol_http_roaming_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.protocol_http_roaming_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.protocol_http_roaming_v1.displayName = 'proto.helium.iot_config.protocol_http_roaming_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.server_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, proto.helium.iot_config.server_v1.oneofGroups_);
};
goog.inherits(proto.helium.iot_config.server_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.server_v1.displayName = 'proto.helium.iot_config.server_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_v1.displayName = 'proto.helium.iot_config.route_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.org_list_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.org_list_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.org_list_req_v1.displayName = 'proto.helium.iot_config.org_list_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.org_list_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, proto.helium.iot_config.org_list_res_v1.repeatedFields_, null);
};
goog.inherits(proto.helium.iot_config.org_list_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.org_list_res_v1.displayName = 'proto.helium.iot_config.org_list_res_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.org_get_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.org_get_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.org_get_req_v1.displayName = 'proto.helium.iot_config.org_get_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.org_create_helium_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, proto.helium.iot_config.org_create_helium_req_v1.repeatedFields_, null);
};
goog.inherits(proto.helium.iot_config.org_create_helium_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.org_create_helium_req_v1.displayName = 'proto.helium.iot_config.org_create_helium_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.org_create_roamer_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, proto.helium.iot_config.org_create_roamer_req_v1.repeatedFields_, null);
};
goog.inherits(proto.helium.iot_config.org_create_roamer_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.org_create_roamer_req_v1.displayName = 'proto.helium.iot_config.org_create_roamer_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.org_update_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, proto.helium.iot_config.org_update_req_v1.repeatedFields_, null);
};
goog.inherits(proto.helium.iot_config.org_update_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.org_update_req_v1.displayName = 'proto.helium.iot_config.org_update_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.displayName = 'proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.displayName = 'proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.org_update_req_v1.update_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, proto.helium.iot_config.org_update_req_v1.update_v1.oneofGroups_);
};
goog.inherits(proto.helium.iot_config.org_update_req_v1.update_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.org_update_req_v1.update_v1.displayName = 'proto.helium.iot_config.org_update_req_v1.update_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.org_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, proto.helium.iot_config.org_res_v1.repeatedFields_, null);
};
goog.inherits(proto.helium.iot_config.org_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.org_res_v1.displayName = 'proto.helium.iot_config.org_res_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.org_disable_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.org_disable_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.org_disable_req_v1.displayName = 'proto.helium.iot_config.org_disable_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.org_disable_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.org_disable_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.org_disable_res_v1.displayName = 'proto.helium.iot_config.org_disable_res_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.org_enable_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.org_enable_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.org_enable_req_v1.displayName = 'proto.helium.iot_config.org_enable_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.org_enable_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.org_enable_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.org_enable_res_v1.displayName = 'proto.helium.iot_config.org_enable_res_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_list_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_list_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_list_req_v1.displayName = 'proto.helium.iot_config.route_list_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_list_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, proto.helium.iot_config.route_list_res_v1.repeatedFields_, null);
};
goog.inherits(proto.helium.iot_config.route_list_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_list_res_v1.displayName = 'proto.helium.iot_config.route_list_res_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_get_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_get_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_get_req_v1.displayName = 'proto.helium.iot_config.route_get_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_create_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_create_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_create_req_v1.displayName = 'proto.helium.iot_config.route_create_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_update_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_update_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_update_req_v1.displayName = 'proto.helium.iot_config.route_update_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_delete_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_delete_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_delete_req_v1.displayName = 'proto.helium.iot_config.route_delete_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_res_v1.displayName = 'proto.helium.iot_config.route_res_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_get_euis_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_get_euis_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_get_euis_req_v1.displayName = 'proto.helium.iot_config.route_get_euis_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_update_euis_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_update_euis_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_update_euis_req_v1.displayName = 'proto.helium.iot_config.route_update_euis_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_euis_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_euis_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_euis_res_v1.displayName = 'proto.helium.iot_config.route_euis_res_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_get_devaddr_ranges_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_get_devaddr_ranges_req_v1.displayName = 'proto.helium.iot_config.route_get_devaddr_ranges_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_update_devaddr_ranges_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_update_devaddr_ranges_req_v1.displayName = 'proto.helium.iot_config.route_update_devaddr_ranges_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_devaddr_ranges_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_devaddr_ranges_res_v1.displayName = 'proto.helium.iot_config.route_devaddr_ranges_res_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_stream_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_stream_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_stream_req_v1.displayName = 'proto.helium.iot_config.route_stream_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_stream_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, proto.helium.iot_config.route_stream_res_v1.oneofGroups_);
};
goog.inherits(proto.helium.iot_config.route_stream_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_stream_res_v1.displayName = 'proto.helium.iot_config.route_stream_res_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.skf_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.skf_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.skf_v1.displayName = 'proto.helium.iot_config.skf_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_skf_list_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_skf_list_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_skf_list_req_v1.displayName = 'proto.helium.iot_config.route_skf_list_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_skf_get_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_skf_get_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_skf_get_req_v1.displayName = 'proto.helium.iot_config.route_skf_get_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_skf_update_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, proto.helium.iot_config.route_skf_update_req_v1.repeatedFields_, null);
};
goog.inherits(proto.helium.iot_config.route_skf_update_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_skf_update_req_v1.displayName = 'proto.helium.iot_config.route_skf_update_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.displayName = 'proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.route_skf_update_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.route_skf_update_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.route_skf_update_res_v1.displayName = 'proto.helium.iot_config.route_skf_update_res_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.gateway_region_params_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.gateway_region_params_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.gateway_region_params_req_v1.displayName = 'proto.helium.iot_config.gateway_region_params_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.gateway_region_params_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.gateway_region_params_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.gateway_region_params_res_v1.displayName = 'proto.helium.iot_config.gateway_region_params_res_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.gateway_location_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.gateway_location_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.gateway_location_req_v1.displayName = 'proto.helium.iot_config.gateway_location_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.gateway_location_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.gateway_location_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.gateway_location_res_v1.displayName = 'proto.helium.iot_config.gateway_location_res_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.admin_load_region_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.admin_load_region_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.admin_load_region_req_v1.displayName = 'proto.helium.iot_config.admin_load_region_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.admin_load_region_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.admin_load_region_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.admin_load_region_res_v1.displayName = 'proto.helium.iot_config.admin_load_region_res_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.admin_add_key_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.admin_add_key_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.admin_add_key_req_v1.displayName = 'proto.helium.iot_config.admin_add_key_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.admin_remove_key_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.admin_remove_key_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.admin_remove_key_req_v1.displayName = 'proto.helium.iot_config.admin_remove_key_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.admin_key_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.admin_key_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.admin_key_res_v1.displayName = 'proto.helium.iot_config.admin_key_res_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.gateway_metadata = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.gateway_metadata, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.gateway_metadata.displayName = 'proto.helium.iot_config.gateway_metadata';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.gateway_info = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.gateway_info, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.gateway_info.displayName = 'proto.helium.iot_config.gateway_info';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.gateway_info_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.gateway_info_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.gateway_info_req_v1.displayName = 'proto.helium.iot_config.gateway_info_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.gateway_info_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.gateway_info_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.gateway_info_res_v1.displayName = 'proto.helium.iot_config.gateway_info_res_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.gateway_info_stream_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.gateway_info_stream_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.gateway_info_stream_req_v1.displayName = 'proto.helium.iot_config.gateway_info_stream_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.gateway_info_stream_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, proto.helium.iot_config.gateway_info_stream_res_v1.repeatedFields_, null);
};
goog.inherits(proto.helium.iot_config.gateway_info_stream_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.gateway_info_stream_res_v1.displayName = 'proto.helium.iot_config.gateway_info_stream_res_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.region_params_req_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.region_params_req_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.region_params_req_v1.displayName = 'proto.helium.iot_config.region_params_req_v1';
}
/**
 * Generated by JsPbCodeGenerator.
 * @param {Array=} opt_data Optional initial data array, typically from a
 * server response, or constructed directly in Javascript. The array is used
 * in place and becomes part of the constructed object. It is not cloned.
 * If no data is provided, the constructed object will be empty, but still
 * valid.
 * @extends {jspb.Message}
 * @constructor
 */
proto.helium.iot_config.region_params_res_v1 = function(opt_data) {
  jspb.Message.initialize(this, opt_data, 0, -1, null, null);
};
goog.inherits(proto.helium.iot_config.region_params_res_v1, jspb.Message);
if (goog.DEBUG && !COMPILED) {
  /**
   * @public
   * @override
   */
  proto.helium.iot_config.region_params_res_v1.displayName = 'proto.helium.iot_config.region_params_res_v1';
}

/**
 * List of repeated fields within this message type.
 * @private {!Array<number>}
 * @const
 */
proto.helium.iot_config.org_v1.repeatedFields_ = [4];



if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.org_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.org_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.org_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    oui: jspb.Message.getFieldWithDefault(msg, 1, 0),
    owner: msg.getOwner_asB64(),
    payer: msg.getPayer_asB64(),
    delegateKeysList: msg.getDelegateKeysList_asB64(),
    locked: jspb.Message.getBooleanFieldWithDefault(msg, 5, false)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.org_v1}
 */
proto.helium.iot_config.org_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.org_v1;
  return proto.helium.iot_config.org_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.org_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.org_v1}
 */
proto.helium.iot_config.org_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setOui(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setOwner(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setPayer(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.addDelegateKeys(value);
      break;
    case 5:
      var value = /** @type {boolean} */ (reader.readBool());
      msg.setLocked(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.org_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.org_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getOui();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getOwner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getPayer_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getDelegateKeysList_asU8();
  if (f.length > 0) {
    writer.writeRepeatedBytes(
      4,
      f
    );
  }
  f = message.getLocked();
  if (f) {
    writer.writeBool(
      5,
      f
    );
  }
};


/**
 * optional uint64 oui = 1;
 * @return {number}
 */
proto.helium.iot_config.org_v1.prototype.getOui = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_v1} returns this
 */
proto.helium.iot_config.org_v1.prototype.setOui = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional bytes owner = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_v1.prototype.getOwner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes owner = 2;
 * This is a type-conversion wrapper around `getOwner()`
 * @return {string}
 */
proto.helium.iot_config.org_v1.prototype.getOwner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getOwner()));
};


/**
 * optional bytes owner = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getOwner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_v1.prototype.getOwner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getOwner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_v1} returns this
 */
proto.helium.iot_config.org_v1.prototype.setOwner = function(value) {
  return jspb.Message.setProto3BytesField(this, 2, value);
};


/**
 * optional bytes payer = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_v1.prototype.getPayer = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes payer = 3;
 * This is a type-conversion wrapper around `getPayer()`
 * @return {string}
 */
proto.helium.iot_config.org_v1.prototype.getPayer_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getPayer()));
};


/**
 * optional bytes payer = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getPayer()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_v1.prototype.getPayer_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getPayer()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_v1} returns this
 */
proto.helium.iot_config.org_v1.prototype.setPayer = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * repeated bytes delegate_keys = 4;
 * @return {!(Array<!Uint8Array>|Array<string>)}
 */
proto.helium.iot_config.org_v1.prototype.getDelegateKeysList = function() {
  return /** @type {!(Array<!Uint8Array>|Array<string>)} */ (jspb.Message.getRepeatedField(this, 4));
};


/**
 * repeated bytes delegate_keys = 4;
 * This is a type-conversion wrapper around `getDelegateKeysList()`
 * @return {!Array<string>}
 */
proto.helium.iot_config.org_v1.prototype.getDelegateKeysList_asB64 = function() {
  return /** @type {!Array<string>} */ (jspb.Message.bytesListAsB64(
      this.getDelegateKeysList()));
};


/**
 * repeated bytes delegate_keys = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getDelegateKeysList()`
 * @return {!Array<!Uint8Array>}
 */
proto.helium.iot_config.org_v1.prototype.getDelegateKeysList_asU8 = function() {
  return /** @type {!Array<!Uint8Array>} */ (jspb.Message.bytesListAsU8(
      this.getDelegateKeysList()));
};


/**
 * @param {!(Array<!Uint8Array>|Array<string>)} value
 * @return {!proto.helium.iot_config.org_v1} returns this
 */
proto.helium.iot_config.org_v1.prototype.setDelegateKeysList = function(value) {
  return jspb.Message.setField(this, 4, value || []);
};


/**
 * @param {!(string|Uint8Array)} value
 * @param {number=} opt_index
 * @return {!proto.helium.iot_config.org_v1} returns this
 */
proto.helium.iot_config.org_v1.prototype.addDelegateKeys = function(value, opt_index) {
  return jspb.Message.addToRepeatedField(this, 4, value, opt_index);
};


/**
 * Clears the list making it empty but non-null.
 * @return {!proto.helium.iot_config.org_v1} returns this
 */
proto.helium.iot_config.org_v1.prototype.clearDelegateKeysList = function() {
  return this.setDelegateKeysList([]);
};


/**
 * optional bool locked = 5;
 * @return {boolean}
 */
proto.helium.iot_config.org_v1.prototype.getLocked = function() {
  return /** @type {boolean} */ (jspb.Message.getBooleanFieldWithDefault(this, 5, false));
};


/**
 * @param {boolean} value
 * @return {!proto.helium.iot_config.org_v1} returns this
 */
proto.helium.iot_config.org_v1.prototype.setLocked = function(value) {
  return jspb.Message.setProto3BooleanField(this, 5, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.devaddr_range_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.devaddr_range_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.devaddr_range_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.devaddr_range_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    routeId: jspb.Message.getFieldWithDefault(msg, 1, ""),
    startAddr: jspb.Message.getFieldWithDefault(msg, 2, 0),
    endAddr: jspb.Message.getFieldWithDefault(msg, 3, 0)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.devaddr_range_v1}
 */
proto.helium.iot_config.devaddr_range_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.devaddr_range_v1;
  return proto.helium.iot_config.devaddr_range_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.devaddr_range_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.devaddr_range_v1}
 */
proto.helium.iot_config.devaddr_range_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {string} */ (reader.readString());
      msg.setRouteId(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setStartAddr(value);
      break;
    case 3:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setEndAddr(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.devaddr_range_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.devaddr_range_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.devaddr_range_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.devaddr_range_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRouteId();
  if (f.length > 0) {
    writer.writeString(
      1,
      f
    );
  }
  f = message.getStartAddr();
  if (f !== 0) {
    writer.writeUint32(
      2,
      f
    );
  }
  f = message.getEndAddr();
  if (f !== 0) {
    writer.writeUint32(
      3,
      f
    );
  }
};


/**
 * optional string route_id = 1;
 * @return {string}
 */
proto.helium.iot_config.devaddr_range_v1.prototype.getRouteId = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.devaddr_range_v1} returns this
 */
proto.helium.iot_config.devaddr_range_v1.prototype.setRouteId = function(value) {
  return jspb.Message.setProto3StringField(this, 1, value);
};


/**
 * optional uint32 start_addr = 2;
 * @return {number}
 */
proto.helium.iot_config.devaddr_range_v1.prototype.getStartAddr = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.devaddr_range_v1} returns this
 */
proto.helium.iot_config.devaddr_range_v1.prototype.setStartAddr = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional uint32 end_addr = 3;
 * @return {number}
 */
proto.helium.iot_config.devaddr_range_v1.prototype.getEndAddr = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 3, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.devaddr_range_v1} returns this
 */
proto.helium.iot_config.devaddr_range_v1.prototype.setEndAddr = function(value) {
  return jspb.Message.setProto3IntField(this, 3, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.devaddr_constraint_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.devaddr_constraint_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.devaddr_constraint_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.devaddr_constraint_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    startAddr: jspb.Message.getFieldWithDefault(msg, 1, 0),
    endAddr: jspb.Message.getFieldWithDefault(msg, 2, 0)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.devaddr_constraint_v1}
 */
proto.helium.iot_config.devaddr_constraint_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.devaddr_constraint_v1;
  return proto.helium.iot_config.devaddr_constraint_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.devaddr_constraint_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.devaddr_constraint_v1}
 */
proto.helium.iot_config.devaddr_constraint_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setStartAddr(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setEndAddr(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.devaddr_constraint_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.devaddr_constraint_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.devaddr_constraint_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.devaddr_constraint_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getStartAddr();
  if (f !== 0) {
    writer.writeUint32(
      1,
      f
    );
  }
  f = message.getEndAddr();
  if (f !== 0) {
    writer.writeUint32(
      2,
      f
    );
  }
};


/**
 * optional uint32 start_addr = 1;
 * @return {number}
 */
proto.helium.iot_config.devaddr_constraint_v1.prototype.getStartAddr = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.devaddr_constraint_v1} returns this
 */
proto.helium.iot_config.devaddr_constraint_v1.prototype.setStartAddr = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional uint32 end_addr = 2;
 * @return {number}
 */
proto.helium.iot_config.devaddr_constraint_v1.prototype.getEndAddr = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.devaddr_constraint_v1} returns this
 */
proto.helium.iot_config.devaddr_constraint_v1.prototype.setEndAddr = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.eui_pair_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.eui_pair_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.eui_pair_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.eui_pair_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    routeId: jspb.Message.getFieldWithDefault(msg, 1, ""),
    appEui: jspb.Message.getFieldWithDefault(msg, 2, 0),
    devEui: jspb.Message.getFieldWithDefault(msg, 3, 0)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.eui_pair_v1}
 */
proto.helium.iot_config.eui_pair_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.eui_pair_v1;
  return proto.helium.iot_config.eui_pair_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.eui_pair_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.eui_pair_v1}
 */
proto.helium.iot_config.eui_pair_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {string} */ (reader.readString());
      msg.setRouteId(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setAppEui(value);
      break;
    case 3:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setDevEui(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.eui_pair_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.eui_pair_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.eui_pair_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.eui_pair_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRouteId();
  if (f.length > 0) {
    writer.writeString(
      1,
      f
    );
  }
  f = message.getAppEui();
  if (f !== 0) {
    writer.writeUint64(
      2,
      f
    );
  }
  f = message.getDevEui();
  if (f !== 0) {
    writer.writeUint64(
      3,
      f
    );
  }
};


/**
 * optional string route_id = 1;
 * @return {string}
 */
proto.helium.iot_config.eui_pair_v1.prototype.getRouteId = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.eui_pair_v1} returns this
 */
proto.helium.iot_config.eui_pair_v1.prototype.setRouteId = function(value) {
  return jspb.Message.setProto3StringField(this, 1, value);
};


/**
 * optional uint64 app_eui = 2;
 * @return {number}
 */
proto.helium.iot_config.eui_pair_v1.prototype.getAppEui = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.eui_pair_v1} returns this
 */
proto.helium.iot_config.eui_pair_v1.prototype.setAppEui = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional uint64 dev_eui = 3;
 * @return {number}
 */
proto.helium.iot_config.eui_pair_v1.prototype.getDevEui = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 3, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.eui_pair_v1} returns this
 */
proto.helium.iot_config.eui_pair_v1.prototype.setDevEui = function(value) {
  return jspb.Message.setProto3IntField(this, 3, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.protocol_packet_router_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.protocol_packet_router_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.protocol_packet_router_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.protocol_packet_router_v1.toObject = function(includeInstance, msg) {
  var f, obj = {

  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.protocol_packet_router_v1}
 */
proto.helium.iot_config.protocol_packet_router_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.protocol_packet_router_v1;
  return proto.helium.iot_config.protocol_packet_router_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.protocol_packet_router_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.protocol_packet_router_v1}
 */
proto.helium.iot_config.protocol_packet_router_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.protocol_packet_router_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.protocol_packet_router_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.protocol_packet_router_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.protocol_packet_router_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.protocol_gwmp_mapping_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.protocol_gwmp_mapping_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.protocol_gwmp_mapping_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.protocol_gwmp_mapping_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    region: jspb.Message.getFieldWithDefault(msg, 1, 0),
    port: jspb.Message.getFieldWithDefault(msg, 2, 0)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.protocol_gwmp_mapping_v1}
 */
proto.helium.iot_config.protocol_gwmp_mapping_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.protocol_gwmp_mapping_v1;
  return proto.helium.iot_config.protocol_gwmp_mapping_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.protocol_gwmp_mapping_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.protocol_gwmp_mapping_v1}
 */
proto.helium.iot_config.protocol_gwmp_mapping_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!proto.helium.region} */ (reader.readEnum());
      msg.setRegion(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setPort(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.protocol_gwmp_mapping_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.protocol_gwmp_mapping_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.protocol_gwmp_mapping_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.protocol_gwmp_mapping_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRegion();
  if (f !== 0.0) {
    writer.writeEnum(
      1,
      f
    );
  }
  f = message.getPort();
  if (f !== 0) {
    writer.writeUint32(
      2,
      f
    );
  }
};


/**
 * optional helium.region region = 1;
 * @return {!proto.helium.region}
 */
proto.helium.iot_config.protocol_gwmp_mapping_v1.prototype.getRegion = function() {
  return /** @type {!proto.helium.region} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {!proto.helium.region} value
 * @return {!proto.helium.iot_config.protocol_gwmp_mapping_v1} returns this
 */
proto.helium.iot_config.protocol_gwmp_mapping_v1.prototype.setRegion = function(value) {
  return jspb.Message.setProto3EnumField(this, 1, value);
};


/**
 * optional uint32 port = 2;
 * @return {number}
 */
proto.helium.iot_config.protocol_gwmp_mapping_v1.prototype.getPort = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.protocol_gwmp_mapping_v1} returns this
 */
proto.helium.iot_config.protocol_gwmp_mapping_v1.prototype.setPort = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};



/**
 * List of repeated fields within this message type.
 * @private {!Array<number>}
 * @const
 */
proto.helium.iot_config.protocol_gwmp_v1.repeatedFields_ = [1];



if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.protocol_gwmp_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.protocol_gwmp_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.protocol_gwmp_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.protocol_gwmp_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    mappingList: jspb.Message.toObjectList(msg.getMappingList(),
    proto.helium.iot_config.protocol_gwmp_mapping_v1.toObject, includeInstance)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.protocol_gwmp_v1}
 */
proto.helium.iot_config.protocol_gwmp_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.protocol_gwmp_v1;
  return proto.helium.iot_config.protocol_gwmp_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.protocol_gwmp_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.protocol_gwmp_v1}
 */
proto.helium.iot_config.protocol_gwmp_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = new proto.helium.iot_config.protocol_gwmp_mapping_v1;
      reader.readMessage(value,proto.helium.iot_config.protocol_gwmp_mapping_v1.deserializeBinaryFromReader);
      msg.addMapping(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.protocol_gwmp_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.protocol_gwmp_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.protocol_gwmp_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.protocol_gwmp_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getMappingList();
  if (f.length > 0) {
    writer.writeRepeatedMessage(
      1,
      f,
      proto.helium.iot_config.protocol_gwmp_mapping_v1.serializeBinaryToWriter
    );
  }
};


/**
 * repeated protocol_gwmp_mapping_v1 mapping = 1;
 * @return {!Array<!proto.helium.iot_config.protocol_gwmp_mapping_v1>}
 */
proto.helium.iot_config.protocol_gwmp_v1.prototype.getMappingList = function() {
  return /** @type{!Array<!proto.helium.iot_config.protocol_gwmp_mapping_v1>} */ (
    jspb.Message.getRepeatedWrapperField(this, proto.helium.iot_config.protocol_gwmp_mapping_v1, 1));
};


/**
 * @param {!Array<!proto.helium.iot_config.protocol_gwmp_mapping_v1>} value
 * @return {!proto.helium.iot_config.protocol_gwmp_v1} returns this
*/
proto.helium.iot_config.protocol_gwmp_v1.prototype.setMappingList = function(value) {
  return jspb.Message.setRepeatedWrapperField(this, 1, value);
};


/**
 * @param {!proto.helium.iot_config.protocol_gwmp_mapping_v1=} opt_value
 * @param {number=} opt_index
 * @return {!proto.helium.iot_config.protocol_gwmp_mapping_v1}
 */
proto.helium.iot_config.protocol_gwmp_v1.prototype.addMapping = function(opt_value, opt_index) {
  return jspb.Message.addToRepeatedWrapperField(this, 1, opt_value, proto.helium.iot_config.protocol_gwmp_mapping_v1, opt_index);
};


/**
 * Clears the list making it empty but non-null.
 * @return {!proto.helium.iot_config.protocol_gwmp_v1} returns this
 */
proto.helium.iot_config.protocol_gwmp_v1.prototype.clearMappingList = function() {
  return this.setMappingList([]);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.protocol_http_roaming_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.protocol_http_roaming_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.protocol_http_roaming_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.protocol_http_roaming_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    flowType: jspb.Message.getFieldWithDefault(msg, 1, 0),
    dedupeTimeout: jspb.Message.getFieldWithDefault(msg, 2, 0),
    path: jspb.Message.getFieldWithDefault(msg, 3, ""),
    authHeader: jspb.Message.getFieldWithDefault(msg, 4, ""),
    receiverNsid: jspb.Message.getFieldWithDefault(msg, 5, "")
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.protocol_http_roaming_v1}
 */
proto.helium.iot_config.protocol_http_roaming_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.protocol_http_roaming_v1;
  return proto.helium.iot_config.protocol_http_roaming_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.protocol_http_roaming_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.protocol_http_roaming_v1}
 */
proto.helium.iot_config.protocol_http_roaming_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!proto.helium.iot_config.protocol_http_roaming_v1.flow_type_v1} */ (reader.readEnum());
      msg.setFlowType(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setDedupeTimeout(value);
      break;
    case 3:
      var value = /** @type {string} */ (reader.readString());
      msg.setPath(value);
      break;
    case 4:
      var value = /** @type {string} */ (reader.readString());
      msg.setAuthHeader(value);
      break;
    case 5:
      var value = /** @type {string} */ (reader.readString());
      msg.setReceiverNsid(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.protocol_http_roaming_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.protocol_http_roaming_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.protocol_http_roaming_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.protocol_http_roaming_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getFlowType();
  if (f !== 0.0) {
    writer.writeEnum(
      1,
      f
    );
  }
  f = message.getDedupeTimeout();
  if (f !== 0) {
    writer.writeUint32(
      2,
      f
    );
  }
  f = message.getPath();
  if (f.length > 0) {
    writer.writeString(
      3,
      f
    );
  }
  f = message.getAuthHeader();
  if (f.length > 0) {
    writer.writeString(
      4,
      f
    );
  }
  f = message.getReceiverNsid();
  if (f.length > 0) {
    writer.writeString(
      5,
      f
    );
  }
};


/**
 * @enum {number}
 */
proto.helium.iot_config.protocol_http_roaming_v1.flow_type_v1 = {
  SYNC: 0,
  ASYNC: 1
};

/**
 * optional flow_type_v1 flow_type = 1;
 * @return {!proto.helium.iot_config.protocol_http_roaming_v1.flow_type_v1}
 */
proto.helium.iot_config.protocol_http_roaming_v1.prototype.getFlowType = function() {
  return /** @type {!proto.helium.iot_config.protocol_http_roaming_v1.flow_type_v1} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {!proto.helium.iot_config.protocol_http_roaming_v1.flow_type_v1} value
 * @return {!proto.helium.iot_config.protocol_http_roaming_v1} returns this
 */
proto.helium.iot_config.protocol_http_roaming_v1.prototype.setFlowType = function(value) {
  return jspb.Message.setProto3EnumField(this, 1, value);
};


/**
 * optional uint32 dedupe_timeout = 2;
 * @return {number}
 */
proto.helium.iot_config.protocol_http_roaming_v1.prototype.getDedupeTimeout = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.protocol_http_roaming_v1} returns this
 */
proto.helium.iot_config.protocol_http_roaming_v1.prototype.setDedupeTimeout = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional string path = 3;
 * @return {string}
 */
proto.helium.iot_config.protocol_http_roaming_v1.prototype.getPath = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.protocol_http_roaming_v1} returns this
 */
proto.helium.iot_config.protocol_http_roaming_v1.prototype.setPath = function(value) {
  return jspb.Message.setProto3StringField(this, 3, value);
};


/**
 * optional string auth_header = 4;
 * @return {string}
 */
proto.helium.iot_config.protocol_http_roaming_v1.prototype.getAuthHeader = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.protocol_http_roaming_v1} returns this
 */
proto.helium.iot_config.protocol_http_roaming_v1.prototype.setAuthHeader = function(value) {
  return jspb.Message.setProto3StringField(this, 4, value);
};


/**
 * optional string receiver_nsid = 5;
 * @return {string}
 */
proto.helium.iot_config.protocol_http_roaming_v1.prototype.getReceiverNsid = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 5, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.protocol_http_roaming_v1} returns this
 */
proto.helium.iot_config.protocol_http_roaming_v1.prototype.setReceiverNsid = function(value) {
  return jspb.Message.setProto3StringField(this, 5, value);
};



/**
 * Oneof group definitions for this message. Each group defines the field
 * numbers belonging to that group. When of these fields' value is set, all
 * other fields in the group are cleared. During deserialization, if multiple
 * fields are encountered for a group, only the last value seen will be kept.
 * @private {!Array<!Array<number>>}
 * @const
 */
proto.helium.iot_config.server_v1.oneofGroups_ = [[3,4,5]];

/**
 * @enum {number}
 */
proto.helium.iot_config.server_v1.ProtocolCase = {
  PROTOCOL_NOT_SET: 0,
  PACKET_ROUTER: 3,
  GWMP: 4,
  HTTP_ROAMING: 5
};

/**
 * @return {proto.helium.iot_config.server_v1.ProtocolCase}
 */
proto.helium.iot_config.server_v1.prototype.getProtocolCase = function() {
  return /** @type {proto.helium.iot_config.server_v1.ProtocolCase} */(jspb.Message.computeOneofCase(this, proto.helium.iot_config.server_v1.oneofGroups_[0]));
};



if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.server_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.server_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.server_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.server_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    host: jspb.Message.getFieldWithDefault(msg, 1, ""),
    port: jspb.Message.getFieldWithDefault(msg, 2, 0),
    packetRouter: (f = msg.getPacketRouter()) && proto.helium.iot_config.protocol_packet_router_v1.toObject(includeInstance, f),
    gwmp: (f = msg.getGwmp()) && proto.helium.iot_config.protocol_gwmp_v1.toObject(includeInstance, f),
    httpRoaming: (f = msg.getHttpRoaming()) && proto.helium.iot_config.protocol_http_roaming_v1.toObject(includeInstance, f)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.server_v1}
 */
proto.helium.iot_config.server_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.server_v1;
  return proto.helium.iot_config.server_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.server_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.server_v1}
 */
proto.helium.iot_config.server_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {string} */ (reader.readString());
      msg.setHost(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setPort(value);
      break;
    case 3:
      var value = new proto.helium.iot_config.protocol_packet_router_v1;
      reader.readMessage(value,proto.helium.iot_config.protocol_packet_router_v1.deserializeBinaryFromReader);
      msg.setPacketRouter(value);
      break;
    case 4:
      var value = new proto.helium.iot_config.protocol_gwmp_v1;
      reader.readMessage(value,proto.helium.iot_config.protocol_gwmp_v1.deserializeBinaryFromReader);
      msg.setGwmp(value);
      break;
    case 5:
      var value = new proto.helium.iot_config.protocol_http_roaming_v1;
      reader.readMessage(value,proto.helium.iot_config.protocol_http_roaming_v1.deserializeBinaryFromReader);
      msg.setHttpRoaming(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.server_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.server_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.server_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.server_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getHost();
  if (f.length > 0) {
    writer.writeString(
      1,
      f
    );
  }
  f = message.getPort();
  if (f !== 0) {
    writer.writeUint32(
      2,
      f
    );
  }
  f = message.getPacketRouter();
  if (f != null) {
    writer.writeMessage(
      3,
      f,
      proto.helium.iot_config.protocol_packet_router_v1.serializeBinaryToWriter
    );
  }
  f = message.getGwmp();
  if (f != null) {
    writer.writeMessage(
      4,
      f,
      proto.helium.iot_config.protocol_gwmp_v1.serializeBinaryToWriter
    );
  }
  f = message.getHttpRoaming();
  if (f != null) {
    writer.writeMessage(
      5,
      f,
      proto.helium.iot_config.protocol_http_roaming_v1.serializeBinaryToWriter
    );
  }
};


/**
 * optional string host = 1;
 * @return {string}
 */
proto.helium.iot_config.server_v1.prototype.getHost = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.server_v1} returns this
 */
proto.helium.iot_config.server_v1.prototype.setHost = function(value) {
  return jspb.Message.setProto3StringField(this, 1, value);
};


/**
 * optional uint32 port = 2;
 * @return {number}
 */
proto.helium.iot_config.server_v1.prototype.getPort = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.server_v1} returns this
 */
proto.helium.iot_config.server_v1.prototype.setPort = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional protocol_packet_router_v1 packet_router = 3;
 * @return {?proto.helium.iot_config.protocol_packet_router_v1}
 */
proto.helium.iot_config.server_v1.prototype.getPacketRouter = function() {
  return /** @type{?proto.helium.iot_config.protocol_packet_router_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.protocol_packet_router_v1, 3));
};


/**
 * @param {?proto.helium.iot_config.protocol_packet_router_v1|undefined} value
 * @return {!proto.helium.iot_config.server_v1} returns this
*/
proto.helium.iot_config.server_v1.prototype.setPacketRouter = function(value) {
  return jspb.Message.setOneofWrapperField(this, 3, proto.helium.iot_config.server_v1.oneofGroups_[0], value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.server_v1} returns this
 */
proto.helium.iot_config.server_v1.prototype.clearPacketRouter = function() {
  return this.setPacketRouter(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.server_v1.prototype.hasPacketRouter = function() {
  return jspb.Message.getField(this, 3) != null;
};


/**
 * optional protocol_gwmp_v1 gwmp = 4;
 * @return {?proto.helium.iot_config.protocol_gwmp_v1}
 */
proto.helium.iot_config.server_v1.prototype.getGwmp = function() {
  return /** @type{?proto.helium.iot_config.protocol_gwmp_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.protocol_gwmp_v1, 4));
};


/**
 * @param {?proto.helium.iot_config.protocol_gwmp_v1|undefined} value
 * @return {!proto.helium.iot_config.server_v1} returns this
*/
proto.helium.iot_config.server_v1.prototype.setGwmp = function(value) {
  return jspb.Message.setOneofWrapperField(this, 4, proto.helium.iot_config.server_v1.oneofGroups_[0], value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.server_v1} returns this
 */
proto.helium.iot_config.server_v1.prototype.clearGwmp = function() {
  return this.setGwmp(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.server_v1.prototype.hasGwmp = function() {
  return jspb.Message.getField(this, 4) != null;
};


/**
 * optional protocol_http_roaming_v1 http_roaming = 5;
 * @return {?proto.helium.iot_config.protocol_http_roaming_v1}
 */
proto.helium.iot_config.server_v1.prototype.getHttpRoaming = function() {
  return /** @type{?proto.helium.iot_config.protocol_http_roaming_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.protocol_http_roaming_v1, 5));
};


/**
 * @param {?proto.helium.iot_config.protocol_http_roaming_v1|undefined} value
 * @return {!proto.helium.iot_config.server_v1} returns this
*/
proto.helium.iot_config.server_v1.prototype.setHttpRoaming = function(value) {
  return jspb.Message.setOneofWrapperField(this, 5, proto.helium.iot_config.server_v1.oneofGroups_[0], value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.server_v1} returns this
 */
proto.helium.iot_config.server_v1.prototype.clearHttpRoaming = function() {
  return this.setHttpRoaming(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.server_v1.prototype.hasHttpRoaming = function() {
  return jspb.Message.getField(this, 5) != null;
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    id: jspb.Message.getFieldWithDefault(msg, 1, ""),
    netId: jspb.Message.getFieldWithDefault(msg, 2, 0),
    oui: jspb.Message.getFieldWithDefault(msg, 3, 0),
    server: (f = msg.getServer()) && proto.helium.iot_config.server_v1.toObject(includeInstance, f),
    maxCopies: jspb.Message.getFieldWithDefault(msg, 5, 0),
    active: jspb.Message.getBooleanFieldWithDefault(msg, 6, false),
    locked: jspb.Message.getBooleanFieldWithDefault(msg, 7, false),
    ignoreEmptySkf: jspb.Message.getBooleanFieldWithDefault(msg, 8, false)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_v1}
 */
proto.helium.iot_config.route_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_v1;
  return proto.helium.iot_config.route_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_v1}
 */
proto.helium.iot_config.route_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {string} */ (reader.readString());
      msg.setId(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setNetId(value);
      break;
    case 3:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setOui(value);
      break;
    case 4:
      var value = new proto.helium.iot_config.server_v1;
      reader.readMessage(value,proto.helium.iot_config.server_v1.deserializeBinaryFromReader);
      msg.setServer(value);
      break;
    case 5:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setMaxCopies(value);
      break;
    case 6:
      var value = /** @type {boolean} */ (reader.readBool());
      msg.setActive(value);
      break;
    case 7:
      var value = /** @type {boolean} */ (reader.readBool());
      msg.setLocked(value);
      break;
    case 8:
      var value = /** @type {boolean} */ (reader.readBool());
      msg.setIgnoreEmptySkf(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getId();
  if (f.length > 0) {
    writer.writeString(
      1,
      f
    );
  }
  f = message.getNetId();
  if (f !== 0) {
    writer.writeUint32(
      2,
      f
    );
  }
  f = message.getOui();
  if (f !== 0) {
    writer.writeUint64(
      3,
      f
    );
  }
  f = message.getServer();
  if (f != null) {
    writer.writeMessage(
      4,
      f,
      proto.helium.iot_config.server_v1.serializeBinaryToWriter
    );
  }
  f = message.getMaxCopies();
  if (f !== 0) {
    writer.writeUint32(
      5,
      f
    );
  }
  f = message.getActive();
  if (f) {
    writer.writeBool(
      6,
      f
    );
  }
  f = message.getLocked();
  if (f) {
    writer.writeBool(
      7,
      f
    );
  }
  f = message.getIgnoreEmptySkf();
  if (f) {
    writer.writeBool(
      8,
      f
    );
  }
};


/**
 * optional string id = 1;
 * @return {string}
 */
proto.helium.iot_config.route_v1.prototype.getId = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.route_v1} returns this
 */
proto.helium.iot_config.route_v1.prototype.setId = function(value) {
  return jspb.Message.setProto3StringField(this, 1, value);
};


/**
 * optional uint32 net_id = 2;
 * @return {number}
 */
proto.helium.iot_config.route_v1.prototype.getNetId = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_v1} returns this
 */
proto.helium.iot_config.route_v1.prototype.setNetId = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional uint64 oui = 3;
 * @return {number}
 */
proto.helium.iot_config.route_v1.prototype.getOui = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 3, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_v1} returns this
 */
proto.helium.iot_config.route_v1.prototype.setOui = function(value) {
  return jspb.Message.setProto3IntField(this, 3, value);
};


/**
 * optional server_v1 server = 4;
 * @return {?proto.helium.iot_config.server_v1}
 */
proto.helium.iot_config.route_v1.prototype.getServer = function() {
  return /** @type{?proto.helium.iot_config.server_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.server_v1, 4));
};


/**
 * @param {?proto.helium.iot_config.server_v1|undefined} value
 * @return {!proto.helium.iot_config.route_v1} returns this
*/
proto.helium.iot_config.route_v1.prototype.setServer = function(value) {
  return jspb.Message.setWrapperField(this, 4, value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.route_v1} returns this
 */
proto.helium.iot_config.route_v1.prototype.clearServer = function() {
  return this.setServer(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.route_v1.prototype.hasServer = function() {
  return jspb.Message.getField(this, 4) != null;
};


/**
 * optional uint32 max_copies = 5;
 * @return {number}
 */
proto.helium.iot_config.route_v1.prototype.getMaxCopies = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 5, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_v1} returns this
 */
proto.helium.iot_config.route_v1.prototype.setMaxCopies = function(value) {
  return jspb.Message.setProto3IntField(this, 5, value);
};


/**
 * optional bool active = 6;
 * @return {boolean}
 */
proto.helium.iot_config.route_v1.prototype.getActive = function() {
  return /** @type {boolean} */ (jspb.Message.getBooleanFieldWithDefault(this, 6, false));
};


/**
 * @param {boolean} value
 * @return {!proto.helium.iot_config.route_v1} returns this
 */
proto.helium.iot_config.route_v1.prototype.setActive = function(value) {
  return jspb.Message.setProto3BooleanField(this, 6, value);
};


/**
 * optional bool locked = 7;
 * @return {boolean}
 */
proto.helium.iot_config.route_v1.prototype.getLocked = function() {
  return /** @type {boolean} */ (jspb.Message.getBooleanFieldWithDefault(this, 7, false));
};


/**
 * @param {boolean} value
 * @return {!proto.helium.iot_config.route_v1} returns this
 */
proto.helium.iot_config.route_v1.prototype.setLocked = function(value) {
  return jspb.Message.setProto3BooleanField(this, 7, value);
};


/**
 * optional bool ignore_empty_skf = 8;
 * @return {boolean}
 */
proto.helium.iot_config.route_v1.prototype.getIgnoreEmptySkf = function() {
  return /** @type {boolean} */ (jspb.Message.getBooleanFieldWithDefault(this, 8, false));
};


/**
 * @param {boolean} value
 * @return {!proto.helium.iot_config.route_v1} returns this
 */
proto.helium.iot_config.route_v1.prototype.setIgnoreEmptySkf = function(value) {
  return jspb.Message.setProto3BooleanField(this, 8, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.org_list_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.org_list_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.org_list_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_list_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {

  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.org_list_req_v1}
 */
proto.helium.iot_config.org_list_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.org_list_req_v1;
  return proto.helium.iot_config.org_list_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.org_list_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.org_list_req_v1}
 */
proto.helium.iot_config.org_list_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_list_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.org_list_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.org_list_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_list_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
};



/**
 * List of repeated fields within this message type.
 * @private {!Array<number>}
 * @const
 */
proto.helium.iot_config.org_list_res_v1.repeatedFields_ = [1];



if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.org_list_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.org_list_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.org_list_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_list_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    orgsList: jspb.Message.toObjectList(msg.getOrgsList(),
    proto.helium.iot_config.org_v1.toObject, includeInstance),
    timestamp: jspb.Message.getFieldWithDefault(msg, 2, 0),
    signer: msg.getSigner_asB64(),
    signature: msg.getSignature_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.org_list_res_v1}
 */
proto.helium.iot_config.org_list_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.org_list_res_v1;
  return proto.helium.iot_config.org_list_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.org_list_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.org_list_res_v1}
 */
proto.helium.iot_config.org_list_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = new proto.helium.iot_config.org_v1;
      reader.readMessage(value,proto.helium.iot_config.org_v1.deserializeBinaryFromReader);
      msg.addOrgs(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_list_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.org_list_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.org_list_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_list_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getOrgsList();
  if (f.length > 0) {
    writer.writeRepeatedMessage(
      1,
      f,
      proto.helium.iot_config.org_v1.serializeBinaryToWriter
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      2,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * repeated org_v1 orgs = 1;
 * @return {!Array<!proto.helium.iot_config.org_v1>}
 */
proto.helium.iot_config.org_list_res_v1.prototype.getOrgsList = function() {
  return /** @type{!Array<!proto.helium.iot_config.org_v1>} */ (
    jspb.Message.getRepeatedWrapperField(this, proto.helium.iot_config.org_v1, 1));
};


/**
 * @param {!Array<!proto.helium.iot_config.org_v1>} value
 * @return {!proto.helium.iot_config.org_list_res_v1} returns this
*/
proto.helium.iot_config.org_list_res_v1.prototype.setOrgsList = function(value) {
  return jspb.Message.setRepeatedWrapperField(this, 1, value);
};


/**
 * @param {!proto.helium.iot_config.org_v1=} opt_value
 * @param {number=} opt_index
 * @return {!proto.helium.iot_config.org_v1}
 */
proto.helium.iot_config.org_list_res_v1.prototype.addOrgs = function(opt_value, opt_index) {
  return jspb.Message.addToRepeatedWrapperField(this, 1, opt_value, proto.helium.iot_config.org_v1, opt_index);
};


/**
 * Clears the list making it empty but non-null.
 * @return {!proto.helium.iot_config.org_list_res_v1} returns this
 */
proto.helium.iot_config.org_list_res_v1.prototype.clearOrgsList = function() {
  return this.setOrgsList([]);
};


/**
 * optional uint64 timestamp = 2;
 * @return {number}
 */
proto.helium.iot_config.org_list_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_list_res_v1} returns this
 */
proto.helium.iot_config.org_list_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional bytes signer = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_list_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signer = 3;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.org_list_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_list_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_list_res_v1} returns this
 */
proto.helium.iot_config.org_list_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signature = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_list_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signature = 4;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.org_list_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_list_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_list_res_v1} returns this
 */
proto.helium.iot_config.org_list_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.org_get_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.org_get_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.org_get_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_get_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    oui: jspb.Message.getFieldWithDefault(msg, 1, 0)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.org_get_req_v1}
 */
proto.helium.iot_config.org_get_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.org_get_req_v1;
  return proto.helium.iot_config.org_get_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.org_get_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.org_get_req_v1}
 */
proto.helium.iot_config.org_get_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setOui(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_get_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.org_get_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.org_get_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_get_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getOui();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
};


/**
 * optional uint64 oui = 1;
 * @return {number}
 */
proto.helium.iot_config.org_get_req_v1.prototype.getOui = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_get_req_v1} returns this
 */
proto.helium.iot_config.org_get_req_v1.prototype.setOui = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};



/**
 * List of repeated fields within this message type.
 * @private {!Array<number>}
 * @const
 */
proto.helium.iot_config.org_create_helium_req_v1.repeatedFields_ = [6];



if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.org_create_helium_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.org_create_helium_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_create_helium_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    owner: msg.getOwner_asB64(),
    payer: msg.getPayer_asB64(),
    devaddrs: jspb.Message.getFieldWithDefault(msg, 3, 0),
    timestamp: jspb.Message.getFieldWithDefault(msg, 4, 0),
    signature: msg.getSignature_asB64(),
    delegateKeysList: msg.getDelegateKeysList_asB64(),
    signer: msg.getSigner_asB64(),
    netId: jspb.Message.getFieldWithDefault(msg, 8, 0)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.org_create_helium_req_v1}
 */
proto.helium.iot_config.org_create_helium_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.org_create_helium_req_v1;
  return proto.helium.iot_config.org_create_helium_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.org_create_helium_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.org_create_helium_req_v1}
 */
proto.helium.iot_config.org_create_helium_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setOwner(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setPayer(value);
      break;
    case 3:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setDevaddrs(value);
      break;
    case 4:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 5:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 6:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.addDelegateKeys(value);
      break;
    case 7:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 8:
      var value = /** @type {!proto.helium.iot_config.org_create_helium_req_v1.helium_net_id} */ (reader.readEnum());
      msg.setNetId(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.org_create_helium_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.org_create_helium_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_create_helium_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getOwner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      1,
      f
    );
  }
  f = message.getPayer_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getDevaddrs();
  if (f !== 0) {
    writer.writeUint64(
      3,
      f
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      4,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      5,
      f
    );
  }
  f = message.getDelegateKeysList_asU8();
  if (f.length > 0) {
    writer.writeRepeatedBytes(
      6,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      7,
      f
    );
  }
  f = message.getNetId();
  if (f !== 0.0) {
    writer.writeEnum(
      8,
      f
    );
  }
};


/**
 * @enum {number}
 */
proto.helium.iot_config.org_create_helium_req_v1.helium_net_id = {
  TYPE0_0X00003C: 0,
  TYPE3_0X60002D: 1,
  TYPE6_0XC00053: 2
};

/**
 * optional bytes owner = 1;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getOwner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * optional bytes owner = 1;
 * This is a type-conversion wrapper around `getOwner()`
 * @return {string}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getOwner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getOwner()));
};


/**
 * optional bytes owner = 1;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getOwner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getOwner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getOwner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_create_helium_req_v1} returns this
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.setOwner = function(value) {
  return jspb.Message.setProto3BytesField(this, 1, value);
};


/**
 * optional bytes payer = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getPayer = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes payer = 2;
 * This is a type-conversion wrapper around `getPayer()`
 * @return {string}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getPayer_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getPayer()));
};


/**
 * optional bytes payer = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getPayer()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getPayer_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getPayer()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_create_helium_req_v1} returns this
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.setPayer = function(value) {
  return jspb.Message.setProto3BytesField(this, 2, value);
};


/**
 * optional uint64 devaddrs = 3;
 * @return {number}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getDevaddrs = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 3, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_create_helium_req_v1} returns this
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.setDevaddrs = function(value) {
  return jspb.Message.setProto3IntField(this, 3, value);
};


/**
 * optional uint64 timestamp = 4;
 * @return {number}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 4, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_create_helium_req_v1} returns this
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 4, value);
};


/**
 * optional bytes signature = 5;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 5, ""));
};


/**
 * optional bytes signature = 5;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 5;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_create_helium_req_v1} returns this
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 5, value);
};


/**
 * repeated bytes delegate_keys = 6;
 * @return {!(Array<!Uint8Array>|Array<string>)}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getDelegateKeysList = function() {
  return /** @type {!(Array<!Uint8Array>|Array<string>)} */ (jspb.Message.getRepeatedField(this, 6));
};


/**
 * repeated bytes delegate_keys = 6;
 * This is a type-conversion wrapper around `getDelegateKeysList()`
 * @return {!Array<string>}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getDelegateKeysList_asB64 = function() {
  return /** @type {!Array<string>} */ (jspb.Message.bytesListAsB64(
      this.getDelegateKeysList()));
};


/**
 * repeated bytes delegate_keys = 6;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getDelegateKeysList()`
 * @return {!Array<!Uint8Array>}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getDelegateKeysList_asU8 = function() {
  return /** @type {!Array<!Uint8Array>} */ (jspb.Message.bytesListAsU8(
      this.getDelegateKeysList()));
};


/**
 * @param {!(Array<!Uint8Array>|Array<string>)} value
 * @return {!proto.helium.iot_config.org_create_helium_req_v1} returns this
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.setDelegateKeysList = function(value) {
  return jspb.Message.setField(this, 6, value || []);
};


/**
 * @param {!(string|Uint8Array)} value
 * @param {number=} opt_index
 * @return {!proto.helium.iot_config.org_create_helium_req_v1} returns this
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.addDelegateKeys = function(value, opt_index) {
  return jspb.Message.addToRepeatedField(this, 6, value, opt_index);
};


/**
 * Clears the list making it empty but non-null.
 * @return {!proto.helium.iot_config.org_create_helium_req_v1} returns this
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.clearDelegateKeysList = function() {
  return this.setDelegateKeysList([]);
};


/**
 * optional bytes signer = 7;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 7, ""));
};


/**
 * optional bytes signer = 7;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 7;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_create_helium_req_v1} returns this
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 7, value);
};


/**
 * optional helium_net_id net_id = 8;
 * @return {!proto.helium.iot_config.org_create_helium_req_v1.helium_net_id}
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.getNetId = function() {
  return /** @type {!proto.helium.iot_config.org_create_helium_req_v1.helium_net_id} */ (jspb.Message.getFieldWithDefault(this, 8, 0));
};


/**
 * @param {!proto.helium.iot_config.org_create_helium_req_v1.helium_net_id} value
 * @return {!proto.helium.iot_config.org_create_helium_req_v1} returns this
 */
proto.helium.iot_config.org_create_helium_req_v1.prototype.setNetId = function(value) {
  return jspb.Message.setProto3EnumField(this, 8, value);
};



/**
 * List of repeated fields within this message type.
 * @private {!Array<number>}
 * @const
 */
proto.helium.iot_config.org_create_roamer_req_v1.repeatedFields_ = [6];



if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.org_create_roamer_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.org_create_roamer_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_create_roamer_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    owner: msg.getOwner_asB64(),
    payer: msg.getPayer_asB64(),
    netId: jspb.Message.getFieldWithDefault(msg, 3, 0),
    timestamp: jspb.Message.getFieldWithDefault(msg, 4, 0),
    signature: msg.getSignature_asB64(),
    delegateKeysList: msg.getDelegateKeysList_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.org_create_roamer_req_v1}
 */
proto.helium.iot_config.org_create_roamer_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.org_create_roamer_req_v1;
  return proto.helium.iot_config.org_create_roamer_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.org_create_roamer_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.org_create_roamer_req_v1}
 */
proto.helium.iot_config.org_create_roamer_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setOwner(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setPayer(value);
      break;
    case 3:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setNetId(value);
      break;
    case 4:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 5:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 6:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.addDelegateKeys(value);
      break;
    case 7:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.org_create_roamer_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.org_create_roamer_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_create_roamer_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getOwner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      1,
      f
    );
  }
  f = message.getPayer_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getNetId();
  if (f !== 0) {
    writer.writeUint32(
      3,
      f
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      4,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      5,
      f
    );
  }
  f = message.getDelegateKeysList_asU8();
  if (f.length > 0) {
    writer.writeRepeatedBytes(
      6,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      7,
      f
    );
  }
};


/**
 * optional bytes owner = 1;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getOwner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * optional bytes owner = 1;
 * This is a type-conversion wrapper around `getOwner()`
 * @return {string}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getOwner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getOwner()));
};


/**
 * optional bytes owner = 1;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getOwner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getOwner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getOwner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_create_roamer_req_v1} returns this
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.setOwner = function(value) {
  return jspb.Message.setProto3BytesField(this, 1, value);
};


/**
 * optional bytes payer = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getPayer = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes payer = 2;
 * This is a type-conversion wrapper around `getPayer()`
 * @return {string}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getPayer_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getPayer()));
};


/**
 * optional bytes payer = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getPayer()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getPayer_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getPayer()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_create_roamer_req_v1} returns this
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.setPayer = function(value) {
  return jspb.Message.setProto3BytesField(this, 2, value);
};


/**
 * optional uint32 net_id = 3;
 * @return {number}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getNetId = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 3, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_create_roamer_req_v1} returns this
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.setNetId = function(value) {
  return jspb.Message.setProto3IntField(this, 3, value);
};


/**
 * optional uint64 timestamp = 4;
 * @return {number}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 4, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_create_roamer_req_v1} returns this
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 4, value);
};


/**
 * optional bytes signature = 5;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 5, ""));
};


/**
 * optional bytes signature = 5;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 5;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_create_roamer_req_v1} returns this
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 5, value);
};


/**
 * repeated bytes delegate_keys = 6;
 * @return {!(Array<!Uint8Array>|Array<string>)}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getDelegateKeysList = function() {
  return /** @type {!(Array<!Uint8Array>|Array<string>)} */ (jspb.Message.getRepeatedField(this, 6));
};


/**
 * repeated bytes delegate_keys = 6;
 * This is a type-conversion wrapper around `getDelegateKeysList()`
 * @return {!Array<string>}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getDelegateKeysList_asB64 = function() {
  return /** @type {!Array<string>} */ (jspb.Message.bytesListAsB64(
      this.getDelegateKeysList()));
};


/**
 * repeated bytes delegate_keys = 6;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getDelegateKeysList()`
 * @return {!Array<!Uint8Array>}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getDelegateKeysList_asU8 = function() {
  return /** @type {!Array<!Uint8Array>} */ (jspb.Message.bytesListAsU8(
      this.getDelegateKeysList()));
};


/**
 * @param {!(Array<!Uint8Array>|Array<string>)} value
 * @return {!proto.helium.iot_config.org_create_roamer_req_v1} returns this
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.setDelegateKeysList = function(value) {
  return jspb.Message.setField(this, 6, value || []);
};


/**
 * @param {!(string|Uint8Array)} value
 * @param {number=} opt_index
 * @return {!proto.helium.iot_config.org_create_roamer_req_v1} returns this
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.addDelegateKeys = function(value, opt_index) {
  return jspb.Message.addToRepeatedField(this, 6, value, opt_index);
};


/**
 * Clears the list making it empty but non-null.
 * @return {!proto.helium.iot_config.org_create_roamer_req_v1} returns this
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.clearDelegateKeysList = function() {
  return this.setDelegateKeysList([]);
};


/**
 * optional bytes signer = 7;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 7, ""));
};


/**
 * optional bytes signer = 7;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 7;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_create_roamer_req_v1} returns this
 */
proto.helium.iot_config.org_create_roamer_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 7, value);
};



/**
 * List of repeated fields within this message type.
 * @private {!Array<number>}
 * @const
 */
proto.helium.iot_config.org_update_req_v1.repeatedFields_ = [2];



if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.org_update_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.org_update_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.org_update_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_update_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    oui: jspb.Message.getFieldWithDefault(msg, 1, 0),
    updatesList: jspb.Message.toObjectList(msg.getUpdatesList(),
    proto.helium.iot_config.org_update_req_v1.update_v1.toObject, includeInstance),
    timestamp: jspb.Message.getFieldWithDefault(msg, 3, 0),
    signer: msg.getSigner_asB64(),
    signature: msg.getSignature_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.org_update_req_v1}
 */
proto.helium.iot_config.org_update_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.org_update_req_v1;
  return proto.helium.iot_config.org_update_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.org_update_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.org_update_req_v1}
 */
proto.helium.iot_config.org_update_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setOui(value);
      break;
    case 2:
      var value = new proto.helium.iot_config.org_update_req_v1.update_v1;
      reader.readMessage(value,proto.helium.iot_config.org_update_req_v1.update_v1.deserializeBinaryFromReader);
      msg.addUpdates(value);
      break;
    case 3:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 5:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_update_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.org_update_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.org_update_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_update_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getOui();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getUpdatesList();
  if (f.length > 0) {
    writer.writeRepeatedMessage(
      2,
      f,
      proto.helium.iot_config.org_update_req_v1.update_v1.serializeBinaryToWriter
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      3,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      5,
      f
    );
  }
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    delegateKey: msg.getDelegateKey_asB64(),
    action: jspb.Message.getFieldWithDefault(msg, 2, 0)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1}
 */
proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1;
  return proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1}
 */
proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setDelegateKey(value);
      break;
    case 2:
      var value = /** @type {!proto.helium.iot_config.action_v1} */ (reader.readEnum());
      msg.setAction(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getDelegateKey_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      1,
      f
    );
  }
  f = message.getAction();
  if (f !== 0.0) {
    writer.writeEnum(
      2,
      f
    );
  }
};


/**
 * optional bytes delegate_key = 1;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.prototype.getDelegateKey = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * optional bytes delegate_key = 1;
 * This is a type-conversion wrapper around `getDelegateKey()`
 * @return {string}
 */
proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.prototype.getDelegateKey_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getDelegateKey()));
};


/**
 * optional bytes delegate_key = 1;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getDelegateKey()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.prototype.getDelegateKey_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getDelegateKey()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.prototype.setDelegateKey = function(value) {
  return jspb.Message.setProto3BytesField(this, 1, value);
};


/**
 * optional action_v1 action = 2;
 * @return {!proto.helium.iot_config.action_v1}
 */
proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.prototype.getAction = function() {
  return /** @type {!proto.helium.iot_config.action_v1} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {!proto.helium.iot_config.action_v1} value
 * @return {!proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.prototype.setAction = function(value) {
  return jspb.Message.setProto3EnumField(this, 2, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    constraint: (f = msg.getConstraint()) && proto.helium.iot_config.devaddr_constraint_v1.toObject(includeInstance, f),
    action: jspb.Message.getFieldWithDefault(msg, 2, 0)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1}
 */
proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1;
  return proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1}
 */
proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = new proto.helium.iot_config.devaddr_constraint_v1;
      reader.readMessage(value,proto.helium.iot_config.devaddr_constraint_v1.deserializeBinaryFromReader);
      msg.setConstraint(value);
      break;
    case 2:
      var value = /** @type {!proto.helium.iot_config.action_v1} */ (reader.readEnum());
      msg.setAction(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getConstraint();
  if (f != null) {
    writer.writeMessage(
      1,
      f,
      proto.helium.iot_config.devaddr_constraint_v1.serializeBinaryToWriter
    );
  }
  f = message.getAction();
  if (f !== 0.0) {
    writer.writeEnum(
      2,
      f
    );
  }
};


/**
 * optional devaddr_constraint_v1 constraint = 1;
 * @return {?proto.helium.iot_config.devaddr_constraint_v1}
 */
proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.prototype.getConstraint = function() {
  return /** @type{?proto.helium.iot_config.devaddr_constraint_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.devaddr_constraint_v1, 1));
};


/**
 * @param {?proto.helium.iot_config.devaddr_constraint_v1|undefined} value
 * @return {!proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1} returns this
*/
proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.prototype.setConstraint = function(value) {
  return jspb.Message.setWrapperField(this, 1, value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.prototype.clearConstraint = function() {
  return this.setConstraint(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.prototype.hasConstraint = function() {
  return jspb.Message.getField(this, 1) != null;
};


/**
 * optional action_v1 action = 2;
 * @return {!proto.helium.iot_config.action_v1}
 */
proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.prototype.getAction = function() {
  return /** @type {!proto.helium.iot_config.action_v1} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {!proto.helium.iot_config.action_v1} value
 * @return {!proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.prototype.setAction = function(value) {
  return jspb.Message.setProto3EnumField(this, 2, value);
};



/**
 * Oneof group definitions for this message. Each group defines the field
 * numbers belonging to that group. When of these fields' value is set, all
 * other fields in the group are cleared. During deserialization, if multiple
 * fields are encountered for a group, only the last value seen will be kept.
 * @private {!Array<!Array<number>>}
 * @const
 */
proto.helium.iot_config.org_update_req_v1.update_v1.oneofGroups_ = [[1,2,3,4,5]];

/**
 * @enum {number}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.UpdateCase = {
  UPDATE_NOT_SET: 0,
  OWNER: 1,
  PAYER: 2,
  DELEGATE_KEY: 3,
  DEVADDRS: 4,
  CONSTRAINT: 5
};

/**
 * @return {proto.helium.iot_config.org_update_req_v1.update_v1.UpdateCase}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.getUpdateCase = function() {
  return /** @type {proto.helium.iot_config.org_update_req_v1.update_v1.UpdateCase} */(jspb.Message.computeOneofCase(this, proto.helium.iot_config.org_update_req_v1.update_v1.oneofGroups_[0]));
};



if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.org_update_req_v1.update_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.org_update_req_v1.update_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_update_req_v1.update_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    owner: msg.getOwner_asB64(),
    payer: msg.getPayer_asB64(),
    delegateKey: (f = msg.getDelegateKey()) && proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.toObject(includeInstance, f),
    devaddrs: jspb.Message.getFieldWithDefault(msg, 4, 0),
    constraint: (f = msg.getConstraint()) && proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.toObject(includeInstance, f)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.org_update_req_v1.update_v1}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.org_update_req_v1.update_v1;
  return proto.helium.iot_config.org_update_req_v1.update_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.org_update_req_v1.update_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.org_update_req_v1.update_v1}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setOwner(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setPayer(value);
      break;
    case 3:
      var value = new proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1;
      reader.readMessage(value,proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.deserializeBinaryFromReader);
      msg.setDelegateKey(value);
      break;
    case 4:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setDevaddrs(value);
      break;
    case 5:
      var value = new proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1;
      reader.readMessage(value,proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.deserializeBinaryFromReader);
      msg.setConstraint(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.org_update_req_v1.update_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.org_update_req_v1.update_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_update_req_v1.update_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = /** @type {!(string|Uint8Array)} */ (jspb.Message.getField(message, 1));
  if (f != null) {
    writer.writeBytes(
      1,
      f
    );
  }
  f = /** @type {!(string|Uint8Array)} */ (jspb.Message.getField(message, 2));
  if (f != null) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getDelegateKey();
  if (f != null) {
    writer.writeMessage(
      3,
      f,
      proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1.serializeBinaryToWriter
    );
  }
  f = /** @type {number} */ (jspb.Message.getField(message, 4));
  if (f != null) {
    writer.writeUint64(
      4,
      f
    );
  }
  f = message.getConstraint();
  if (f != null) {
    writer.writeMessage(
      5,
      f,
      proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1.serializeBinaryToWriter
    );
  }
};


/**
 * optional bytes owner = 1;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.getOwner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * optional bytes owner = 1;
 * This is a type-conversion wrapper around `getOwner()`
 * @return {string}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.getOwner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getOwner()));
};


/**
 * optional bytes owner = 1;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getOwner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.getOwner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getOwner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_update_req_v1.update_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.setOwner = function(value) {
  return jspb.Message.setOneofField(this, 1, proto.helium.iot_config.org_update_req_v1.update_v1.oneofGroups_[0], value);
};


/**
 * Clears the field making it undefined.
 * @return {!proto.helium.iot_config.org_update_req_v1.update_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.clearOwner = function() {
  return jspb.Message.setOneofField(this, 1, proto.helium.iot_config.org_update_req_v1.update_v1.oneofGroups_[0], undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.hasOwner = function() {
  return jspb.Message.getField(this, 1) != null;
};


/**
 * optional bytes payer = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.getPayer = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes payer = 2;
 * This is a type-conversion wrapper around `getPayer()`
 * @return {string}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.getPayer_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getPayer()));
};


/**
 * optional bytes payer = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getPayer()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.getPayer_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getPayer()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_update_req_v1.update_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.setPayer = function(value) {
  return jspb.Message.setOneofField(this, 2, proto.helium.iot_config.org_update_req_v1.update_v1.oneofGroups_[0], value);
};


/**
 * Clears the field making it undefined.
 * @return {!proto.helium.iot_config.org_update_req_v1.update_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.clearPayer = function() {
  return jspb.Message.setOneofField(this, 2, proto.helium.iot_config.org_update_req_v1.update_v1.oneofGroups_[0], undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.hasPayer = function() {
  return jspb.Message.getField(this, 2) != null;
};


/**
 * optional delegate_key_update_v1 delegate_key = 3;
 * @return {?proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.getDelegateKey = function() {
  return /** @type{?proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1, 3));
};


/**
 * @param {?proto.helium.iot_config.org_update_req_v1.delegate_key_update_v1|undefined} value
 * @return {!proto.helium.iot_config.org_update_req_v1.update_v1} returns this
*/
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.setDelegateKey = function(value) {
  return jspb.Message.setOneofWrapperField(this, 3, proto.helium.iot_config.org_update_req_v1.update_v1.oneofGroups_[0], value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.org_update_req_v1.update_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.clearDelegateKey = function() {
  return this.setDelegateKey(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.hasDelegateKey = function() {
  return jspb.Message.getField(this, 3) != null;
};


/**
 * optional uint64 devaddrs = 4;
 * @return {number}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.getDevaddrs = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 4, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_update_req_v1.update_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.setDevaddrs = function(value) {
  return jspb.Message.setOneofField(this, 4, proto.helium.iot_config.org_update_req_v1.update_v1.oneofGroups_[0], value);
};


/**
 * Clears the field making it undefined.
 * @return {!proto.helium.iot_config.org_update_req_v1.update_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.clearDevaddrs = function() {
  return jspb.Message.setOneofField(this, 4, proto.helium.iot_config.org_update_req_v1.update_v1.oneofGroups_[0], undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.hasDevaddrs = function() {
  return jspb.Message.getField(this, 4) != null;
};


/**
 * optional devaddr_constraint_update_v1 constraint = 5;
 * @return {?proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.getConstraint = function() {
  return /** @type{?proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1, 5));
};


/**
 * @param {?proto.helium.iot_config.org_update_req_v1.devaddr_constraint_update_v1|undefined} value
 * @return {!proto.helium.iot_config.org_update_req_v1.update_v1} returns this
*/
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.setConstraint = function(value) {
  return jspb.Message.setOneofWrapperField(this, 5, proto.helium.iot_config.org_update_req_v1.update_v1.oneofGroups_[0], value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.org_update_req_v1.update_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.clearConstraint = function() {
  return this.setConstraint(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.org_update_req_v1.update_v1.prototype.hasConstraint = function() {
  return jspb.Message.getField(this, 5) != null;
};


/**
 * optional uint64 oui = 1;
 * @return {number}
 */
proto.helium.iot_config.org_update_req_v1.prototype.getOui = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_update_req_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.prototype.setOui = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * repeated update_v1 updates = 2;
 * @return {!Array<!proto.helium.iot_config.org_update_req_v1.update_v1>}
 */
proto.helium.iot_config.org_update_req_v1.prototype.getUpdatesList = function() {
  return /** @type{!Array<!proto.helium.iot_config.org_update_req_v1.update_v1>} */ (
    jspb.Message.getRepeatedWrapperField(this, proto.helium.iot_config.org_update_req_v1.update_v1, 2));
};


/**
 * @param {!Array<!proto.helium.iot_config.org_update_req_v1.update_v1>} value
 * @return {!proto.helium.iot_config.org_update_req_v1} returns this
*/
proto.helium.iot_config.org_update_req_v1.prototype.setUpdatesList = function(value) {
  return jspb.Message.setRepeatedWrapperField(this, 2, value);
};


/**
 * @param {!proto.helium.iot_config.org_update_req_v1.update_v1=} opt_value
 * @param {number=} opt_index
 * @return {!proto.helium.iot_config.org_update_req_v1.update_v1}
 */
proto.helium.iot_config.org_update_req_v1.prototype.addUpdates = function(opt_value, opt_index) {
  return jspb.Message.addToRepeatedWrapperField(this, 2, opt_value, proto.helium.iot_config.org_update_req_v1.update_v1, opt_index);
};


/**
 * Clears the list making it empty but non-null.
 * @return {!proto.helium.iot_config.org_update_req_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.prototype.clearUpdatesList = function() {
  return this.setUpdatesList([]);
};


/**
 * optional uint64 timestamp = 3;
 * @return {number}
 */
proto.helium.iot_config.org_update_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 3, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_update_req_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 3, value);
};


/**
 * optional bytes signer = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_update_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signer = 4;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.org_update_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_update_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_update_req_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};


/**
 * optional bytes signature = 5;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_update_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 5, ""));
};


/**
 * optional bytes signature = 5;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.org_update_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 5;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_update_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_update_req_v1} returns this
 */
proto.helium.iot_config.org_update_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 5, value);
};



/**
 * List of repeated fields within this message type.
 * @private {!Array<number>}
 * @const
 */
proto.helium.iot_config.org_res_v1.repeatedFields_ = [3];



if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.org_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.org_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.org_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    org: (f = msg.getOrg()) && proto.helium.iot_config.org_v1.toObject(includeInstance, f),
    netId: jspb.Message.getFieldWithDefault(msg, 2, 0),
    devaddrConstraintsList: jspb.Message.toObjectList(msg.getDevaddrConstraintsList(),
    proto.helium.iot_config.devaddr_constraint_v1.toObject, includeInstance),
    timestamp: jspb.Message.getFieldWithDefault(msg, 4, 0),
    signer: msg.getSigner_asB64(),
    signature: msg.getSignature_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.org_res_v1}
 */
proto.helium.iot_config.org_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.org_res_v1;
  return proto.helium.iot_config.org_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.org_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.org_res_v1}
 */
proto.helium.iot_config.org_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = new proto.helium.iot_config.org_v1;
      reader.readMessage(value,proto.helium.iot_config.org_v1.deserializeBinaryFromReader);
      msg.setOrg(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setNetId(value);
      break;
    case 3:
      var value = new proto.helium.iot_config.devaddr_constraint_v1;
      reader.readMessage(value,proto.helium.iot_config.devaddr_constraint_v1.deserializeBinaryFromReader);
      msg.addDevaddrConstraints(value);
      break;
    case 4:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 5:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 6:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.org_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.org_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getOrg();
  if (f != null) {
    writer.writeMessage(
      1,
      f,
      proto.helium.iot_config.org_v1.serializeBinaryToWriter
    );
  }
  f = message.getNetId();
  if (f !== 0) {
    writer.writeUint32(
      2,
      f
    );
  }
  f = message.getDevaddrConstraintsList();
  if (f.length > 0) {
    writer.writeRepeatedMessage(
      3,
      f,
      proto.helium.iot_config.devaddr_constraint_v1.serializeBinaryToWriter
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      4,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      5,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      6,
      f
    );
  }
};


/**
 * optional org_v1 org = 1;
 * @return {?proto.helium.iot_config.org_v1}
 */
proto.helium.iot_config.org_res_v1.prototype.getOrg = function() {
  return /** @type{?proto.helium.iot_config.org_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.org_v1, 1));
};


/**
 * @param {?proto.helium.iot_config.org_v1|undefined} value
 * @return {!proto.helium.iot_config.org_res_v1} returns this
*/
proto.helium.iot_config.org_res_v1.prototype.setOrg = function(value) {
  return jspb.Message.setWrapperField(this, 1, value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.org_res_v1} returns this
 */
proto.helium.iot_config.org_res_v1.prototype.clearOrg = function() {
  return this.setOrg(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.org_res_v1.prototype.hasOrg = function() {
  return jspb.Message.getField(this, 1) != null;
};


/**
 * optional uint32 net_id = 2;
 * @return {number}
 */
proto.helium.iot_config.org_res_v1.prototype.getNetId = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_res_v1} returns this
 */
proto.helium.iot_config.org_res_v1.prototype.setNetId = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * repeated devaddr_constraint_v1 devaddr_constraints = 3;
 * @return {!Array<!proto.helium.iot_config.devaddr_constraint_v1>}
 */
proto.helium.iot_config.org_res_v1.prototype.getDevaddrConstraintsList = function() {
  return /** @type{!Array<!proto.helium.iot_config.devaddr_constraint_v1>} */ (
    jspb.Message.getRepeatedWrapperField(this, proto.helium.iot_config.devaddr_constraint_v1, 3));
};


/**
 * @param {!Array<!proto.helium.iot_config.devaddr_constraint_v1>} value
 * @return {!proto.helium.iot_config.org_res_v1} returns this
*/
proto.helium.iot_config.org_res_v1.prototype.setDevaddrConstraintsList = function(value) {
  return jspb.Message.setRepeatedWrapperField(this, 3, value);
};


/**
 * @param {!proto.helium.iot_config.devaddr_constraint_v1=} opt_value
 * @param {number=} opt_index
 * @return {!proto.helium.iot_config.devaddr_constraint_v1}
 */
proto.helium.iot_config.org_res_v1.prototype.addDevaddrConstraints = function(opt_value, opt_index) {
  return jspb.Message.addToRepeatedWrapperField(this, 3, opt_value, proto.helium.iot_config.devaddr_constraint_v1, opt_index);
};


/**
 * Clears the list making it empty but non-null.
 * @return {!proto.helium.iot_config.org_res_v1} returns this
 */
proto.helium.iot_config.org_res_v1.prototype.clearDevaddrConstraintsList = function() {
  return this.setDevaddrConstraintsList([]);
};


/**
 * optional uint64 timestamp = 4;
 * @return {number}
 */
proto.helium.iot_config.org_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 4, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_res_v1} returns this
 */
proto.helium.iot_config.org_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 4, value);
};


/**
 * optional bytes signer = 5;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 5, ""));
};


/**
 * optional bytes signer = 5;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.org_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 5;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_res_v1} returns this
 */
proto.helium.iot_config.org_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 5, value);
};


/**
 * optional bytes signature = 6;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 6, ""));
};


/**
 * optional bytes signature = 6;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.org_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 6;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_res_v1} returns this
 */
proto.helium.iot_config.org_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 6, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.org_disable_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.org_disable_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.org_disable_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_disable_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    oui: jspb.Message.getFieldWithDefault(msg, 1, 0),
    timestamp: jspb.Message.getFieldWithDefault(msg, 2, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.org_disable_req_v1}
 */
proto.helium.iot_config.org_disable_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.org_disable_req_v1;
  return proto.helium.iot_config.org_disable_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.org_disable_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.org_disable_req_v1}
 */
proto.helium.iot_config.org_disable_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setOui(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_disable_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.org_disable_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.org_disable_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_disable_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getOui();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * optional uint64 oui = 1;
 * @return {number}
 */
proto.helium.iot_config.org_disable_req_v1.prototype.getOui = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_disable_req_v1} returns this
 */
proto.helium.iot_config.org_disable_req_v1.prototype.setOui = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional uint64 timestamp = 2;
 * @return {number}
 */
proto.helium.iot_config.org_disable_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_disable_req_v1} returns this
 */
proto.helium.iot_config.org_disable_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_disable_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.org_disable_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_disable_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_disable_req_v1} returns this
 */
proto.helium.iot_config.org_disable_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signer = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_disable_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signer = 4;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.org_disable_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_disable_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_disable_req_v1} returns this
 */
proto.helium.iot_config.org_disable_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.org_disable_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.org_disable_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.org_disable_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_disable_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    oui: jspb.Message.getFieldWithDefault(msg, 1, 0),
    timestamp: jspb.Message.getFieldWithDefault(msg, 2, 0),
    signer: msg.getSigner_asB64(),
    signature: msg.getSignature_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.org_disable_res_v1}
 */
proto.helium.iot_config.org_disable_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.org_disable_res_v1;
  return proto.helium.iot_config.org_disable_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.org_disable_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.org_disable_res_v1}
 */
proto.helium.iot_config.org_disable_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setOui(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_disable_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.org_disable_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.org_disable_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_disable_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getOui();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      2,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * optional uint64 oui = 1;
 * @return {number}
 */
proto.helium.iot_config.org_disable_res_v1.prototype.getOui = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_disable_res_v1} returns this
 */
proto.helium.iot_config.org_disable_res_v1.prototype.setOui = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional uint64 timestamp = 2;
 * @return {number}
 */
proto.helium.iot_config.org_disable_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_disable_res_v1} returns this
 */
proto.helium.iot_config.org_disable_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional bytes signer = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_disable_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signer = 3;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.org_disable_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_disable_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_disable_res_v1} returns this
 */
proto.helium.iot_config.org_disable_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signature = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_disable_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signature = 4;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.org_disable_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_disable_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_disable_res_v1} returns this
 */
proto.helium.iot_config.org_disable_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.org_enable_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.org_enable_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.org_enable_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_enable_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    oui: jspb.Message.getFieldWithDefault(msg, 1, 0),
    timestamp: jspb.Message.getFieldWithDefault(msg, 2, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.org_enable_req_v1}
 */
proto.helium.iot_config.org_enable_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.org_enable_req_v1;
  return proto.helium.iot_config.org_enable_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.org_enable_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.org_enable_req_v1}
 */
proto.helium.iot_config.org_enable_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setOui(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_enable_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.org_enable_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.org_enable_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_enable_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getOui();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * optional uint64 oui = 1;
 * @return {number}
 */
proto.helium.iot_config.org_enable_req_v1.prototype.getOui = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_enable_req_v1} returns this
 */
proto.helium.iot_config.org_enable_req_v1.prototype.setOui = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional uint64 timestamp = 2;
 * @return {number}
 */
proto.helium.iot_config.org_enable_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_enable_req_v1} returns this
 */
proto.helium.iot_config.org_enable_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_enable_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.org_enable_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_enable_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_enable_req_v1} returns this
 */
proto.helium.iot_config.org_enable_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signer = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_enable_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signer = 4;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.org_enable_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_enable_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_enable_req_v1} returns this
 */
proto.helium.iot_config.org_enable_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.org_enable_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.org_enable_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.org_enable_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_enable_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    oui: jspb.Message.getFieldWithDefault(msg, 1, 0),
    timestamp: jspb.Message.getFieldWithDefault(msg, 2, 0),
    signer: msg.getSigner_asB64(),
    signature: msg.getSignature_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.org_enable_res_v1}
 */
proto.helium.iot_config.org_enable_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.org_enable_res_v1;
  return proto.helium.iot_config.org_enable_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.org_enable_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.org_enable_res_v1}
 */
proto.helium.iot_config.org_enable_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setOui(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_enable_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.org_enable_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.org_enable_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.org_enable_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getOui();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      2,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * optional uint64 oui = 1;
 * @return {number}
 */
proto.helium.iot_config.org_enable_res_v1.prototype.getOui = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_enable_res_v1} returns this
 */
proto.helium.iot_config.org_enable_res_v1.prototype.setOui = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional uint64 timestamp = 2;
 * @return {number}
 */
proto.helium.iot_config.org_enable_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.org_enable_res_v1} returns this
 */
proto.helium.iot_config.org_enable_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional bytes signer = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_enable_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signer = 3;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.org_enable_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_enable_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_enable_res_v1} returns this
 */
proto.helium.iot_config.org_enable_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signature = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.org_enable_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signature = 4;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.org_enable_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.org_enable_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.org_enable_res_v1} returns this
 */
proto.helium.iot_config.org_enable_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_list_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_list_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_list_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_list_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    oui: jspb.Message.getFieldWithDefault(msg, 1, 0),
    timestamp: jspb.Message.getFieldWithDefault(msg, 2, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_list_req_v1}
 */
proto.helium.iot_config.route_list_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_list_req_v1;
  return proto.helium.iot_config.route_list_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_list_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_list_req_v1}
 */
proto.helium.iot_config.route_list_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setOui(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_list_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_list_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_list_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_list_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getOui();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * optional uint64 oui = 1;
 * @return {number}
 */
proto.helium.iot_config.route_list_req_v1.prototype.getOui = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_list_req_v1} returns this
 */
proto.helium.iot_config.route_list_req_v1.prototype.setOui = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional uint64 timestamp = 2;
 * @return {number}
 */
proto.helium.iot_config.route_list_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_list_req_v1} returns this
 */
proto.helium.iot_config.route_list_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_list_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_list_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_list_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_list_req_v1} returns this
 */
proto.helium.iot_config.route_list_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signer = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_list_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signer = 4;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_list_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_list_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_list_req_v1} returns this
 */
proto.helium.iot_config.route_list_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};



/**
 * List of repeated fields within this message type.
 * @private {!Array<number>}
 * @const
 */
proto.helium.iot_config.route_list_res_v1.repeatedFields_ = [1];



if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_list_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_list_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_list_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_list_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    routesList: jspb.Message.toObjectList(msg.getRoutesList(),
    proto.helium.iot_config.route_v1.toObject, includeInstance),
    timestamp: jspb.Message.getFieldWithDefault(msg, 2, 0),
    signer: msg.getSigner_asB64(),
    signature: msg.getSignature_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_list_res_v1}
 */
proto.helium.iot_config.route_list_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_list_res_v1;
  return proto.helium.iot_config.route_list_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_list_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_list_res_v1}
 */
proto.helium.iot_config.route_list_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = new proto.helium.iot_config.route_v1;
      reader.readMessage(value,proto.helium.iot_config.route_v1.deserializeBinaryFromReader);
      msg.addRoutes(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_list_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_list_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_list_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_list_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRoutesList();
  if (f.length > 0) {
    writer.writeRepeatedMessage(
      1,
      f,
      proto.helium.iot_config.route_v1.serializeBinaryToWriter
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      2,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * repeated route_v1 routes = 1;
 * @return {!Array<!proto.helium.iot_config.route_v1>}
 */
proto.helium.iot_config.route_list_res_v1.prototype.getRoutesList = function() {
  return /** @type{!Array<!proto.helium.iot_config.route_v1>} */ (
    jspb.Message.getRepeatedWrapperField(this, proto.helium.iot_config.route_v1, 1));
};


/**
 * @param {!Array<!proto.helium.iot_config.route_v1>} value
 * @return {!proto.helium.iot_config.route_list_res_v1} returns this
*/
proto.helium.iot_config.route_list_res_v1.prototype.setRoutesList = function(value) {
  return jspb.Message.setRepeatedWrapperField(this, 1, value);
};


/**
 * @param {!proto.helium.iot_config.route_v1=} opt_value
 * @param {number=} opt_index
 * @return {!proto.helium.iot_config.route_v1}
 */
proto.helium.iot_config.route_list_res_v1.prototype.addRoutes = function(opt_value, opt_index) {
  return jspb.Message.addToRepeatedWrapperField(this, 1, opt_value, proto.helium.iot_config.route_v1, opt_index);
};


/**
 * Clears the list making it empty but non-null.
 * @return {!proto.helium.iot_config.route_list_res_v1} returns this
 */
proto.helium.iot_config.route_list_res_v1.prototype.clearRoutesList = function() {
  return this.setRoutesList([]);
};


/**
 * optional uint64 timestamp = 2;
 * @return {number}
 */
proto.helium.iot_config.route_list_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_list_res_v1} returns this
 */
proto.helium.iot_config.route_list_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional bytes signer = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_list_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signer = 3;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_list_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_list_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_list_res_v1} returns this
 */
proto.helium.iot_config.route_list_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signature = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_list_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signature = 4;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_list_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_list_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_list_res_v1} returns this
 */
proto.helium.iot_config.route_list_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_get_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_get_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_get_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_get_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    id: jspb.Message.getFieldWithDefault(msg, 1, ""),
    timestamp: jspb.Message.getFieldWithDefault(msg, 2, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_get_req_v1}
 */
proto.helium.iot_config.route_get_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_get_req_v1;
  return proto.helium.iot_config.route_get_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_get_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_get_req_v1}
 */
proto.helium.iot_config.route_get_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {string} */ (reader.readString());
      msg.setId(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_get_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_get_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_get_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_get_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getId();
  if (f.length > 0) {
    writer.writeString(
      1,
      f
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * optional string id = 1;
 * @return {string}
 */
proto.helium.iot_config.route_get_req_v1.prototype.getId = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.route_get_req_v1} returns this
 */
proto.helium.iot_config.route_get_req_v1.prototype.setId = function(value) {
  return jspb.Message.setProto3StringField(this, 1, value);
};


/**
 * optional uint64 timestamp = 2;
 * @return {number}
 */
proto.helium.iot_config.route_get_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_get_req_v1} returns this
 */
proto.helium.iot_config.route_get_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_get_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_get_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_get_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_get_req_v1} returns this
 */
proto.helium.iot_config.route_get_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signer = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_get_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signer = 4;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_get_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_get_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_get_req_v1} returns this
 */
proto.helium.iot_config.route_get_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_create_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_create_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_create_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_create_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    oui: jspb.Message.getFieldWithDefault(msg, 1, 0),
    route: (f = msg.getRoute()) && proto.helium.iot_config.route_v1.toObject(includeInstance, f),
    timestamp: jspb.Message.getFieldWithDefault(msg, 3, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_create_req_v1}
 */
proto.helium.iot_config.route_create_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_create_req_v1;
  return proto.helium.iot_config.route_create_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_create_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_create_req_v1}
 */
proto.helium.iot_config.route_create_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setOui(value);
      break;
    case 2:
      var value = new proto.helium.iot_config.route_v1;
      reader.readMessage(value,proto.helium.iot_config.route_v1.deserializeBinaryFromReader);
      msg.setRoute(value);
      break;
    case 3:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 5:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_create_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_create_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_create_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_create_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getOui();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getRoute();
  if (f != null) {
    writer.writeMessage(
      2,
      f,
      proto.helium.iot_config.route_v1.serializeBinaryToWriter
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      3,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      5,
      f
    );
  }
};


/**
 * optional uint64 oui = 1;
 * @return {number}
 */
proto.helium.iot_config.route_create_req_v1.prototype.getOui = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_create_req_v1} returns this
 */
proto.helium.iot_config.route_create_req_v1.prototype.setOui = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional route_v1 route = 2;
 * @return {?proto.helium.iot_config.route_v1}
 */
proto.helium.iot_config.route_create_req_v1.prototype.getRoute = function() {
  return /** @type{?proto.helium.iot_config.route_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.route_v1, 2));
};


/**
 * @param {?proto.helium.iot_config.route_v1|undefined} value
 * @return {!proto.helium.iot_config.route_create_req_v1} returns this
*/
proto.helium.iot_config.route_create_req_v1.prototype.setRoute = function(value) {
  return jspb.Message.setWrapperField(this, 2, value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.route_create_req_v1} returns this
 */
proto.helium.iot_config.route_create_req_v1.prototype.clearRoute = function() {
  return this.setRoute(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.route_create_req_v1.prototype.hasRoute = function() {
  return jspb.Message.getField(this, 2) != null;
};


/**
 * optional uint64 timestamp = 3;
 * @return {number}
 */
proto.helium.iot_config.route_create_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 3, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_create_req_v1} returns this
 */
proto.helium.iot_config.route_create_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 3, value);
};


/**
 * optional bytes signature = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_create_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signature = 4;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_create_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_create_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_create_req_v1} returns this
 */
proto.helium.iot_config.route_create_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};


/**
 * optional bytes signer = 5;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_create_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 5, ""));
};


/**
 * optional bytes signer = 5;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_create_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 5;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_create_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_create_req_v1} returns this
 */
proto.helium.iot_config.route_create_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 5, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_update_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_update_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_update_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_update_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    route: (f = msg.getRoute()) && proto.helium.iot_config.route_v1.toObject(includeInstance, f),
    timestamp: jspb.Message.getFieldWithDefault(msg, 2, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_update_req_v1}
 */
proto.helium.iot_config.route_update_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_update_req_v1;
  return proto.helium.iot_config.route_update_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_update_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_update_req_v1}
 */
proto.helium.iot_config.route_update_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = new proto.helium.iot_config.route_v1;
      reader.readMessage(value,proto.helium.iot_config.route_v1.deserializeBinaryFromReader);
      msg.setRoute(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_update_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_update_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_update_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_update_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRoute();
  if (f != null) {
    writer.writeMessage(
      1,
      f,
      proto.helium.iot_config.route_v1.serializeBinaryToWriter
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * optional route_v1 route = 1;
 * @return {?proto.helium.iot_config.route_v1}
 */
proto.helium.iot_config.route_update_req_v1.prototype.getRoute = function() {
  return /** @type{?proto.helium.iot_config.route_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.route_v1, 1));
};


/**
 * @param {?proto.helium.iot_config.route_v1|undefined} value
 * @return {!proto.helium.iot_config.route_update_req_v1} returns this
*/
proto.helium.iot_config.route_update_req_v1.prototype.setRoute = function(value) {
  return jspb.Message.setWrapperField(this, 1, value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.route_update_req_v1} returns this
 */
proto.helium.iot_config.route_update_req_v1.prototype.clearRoute = function() {
  return this.setRoute(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.route_update_req_v1.prototype.hasRoute = function() {
  return jspb.Message.getField(this, 1) != null;
};


/**
 * optional uint64 timestamp = 2;
 * @return {number}
 */
proto.helium.iot_config.route_update_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_update_req_v1} returns this
 */
proto.helium.iot_config.route_update_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_update_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_update_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_update_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_update_req_v1} returns this
 */
proto.helium.iot_config.route_update_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signer = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_update_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signer = 4;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_update_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_update_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_update_req_v1} returns this
 */
proto.helium.iot_config.route_update_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_delete_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_delete_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_delete_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_delete_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    id: jspb.Message.getFieldWithDefault(msg, 1, ""),
    timestamp: jspb.Message.getFieldWithDefault(msg, 2, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_delete_req_v1}
 */
proto.helium.iot_config.route_delete_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_delete_req_v1;
  return proto.helium.iot_config.route_delete_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_delete_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_delete_req_v1}
 */
proto.helium.iot_config.route_delete_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {string} */ (reader.readString());
      msg.setId(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_delete_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_delete_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_delete_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_delete_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getId();
  if (f.length > 0) {
    writer.writeString(
      1,
      f
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * optional string id = 1;
 * @return {string}
 */
proto.helium.iot_config.route_delete_req_v1.prototype.getId = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.route_delete_req_v1} returns this
 */
proto.helium.iot_config.route_delete_req_v1.prototype.setId = function(value) {
  return jspb.Message.setProto3StringField(this, 1, value);
};


/**
 * optional uint64 timestamp = 2;
 * @return {number}
 */
proto.helium.iot_config.route_delete_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_delete_req_v1} returns this
 */
proto.helium.iot_config.route_delete_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_delete_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_delete_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_delete_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_delete_req_v1} returns this
 */
proto.helium.iot_config.route_delete_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signer = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_delete_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signer = 4;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_delete_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_delete_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_delete_req_v1} returns this
 */
proto.helium.iot_config.route_delete_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    route: (f = msg.getRoute()) && proto.helium.iot_config.route_v1.toObject(includeInstance, f),
    timestamp: jspb.Message.getFieldWithDefault(msg, 2, 0),
    signer: msg.getSigner_asB64(),
    signature: msg.getSignature_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_res_v1}
 */
proto.helium.iot_config.route_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_res_v1;
  return proto.helium.iot_config.route_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_res_v1}
 */
proto.helium.iot_config.route_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = new proto.helium.iot_config.route_v1;
      reader.readMessage(value,proto.helium.iot_config.route_v1.deserializeBinaryFromReader);
      msg.setRoute(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRoute();
  if (f != null) {
    writer.writeMessage(
      1,
      f,
      proto.helium.iot_config.route_v1.serializeBinaryToWriter
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      2,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * optional route_v1 route = 1;
 * @return {?proto.helium.iot_config.route_v1}
 */
proto.helium.iot_config.route_res_v1.prototype.getRoute = function() {
  return /** @type{?proto.helium.iot_config.route_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.route_v1, 1));
};


/**
 * @param {?proto.helium.iot_config.route_v1|undefined} value
 * @return {!proto.helium.iot_config.route_res_v1} returns this
*/
proto.helium.iot_config.route_res_v1.prototype.setRoute = function(value) {
  return jspb.Message.setWrapperField(this, 1, value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.route_res_v1} returns this
 */
proto.helium.iot_config.route_res_v1.prototype.clearRoute = function() {
  return this.setRoute(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.route_res_v1.prototype.hasRoute = function() {
  return jspb.Message.getField(this, 1) != null;
};


/**
 * optional uint64 timestamp = 2;
 * @return {number}
 */
proto.helium.iot_config.route_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_res_v1} returns this
 */
proto.helium.iot_config.route_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional bytes signer = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signer = 3;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_res_v1} returns this
 */
proto.helium.iot_config.route_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signature = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signature = 4;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_res_v1} returns this
 */
proto.helium.iot_config.route_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_get_euis_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_get_euis_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_get_euis_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_get_euis_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    routeId: jspb.Message.getFieldWithDefault(msg, 1, ""),
    timestamp: jspb.Message.getFieldWithDefault(msg, 2, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_get_euis_req_v1}
 */
proto.helium.iot_config.route_get_euis_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_get_euis_req_v1;
  return proto.helium.iot_config.route_get_euis_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_get_euis_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_get_euis_req_v1}
 */
proto.helium.iot_config.route_get_euis_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {string} */ (reader.readString());
      msg.setRouteId(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_get_euis_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_get_euis_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_get_euis_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_get_euis_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRouteId();
  if (f.length > 0) {
    writer.writeString(
      1,
      f
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * optional string route_id = 1;
 * @return {string}
 */
proto.helium.iot_config.route_get_euis_req_v1.prototype.getRouteId = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.route_get_euis_req_v1} returns this
 */
proto.helium.iot_config.route_get_euis_req_v1.prototype.setRouteId = function(value) {
  return jspb.Message.setProto3StringField(this, 1, value);
};


/**
 * optional uint64 timestamp = 2;
 * @return {number}
 */
proto.helium.iot_config.route_get_euis_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_get_euis_req_v1} returns this
 */
proto.helium.iot_config.route_get_euis_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_get_euis_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_get_euis_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_get_euis_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_get_euis_req_v1} returns this
 */
proto.helium.iot_config.route_get_euis_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signer = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_get_euis_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signer = 4;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_get_euis_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_get_euis_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_get_euis_req_v1} returns this
 */
proto.helium.iot_config.route_get_euis_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_update_euis_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_update_euis_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_update_euis_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    action: jspb.Message.getFieldWithDefault(msg, 1, 0),
    euiPair: (f = msg.getEuiPair()) && proto.helium.iot_config.eui_pair_v1.toObject(includeInstance, f),
    timestamp: jspb.Message.getFieldWithDefault(msg, 3, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_update_euis_req_v1}
 */
proto.helium.iot_config.route_update_euis_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_update_euis_req_v1;
  return proto.helium.iot_config.route_update_euis_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_update_euis_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_update_euis_req_v1}
 */
proto.helium.iot_config.route_update_euis_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!proto.helium.iot_config.action_v1} */ (reader.readEnum());
      msg.setAction(value);
      break;
    case 2:
      var value = new proto.helium.iot_config.eui_pair_v1;
      reader.readMessage(value,proto.helium.iot_config.eui_pair_v1.deserializeBinaryFromReader);
      msg.setEuiPair(value);
      break;
    case 3:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 5:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_update_euis_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_update_euis_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_update_euis_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getAction();
  if (f !== 0.0) {
    writer.writeEnum(
      1,
      f
    );
  }
  f = message.getEuiPair();
  if (f != null) {
    writer.writeMessage(
      2,
      f,
      proto.helium.iot_config.eui_pair_v1.serializeBinaryToWriter
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      3,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      5,
      f
    );
  }
};


/**
 * optional action_v1 action = 1;
 * @return {!proto.helium.iot_config.action_v1}
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.getAction = function() {
  return /** @type {!proto.helium.iot_config.action_v1} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {!proto.helium.iot_config.action_v1} value
 * @return {!proto.helium.iot_config.route_update_euis_req_v1} returns this
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.setAction = function(value) {
  return jspb.Message.setProto3EnumField(this, 1, value);
};


/**
 * optional eui_pair_v1 eui_pair = 2;
 * @return {?proto.helium.iot_config.eui_pair_v1}
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.getEuiPair = function() {
  return /** @type{?proto.helium.iot_config.eui_pair_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.eui_pair_v1, 2));
};


/**
 * @param {?proto.helium.iot_config.eui_pair_v1|undefined} value
 * @return {!proto.helium.iot_config.route_update_euis_req_v1} returns this
*/
proto.helium.iot_config.route_update_euis_req_v1.prototype.setEuiPair = function(value) {
  return jspb.Message.setWrapperField(this, 2, value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.route_update_euis_req_v1} returns this
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.clearEuiPair = function() {
  return this.setEuiPair(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.hasEuiPair = function() {
  return jspb.Message.getField(this, 2) != null;
};


/**
 * optional uint64 timestamp = 3;
 * @return {number}
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 3, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_update_euis_req_v1} returns this
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 3, value);
};


/**
 * optional bytes signature = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signature = 4;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_update_euis_req_v1} returns this
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};


/**
 * optional bytes signer = 5;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 5, ""));
};


/**
 * optional bytes signer = 5;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 5;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_update_euis_req_v1} returns this
 */
proto.helium.iot_config.route_update_euis_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 5, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_euis_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_euis_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_euis_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_euis_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    timestamp: jspb.Message.getFieldWithDefault(msg, 1, 0),
    signer: msg.getSigner_asB64(),
    signature: msg.getSignature_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_euis_res_v1}
 */
proto.helium.iot_config.route_euis_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_euis_res_v1;
  return proto.helium.iot_config.route_euis_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_euis_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_euis_res_v1}
 */
proto.helium.iot_config.route_euis_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_euis_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_euis_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_euis_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_euis_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
};


/**
 * optional uint64 timestamp = 1;
 * @return {number}
 */
proto.helium.iot_config.route_euis_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_euis_res_v1} returns this
 */
proto.helium.iot_config.route_euis_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional bytes signer = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_euis_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes signer = 2;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_euis_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_euis_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_euis_res_v1} returns this
 */
proto.helium.iot_config.route_euis_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_euis_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_euis_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_euis_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_euis_res_v1} returns this
 */
proto.helium.iot_config.route_euis_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_get_devaddr_ranges_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_get_devaddr_ranges_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    routeId: jspb.Message.getFieldWithDefault(msg, 1, ""),
    timestamp: jspb.Message.getFieldWithDefault(msg, 2, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_get_devaddr_ranges_req_v1}
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_get_devaddr_ranges_req_v1;
  return proto.helium.iot_config.route_get_devaddr_ranges_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_get_devaddr_ranges_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_get_devaddr_ranges_req_v1}
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {string} */ (reader.readString());
      msg.setRouteId(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_get_devaddr_ranges_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_get_devaddr_ranges_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRouteId();
  if (f.length > 0) {
    writer.writeString(
      1,
      f
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * optional string route_id = 1;
 * @return {string}
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.prototype.getRouteId = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.route_get_devaddr_ranges_req_v1} returns this
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.prototype.setRouteId = function(value) {
  return jspb.Message.setProto3StringField(this, 1, value);
};


/**
 * optional uint64 timestamp = 2;
 * @return {number}
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_get_devaddr_ranges_req_v1} returns this
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_get_devaddr_ranges_req_v1} returns this
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signer = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signer = 4;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_get_devaddr_ranges_req_v1} returns this
 */
proto.helium.iot_config.route_get_devaddr_ranges_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_update_devaddr_ranges_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_update_devaddr_ranges_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    action: jspb.Message.getFieldWithDefault(msg, 1, 0),
    devaddrRange: (f = msg.getDevaddrRange()) && proto.helium.iot_config.devaddr_range_v1.toObject(includeInstance, f),
    timestamp: jspb.Message.getFieldWithDefault(msg, 3, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_update_devaddr_ranges_req_v1}
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_update_devaddr_ranges_req_v1;
  return proto.helium.iot_config.route_update_devaddr_ranges_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_update_devaddr_ranges_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_update_devaddr_ranges_req_v1}
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!proto.helium.iot_config.action_v1} */ (reader.readEnum());
      msg.setAction(value);
      break;
    case 2:
      var value = new proto.helium.iot_config.devaddr_range_v1;
      reader.readMessage(value,proto.helium.iot_config.devaddr_range_v1.deserializeBinaryFromReader);
      msg.setDevaddrRange(value);
      break;
    case 3:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 5:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_update_devaddr_ranges_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_update_devaddr_ranges_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getAction();
  if (f !== 0.0) {
    writer.writeEnum(
      1,
      f
    );
  }
  f = message.getDevaddrRange();
  if (f != null) {
    writer.writeMessage(
      2,
      f,
      proto.helium.iot_config.devaddr_range_v1.serializeBinaryToWriter
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      3,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      5,
      f
    );
  }
};


/**
 * optional action_v1 action = 1;
 * @return {!proto.helium.iot_config.action_v1}
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.getAction = function() {
  return /** @type {!proto.helium.iot_config.action_v1} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {!proto.helium.iot_config.action_v1} value
 * @return {!proto.helium.iot_config.route_update_devaddr_ranges_req_v1} returns this
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.setAction = function(value) {
  return jspb.Message.setProto3EnumField(this, 1, value);
};


/**
 * optional devaddr_range_v1 devaddr_range = 2;
 * @return {?proto.helium.iot_config.devaddr_range_v1}
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.getDevaddrRange = function() {
  return /** @type{?proto.helium.iot_config.devaddr_range_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.devaddr_range_v1, 2));
};


/**
 * @param {?proto.helium.iot_config.devaddr_range_v1|undefined} value
 * @return {!proto.helium.iot_config.route_update_devaddr_ranges_req_v1} returns this
*/
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.setDevaddrRange = function(value) {
  return jspb.Message.setWrapperField(this, 2, value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.route_update_devaddr_ranges_req_v1} returns this
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.clearDevaddrRange = function() {
  return this.setDevaddrRange(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.hasDevaddrRange = function() {
  return jspb.Message.getField(this, 2) != null;
};


/**
 * optional uint64 timestamp = 3;
 * @return {number}
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 3, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_update_devaddr_ranges_req_v1} returns this
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 3, value);
};


/**
 * optional bytes signature = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signature = 4;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_update_devaddr_ranges_req_v1} returns this
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};


/**
 * optional bytes signer = 5;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 5, ""));
};


/**
 * optional bytes signer = 5;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 5;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_update_devaddr_ranges_req_v1} returns this
 */
proto.helium.iot_config.route_update_devaddr_ranges_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 5, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_devaddr_ranges_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_devaddr_ranges_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    timestamp: jspb.Message.getFieldWithDefault(msg, 1, 0),
    signer: msg.getSigner_asB64(),
    signature: msg.getSignature_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_devaddr_ranges_res_v1}
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_devaddr_ranges_res_v1;
  return proto.helium.iot_config.route_devaddr_ranges_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_devaddr_ranges_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_devaddr_ranges_res_v1}
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_devaddr_ranges_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_devaddr_ranges_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
};


/**
 * optional uint64 timestamp = 1;
 * @return {number}
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_devaddr_ranges_res_v1} returns this
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional bytes signer = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes signer = 2;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_devaddr_ranges_res_v1} returns this
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_devaddr_ranges_res_v1} returns this
 */
proto.helium.iot_config.route_devaddr_ranges_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_stream_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_stream_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_stream_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_stream_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    timestamp: jspb.Message.getFieldWithDefault(msg, 1, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64(),
    since: jspb.Message.getFieldWithDefault(msg, 4, 0)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_stream_req_v1}
 */
proto.helium.iot_config.route_stream_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_stream_req_v1;
  return proto.helium.iot_config.route_stream_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_stream_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_stream_req_v1}
 */
proto.helium.iot_config.route_stream_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 4:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setSince(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_stream_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_stream_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_stream_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_stream_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSince();
  if (f !== 0) {
    writer.writeUint64(
      4,
      f
    );
  }
};


/**
 * optional uint64 timestamp = 1;
 * @return {number}
 */
proto.helium.iot_config.route_stream_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_stream_req_v1} returns this
 */
proto.helium.iot_config.route_stream_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional bytes signature = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_stream_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes signature = 2;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_stream_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_stream_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_stream_req_v1} returns this
 */
proto.helium.iot_config.route_stream_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 2, value);
};


/**
 * optional bytes signer = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_stream_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signer = 3;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_stream_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_stream_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_stream_req_v1} returns this
 */
proto.helium.iot_config.route_stream_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional uint64 since = 4;
 * @return {number}
 */
proto.helium.iot_config.route_stream_req_v1.prototype.getSince = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 4, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_stream_req_v1} returns this
 */
proto.helium.iot_config.route_stream_req_v1.prototype.setSince = function(value) {
  return jspb.Message.setProto3IntField(this, 4, value);
};



/**
 * Oneof group definitions for this message. Each group defines the field
 * numbers belonging to that group. When of these fields' value is set, all
 * other fields in the group are cleared. During deserialization, if multiple
 * fields are encountered for a group, only the last value seen will be kept.
 * @private {!Array<!Array<number>>}
 * @const
 */
proto.helium.iot_config.route_stream_res_v1.oneofGroups_ = [[5,6,7,8]];

/**
 * @enum {number}
 */
proto.helium.iot_config.route_stream_res_v1.DataCase = {
  DATA_NOT_SET: 0,
  ROUTE: 5,
  EUI_PAIR: 6,
  DEVADDR_RANGE: 7,
  SKF: 8
};

/**
 * @return {proto.helium.iot_config.route_stream_res_v1.DataCase}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.getDataCase = function() {
  return /** @type {proto.helium.iot_config.route_stream_res_v1.DataCase} */(jspb.Message.computeOneofCase(this, proto.helium.iot_config.route_stream_res_v1.oneofGroups_[0]));
};



if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_stream_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_stream_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_stream_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    timestamp: jspb.Message.getFieldWithDefault(msg, 1, 0),
    signer: msg.getSigner_asB64(),
    signature: msg.getSignature_asB64(),
    action: jspb.Message.getFieldWithDefault(msg, 4, 0),
    route: (f = msg.getRoute()) && proto.helium.iot_config.route_v1.toObject(includeInstance, f),
    euiPair: (f = msg.getEuiPair()) && proto.helium.iot_config.eui_pair_v1.toObject(includeInstance, f),
    devaddrRange: (f = msg.getDevaddrRange()) && proto.helium.iot_config.devaddr_range_v1.toObject(includeInstance, f),
    skf: (f = msg.getSkf()) && proto.helium.iot_config.skf_v1.toObject(includeInstance, f)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_stream_res_v1}
 */
proto.helium.iot_config.route_stream_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_stream_res_v1;
  return proto.helium.iot_config.route_stream_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_stream_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_stream_res_v1}
 */
proto.helium.iot_config.route_stream_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 4:
      var value = /** @type {!proto.helium.iot_config.action_v1} */ (reader.readEnum());
      msg.setAction(value);
      break;
    case 5:
      var value = new proto.helium.iot_config.route_v1;
      reader.readMessage(value,proto.helium.iot_config.route_v1.deserializeBinaryFromReader);
      msg.setRoute(value);
      break;
    case 6:
      var value = new proto.helium.iot_config.eui_pair_v1;
      reader.readMessage(value,proto.helium.iot_config.eui_pair_v1.deserializeBinaryFromReader);
      msg.setEuiPair(value);
      break;
    case 7:
      var value = new proto.helium.iot_config.devaddr_range_v1;
      reader.readMessage(value,proto.helium.iot_config.devaddr_range_v1.deserializeBinaryFromReader);
      msg.setDevaddrRange(value);
      break;
    case 8:
      var value = new proto.helium.iot_config.skf_v1;
      reader.readMessage(value,proto.helium.iot_config.skf_v1.deserializeBinaryFromReader);
      msg.setSkf(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_stream_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_stream_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_stream_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getAction();
  if (f !== 0.0) {
    writer.writeEnum(
      4,
      f
    );
  }
  f = message.getRoute();
  if (f != null) {
    writer.writeMessage(
      5,
      f,
      proto.helium.iot_config.route_v1.serializeBinaryToWriter
    );
  }
  f = message.getEuiPair();
  if (f != null) {
    writer.writeMessage(
      6,
      f,
      proto.helium.iot_config.eui_pair_v1.serializeBinaryToWriter
    );
  }
  f = message.getDevaddrRange();
  if (f != null) {
    writer.writeMessage(
      7,
      f,
      proto.helium.iot_config.devaddr_range_v1.serializeBinaryToWriter
    );
  }
  f = message.getSkf();
  if (f != null) {
    writer.writeMessage(
      8,
      f,
      proto.helium.iot_config.skf_v1.serializeBinaryToWriter
    );
  }
};


/**
 * optional uint64 timestamp = 1;
 * @return {number}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_stream_res_v1} returns this
 */
proto.helium.iot_config.route_stream_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional bytes signer = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes signer = 2;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_stream_res_v1} returns this
 */
proto.helium.iot_config.route_stream_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_stream_res_v1} returns this
 */
proto.helium.iot_config.route_stream_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional action_v1 action = 4;
 * @return {!proto.helium.iot_config.action_v1}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.getAction = function() {
  return /** @type {!proto.helium.iot_config.action_v1} */ (jspb.Message.getFieldWithDefault(this, 4, 0));
};


/**
 * @param {!proto.helium.iot_config.action_v1} value
 * @return {!proto.helium.iot_config.route_stream_res_v1} returns this
 */
proto.helium.iot_config.route_stream_res_v1.prototype.setAction = function(value) {
  return jspb.Message.setProto3EnumField(this, 4, value);
};


/**
 * optional route_v1 route = 5;
 * @return {?proto.helium.iot_config.route_v1}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.getRoute = function() {
  return /** @type{?proto.helium.iot_config.route_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.route_v1, 5));
};


/**
 * @param {?proto.helium.iot_config.route_v1|undefined} value
 * @return {!proto.helium.iot_config.route_stream_res_v1} returns this
*/
proto.helium.iot_config.route_stream_res_v1.prototype.setRoute = function(value) {
  return jspb.Message.setOneofWrapperField(this, 5, proto.helium.iot_config.route_stream_res_v1.oneofGroups_[0], value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.route_stream_res_v1} returns this
 */
proto.helium.iot_config.route_stream_res_v1.prototype.clearRoute = function() {
  return this.setRoute(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.hasRoute = function() {
  return jspb.Message.getField(this, 5) != null;
};


/**
 * optional eui_pair_v1 eui_pair = 6;
 * @return {?proto.helium.iot_config.eui_pair_v1}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.getEuiPair = function() {
  return /** @type{?proto.helium.iot_config.eui_pair_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.eui_pair_v1, 6));
};


/**
 * @param {?proto.helium.iot_config.eui_pair_v1|undefined} value
 * @return {!proto.helium.iot_config.route_stream_res_v1} returns this
*/
proto.helium.iot_config.route_stream_res_v1.prototype.setEuiPair = function(value) {
  return jspb.Message.setOneofWrapperField(this, 6, proto.helium.iot_config.route_stream_res_v1.oneofGroups_[0], value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.route_stream_res_v1} returns this
 */
proto.helium.iot_config.route_stream_res_v1.prototype.clearEuiPair = function() {
  return this.setEuiPair(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.hasEuiPair = function() {
  return jspb.Message.getField(this, 6) != null;
};


/**
 * optional devaddr_range_v1 devaddr_range = 7;
 * @return {?proto.helium.iot_config.devaddr_range_v1}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.getDevaddrRange = function() {
  return /** @type{?proto.helium.iot_config.devaddr_range_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.devaddr_range_v1, 7));
};


/**
 * @param {?proto.helium.iot_config.devaddr_range_v1|undefined} value
 * @return {!proto.helium.iot_config.route_stream_res_v1} returns this
*/
proto.helium.iot_config.route_stream_res_v1.prototype.setDevaddrRange = function(value) {
  return jspb.Message.setOneofWrapperField(this, 7, proto.helium.iot_config.route_stream_res_v1.oneofGroups_[0], value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.route_stream_res_v1} returns this
 */
proto.helium.iot_config.route_stream_res_v1.prototype.clearDevaddrRange = function() {
  return this.setDevaddrRange(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.hasDevaddrRange = function() {
  return jspb.Message.getField(this, 7) != null;
};


/**
 * optional skf_v1 skf = 8;
 * @return {?proto.helium.iot_config.skf_v1}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.getSkf = function() {
  return /** @type{?proto.helium.iot_config.skf_v1} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.skf_v1, 8));
};


/**
 * @param {?proto.helium.iot_config.skf_v1|undefined} value
 * @return {!proto.helium.iot_config.route_stream_res_v1} returns this
*/
proto.helium.iot_config.route_stream_res_v1.prototype.setSkf = function(value) {
  return jspb.Message.setOneofWrapperField(this, 8, proto.helium.iot_config.route_stream_res_v1.oneofGroups_[0], value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.route_stream_res_v1} returns this
 */
proto.helium.iot_config.route_stream_res_v1.prototype.clearSkf = function() {
  return this.setSkf(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.route_stream_res_v1.prototype.hasSkf = function() {
  return jspb.Message.getField(this, 8) != null;
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.skf_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.skf_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.skf_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.skf_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    routeId: jspb.Message.getFieldWithDefault(msg, 1, ""),
    devaddr: jspb.Message.getFieldWithDefault(msg, 2, 0),
    sessionKey: jspb.Message.getFieldWithDefault(msg, 3, ""),
    maxCopies: jspb.Message.getFieldWithDefault(msg, 4, 0)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.skf_v1}
 */
proto.helium.iot_config.skf_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.skf_v1;
  return proto.helium.iot_config.skf_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.skf_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.skf_v1}
 */
proto.helium.iot_config.skf_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {string} */ (reader.readString());
      msg.setRouteId(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setDevaddr(value);
      break;
    case 3:
      var value = /** @type {string} */ (reader.readString());
      msg.setSessionKey(value);
      break;
    case 4:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setMaxCopies(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.skf_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.skf_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.skf_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.skf_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRouteId();
  if (f.length > 0) {
    writer.writeString(
      1,
      f
    );
  }
  f = message.getDevaddr();
  if (f !== 0) {
    writer.writeUint32(
      2,
      f
    );
  }
  f = message.getSessionKey();
  if (f.length > 0) {
    writer.writeString(
      3,
      f
    );
  }
  f = message.getMaxCopies();
  if (f !== 0) {
    writer.writeUint32(
      4,
      f
    );
  }
};


/**
 * optional string route_id = 1;
 * @return {string}
 */
proto.helium.iot_config.skf_v1.prototype.getRouteId = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.skf_v1} returns this
 */
proto.helium.iot_config.skf_v1.prototype.setRouteId = function(value) {
  return jspb.Message.setProto3StringField(this, 1, value);
};


/**
 * optional uint32 devaddr = 2;
 * @return {number}
 */
proto.helium.iot_config.skf_v1.prototype.getDevaddr = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.skf_v1} returns this
 */
proto.helium.iot_config.skf_v1.prototype.setDevaddr = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional string session_key = 3;
 * @return {string}
 */
proto.helium.iot_config.skf_v1.prototype.getSessionKey = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.skf_v1} returns this
 */
proto.helium.iot_config.skf_v1.prototype.setSessionKey = function(value) {
  return jspb.Message.setProto3StringField(this, 3, value);
};


/**
 * optional uint32 max_copies = 4;
 * @return {number}
 */
proto.helium.iot_config.skf_v1.prototype.getMaxCopies = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 4, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.skf_v1} returns this
 */
proto.helium.iot_config.skf_v1.prototype.setMaxCopies = function(value) {
  return jspb.Message.setProto3IntField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_skf_list_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_skf_list_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_skf_list_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_skf_list_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    routeId: jspb.Message.getFieldWithDefault(msg, 1, ""),
    timestamp: jspb.Message.getFieldWithDefault(msg, 2, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_skf_list_req_v1}
 */
proto.helium.iot_config.route_skf_list_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_skf_list_req_v1;
  return proto.helium.iot_config.route_skf_list_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_skf_list_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_skf_list_req_v1}
 */
proto.helium.iot_config.route_skf_list_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {string} */ (reader.readString());
      msg.setRouteId(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_skf_list_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_skf_list_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_skf_list_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_skf_list_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRouteId();
  if (f.length > 0) {
    writer.writeString(
      1,
      f
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * optional string route_id = 1;
 * @return {string}
 */
proto.helium.iot_config.route_skf_list_req_v1.prototype.getRouteId = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.route_skf_list_req_v1} returns this
 */
proto.helium.iot_config.route_skf_list_req_v1.prototype.setRouteId = function(value) {
  return jspb.Message.setProto3StringField(this, 1, value);
};


/**
 * optional uint64 timestamp = 2;
 * @return {number}
 */
proto.helium.iot_config.route_skf_list_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_skf_list_req_v1} returns this
 */
proto.helium.iot_config.route_skf_list_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_skf_list_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_skf_list_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_skf_list_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_skf_list_req_v1} returns this
 */
proto.helium.iot_config.route_skf_list_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signer = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_skf_list_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signer = 4;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_skf_list_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_skf_list_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_skf_list_req_v1} returns this
 */
proto.helium.iot_config.route_skf_list_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_skf_get_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_skf_get_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_skf_get_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_skf_get_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    routeId: jspb.Message.getFieldWithDefault(msg, 1, ""),
    devaddr: jspb.Message.getFieldWithDefault(msg, 2, 0),
    timestamp: jspb.Message.getFieldWithDefault(msg, 3, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_skf_get_req_v1}
 */
proto.helium.iot_config.route_skf_get_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_skf_get_req_v1;
  return proto.helium.iot_config.route_skf_get_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_skf_get_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_skf_get_req_v1}
 */
proto.helium.iot_config.route_skf_get_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {string} */ (reader.readString());
      msg.setRouteId(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setDevaddr(value);
      break;
    case 3:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 5:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_skf_get_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_skf_get_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_skf_get_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_skf_get_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRouteId();
  if (f.length > 0) {
    writer.writeString(
      1,
      f
    );
  }
  f = message.getDevaddr();
  if (f !== 0) {
    writer.writeUint32(
      2,
      f
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      3,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      5,
      f
    );
  }
};


/**
 * optional string route_id = 1;
 * @return {string}
 */
proto.helium.iot_config.route_skf_get_req_v1.prototype.getRouteId = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.route_skf_get_req_v1} returns this
 */
proto.helium.iot_config.route_skf_get_req_v1.prototype.setRouteId = function(value) {
  return jspb.Message.setProto3StringField(this, 1, value);
};


/**
 * optional uint32 devaddr = 2;
 * @return {number}
 */
proto.helium.iot_config.route_skf_get_req_v1.prototype.getDevaddr = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_skf_get_req_v1} returns this
 */
proto.helium.iot_config.route_skf_get_req_v1.prototype.setDevaddr = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional uint64 timestamp = 3;
 * @return {number}
 */
proto.helium.iot_config.route_skf_get_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 3, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_skf_get_req_v1} returns this
 */
proto.helium.iot_config.route_skf_get_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 3, value);
};


/**
 * optional bytes signature = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_skf_get_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signature = 4;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_skf_get_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_skf_get_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_skf_get_req_v1} returns this
 */
proto.helium.iot_config.route_skf_get_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};


/**
 * optional bytes signer = 5;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_skf_get_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 5, ""));
};


/**
 * optional bytes signer = 5;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_skf_get_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 5;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_skf_get_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_skf_get_req_v1} returns this
 */
proto.helium.iot_config.route_skf_get_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 5, value);
};



/**
 * List of repeated fields within this message type.
 * @private {!Array<number>}
 * @const
 */
proto.helium.iot_config.route_skf_update_req_v1.repeatedFields_ = [2];



if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_skf_update_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_skf_update_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_skf_update_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    routeId: jspb.Message.getFieldWithDefault(msg, 1, ""),
    updatesList: jspb.Message.toObjectList(msg.getUpdatesList(),
    proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.toObject, includeInstance),
    timestamp: jspb.Message.getFieldWithDefault(msg, 3, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_skf_update_req_v1}
 */
proto.helium.iot_config.route_skf_update_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_skf_update_req_v1;
  return proto.helium.iot_config.route_skf_update_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_skf_update_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_skf_update_req_v1}
 */
proto.helium.iot_config.route_skf_update_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {string} */ (reader.readString());
      msg.setRouteId(value);
      break;
    case 2:
      var value = new proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1;
      reader.readMessage(value,proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.deserializeBinaryFromReader);
      msg.addUpdates(value);
      break;
    case 3:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 5:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_skf_update_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_skf_update_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_skf_update_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRouteId();
  if (f.length > 0) {
    writer.writeString(
      1,
      f
    );
  }
  f = message.getUpdatesList();
  if (f.length > 0) {
    writer.writeRepeatedMessage(
      2,
      f,
      proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.serializeBinaryToWriter
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      3,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      5,
      f
    );
  }
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    devaddr: jspb.Message.getFieldWithDefault(msg, 1, 0),
    sessionKey: jspb.Message.getFieldWithDefault(msg, 2, ""),
    action: jspb.Message.getFieldWithDefault(msg, 3, 0),
    maxCopies: jspb.Message.getFieldWithDefault(msg, 4, 0)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1}
 */
proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1;
  return proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1}
 */
proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setDevaddr(value);
      break;
    case 2:
      var value = /** @type {string} */ (reader.readString());
      msg.setSessionKey(value);
      break;
    case 3:
      var value = /** @type {!proto.helium.iot_config.action_v1} */ (reader.readEnum());
      msg.setAction(value);
      break;
    case 4:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setMaxCopies(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getDevaddr();
  if (f !== 0) {
    writer.writeUint32(
      1,
      f
    );
  }
  f = message.getSessionKey();
  if (f.length > 0) {
    writer.writeString(
      2,
      f
    );
  }
  f = message.getAction();
  if (f !== 0.0) {
    writer.writeEnum(
      3,
      f
    );
  }
  f = message.getMaxCopies();
  if (f !== 0) {
    writer.writeUint32(
      4,
      f
    );
  }
};


/**
 * optional uint32 devaddr = 1;
 * @return {number}
 */
proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.prototype.getDevaddr = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1} returns this
 */
proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.prototype.setDevaddr = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional string session_key = 2;
 * @return {string}
 */
proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.prototype.getSessionKey = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1} returns this
 */
proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.prototype.setSessionKey = function(value) {
  return jspb.Message.setProto3StringField(this, 2, value);
};


/**
 * optional action_v1 action = 3;
 * @return {!proto.helium.iot_config.action_v1}
 */
proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.prototype.getAction = function() {
  return /** @type {!proto.helium.iot_config.action_v1} */ (jspb.Message.getFieldWithDefault(this, 3, 0));
};


/**
 * @param {!proto.helium.iot_config.action_v1} value
 * @return {!proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1} returns this
 */
proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.prototype.setAction = function(value) {
  return jspb.Message.setProto3EnumField(this, 3, value);
};


/**
 * optional uint32 max_copies = 4;
 * @return {number}
 */
proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.prototype.getMaxCopies = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 4, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1} returns this
 */
proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1.prototype.setMaxCopies = function(value) {
  return jspb.Message.setProto3IntField(this, 4, value);
};


/**
 * optional string route_id = 1;
 * @return {string}
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.getRouteId = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.route_skf_update_req_v1} returns this
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.setRouteId = function(value) {
  return jspb.Message.setProto3StringField(this, 1, value);
};


/**
 * repeated route_skf_update_v1 updates = 2;
 * @return {!Array<!proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1>}
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.getUpdatesList = function() {
  return /** @type{!Array<!proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1>} */ (
    jspb.Message.getRepeatedWrapperField(this, proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1, 2));
};


/**
 * @param {!Array<!proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1>} value
 * @return {!proto.helium.iot_config.route_skf_update_req_v1} returns this
*/
proto.helium.iot_config.route_skf_update_req_v1.prototype.setUpdatesList = function(value) {
  return jspb.Message.setRepeatedWrapperField(this, 2, value);
};


/**
 * @param {!proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1=} opt_value
 * @param {number=} opt_index
 * @return {!proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1}
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.addUpdates = function(opt_value, opt_index) {
  return jspb.Message.addToRepeatedWrapperField(this, 2, opt_value, proto.helium.iot_config.route_skf_update_req_v1.route_skf_update_v1, opt_index);
};


/**
 * Clears the list making it empty but non-null.
 * @return {!proto.helium.iot_config.route_skf_update_req_v1} returns this
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.clearUpdatesList = function() {
  return this.setUpdatesList([]);
};


/**
 * optional uint64 timestamp = 3;
 * @return {number}
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 3, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_skf_update_req_v1} returns this
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 3, value);
};


/**
 * optional bytes signature = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signature = 4;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_skf_update_req_v1} returns this
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};


/**
 * optional bytes signer = 5;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 5, ""));
};


/**
 * optional bytes signer = 5;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 5;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_skf_update_req_v1} returns this
 */
proto.helium.iot_config.route_skf_update_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 5, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.route_skf_update_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.route_skf_update_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.route_skf_update_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_skf_update_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    timestamp: jspb.Message.getFieldWithDefault(msg, 1, 0),
    signer: msg.getSigner_asB64(),
    signature: msg.getSignature_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.route_skf_update_res_v1}
 */
proto.helium.iot_config.route_skf_update_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.route_skf_update_res_v1;
  return proto.helium.iot_config.route_skf_update_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.route_skf_update_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.route_skf_update_res_v1}
 */
proto.helium.iot_config.route_skf_update_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_skf_update_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.route_skf_update_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.route_skf_update_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.route_skf_update_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
};


/**
 * optional uint64 timestamp = 1;
 * @return {number}
 */
proto.helium.iot_config.route_skf_update_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.route_skf_update_res_v1} returns this
 */
proto.helium.iot_config.route_skf_update_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional bytes signer = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_skf_update_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes signer = 2;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.route_skf_update_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_skf_update_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_skf_update_res_v1} returns this
 */
proto.helium.iot_config.route_skf_update_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.route_skf_update_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.route_skf_update_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.route_skf_update_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.route_skf_update_res_v1} returns this
 */
proto.helium.iot_config.route_skf_update_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.gateway_region_params_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.gateway_region_params_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.gateway_region_params_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_region_params_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    region: jspb.Message.getFieldWithDefault(msg, 1, 0),
    address: msg.getAddress_asB64(),
    signature: msg.getSignature_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.gateway_region_params_req_v1}
 */
proto.helium.iot_config.gateway_region_params_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.gateway_region_params_req_v1;
  return proto.helium.iot_config.gateway_region_params_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.gateway_region_params_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.gateway_region_params_req_v1}
 */
proto.helium.iot_config.gateway_region_params_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!proto.helium.region} */ (reader.readEnum());
      msg.setRegion(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setAddress(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_region_params_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.gateway_region_params_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.gateway_region_params_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_region_params_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRegion();
  if (f !== 0.0) {
    writer.writeEnum(
      1,
      f
    );
  }
  f = message.getAddress_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
};


/**
 * optional helium.region region = 1;
 * @return {!proto.helium.region}
 */
proto.helium.iot_config.gateway_region_params_req_v1.prototype.getRegion = function() {
  return /** @type {!proto.helium.region} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {!proto.helium.region} value
 * @return {!proto.helium.iot_config.gateway_region_params_req_v1} returns this
 */
proto.helium.iot_config.gateway_region_params_req_v1.prototype.setRegion = function(value) {
  return jspb.Message.setProto3EnumField(this, 1, value);
};


/**
 * optional bytes address = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_region_params_req_v1.prototype.getAddress = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes address = 2;
 * This is a type-conversion wrapper around `getAddress()`
 * @return {string}
 */
proto.helium.iot_config.gateway_region_params_req_v1.prototype.getAddress_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getAddress()));
};


/**
 * optional bytes address = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getAddress()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_region_params_req_v1.prototype.getAddress_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getAddress()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_region_params_req_v1} returns this
 */
proto.helium.iot_config.gateway_region_params_req_v1.prototype.setAddress = function(value) {
  return jspb.Message.setProto3BytesField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_region_params_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.gateway_region_params_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_region_params_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_region_params_req_v1} returns this
 */
proto.helium.iot_config.gateway_region_params_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.gateway_region_params_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.gateway_region_params_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_region_params_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    region: jspb.Message.getFieldWithDefault(msg, 1, 0),
    params: (f = msg.getParams()) && blockchain_region_param_v1_pb.blockchain_region_params_v1.toObject(includeInstance, f),
    gain: jspb.Message.getFieldWithDefault(msg, 3, 0),
    signature: msg.getSignature_asB64(),
    timestamp: jspb.Message.getFieldWithDefault(msg, 5, 0),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.gateway_region_params_res_v1}
 */
proto.helium.iot_config.gateway_region_params_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.gateway_region_params_res_v1;
  return proto.helium.iot_config.gateway_region_params_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.gateway_region_params_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.gateway_region_params_res_v1}
 */
proto.helium.iot_config.gateway_region_params_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!proto.helium.region} */ (reader.readEnum());
      msg.setRegion(value);
      break;
    case 2:
      var value = new blockchain_region_param_v1_pb.blockchain_region_params_v1;
      reader.readMessage(value,blockchain_region_param_v1_pb.blockchain_region_params_v1.deserializeBinaryFromReader);
      msg.setParams(value);
      break;
    case 3:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setGain(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 5:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 6:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.gateway_region_params_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.gateway_region_params_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_region_params_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRegion();
  if (f !== 0.0) {
    writer.writeEnum(
      1,
      f
    );
  }
  f = message.getParams();
  if (f != null) {
    writer.writeMessage(
      2,
      f,
      blockchain_region_param_v1_pb.blockchain_region_params_v1.serializeBinaryToWriter
    );
  }
  f = message.getGain();
  if (f !== 0) {
    writer.writeUint64(
      3,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      5,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      6,
      f
    );
  }
};


/**
 * optional helium.region region = 1;
 * @return {!proto.helium.region}
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.getRegion = function() {
  return /** @type {!proto.helium.region} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {!proto.helium.region} value
 * @return {!proto.helium.iot_config.gateway_region_params_res_v1} returns this
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.setRegion = function(value) {
  return jspb.Message.setProto3EnumField(this, 1, value);
};


/**
 * optional helium.blockchain_region_params_v1 params = 2;
 * @return {?proto.helium.blockchain_region_params_v1}
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.getParams = function() {
  return /** @type{?proto.helium.blockchain_region_params_v1} */ (
    jspb.Message.getWrapperField(this, blockchain_region_param_v1_pb.blockchain_region_params_v1, 2));
};


/**
 * @param {?proto.helium.blockchain_region_params_v1|undefined} value
 * @return {!proto.helium.iot_config.gateway_region_params_res_v1} returns this
*/
proto.helium.iot_config.gateway_region_params_res_v1.prototype.setParams = function(value) {
  return jspb.Message.setWrapperField(this, 2, value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.gateway_region_params_res_v1} returns this
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.clearParams = function() {
  return this.setParams(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.hasParams = function() {
  return jspb.Message.getField(this, 2) != null;
};


/**
 * optional uint64 gain = 3;
 * @return {number}
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.getGain = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 3, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.gateway_region_params_res_v1} returns this
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.setGain = function(value) {
  return jspb.Message.setProto3IntField(this, 3, value);
};


/**
 * optional bytes signature = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signature = 4;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_region_params_res_v1} returns this
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};


/**
 * optional uint64 timestamp = 5;
 * @return {number}
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 5, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.gateway_region_params_res_v1} returns this
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 5, value);
};


/**
 * optional bytes signer = 6;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 6, ""));
};


/**
 * optional bytes signer = 6;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 6;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_region_params_res_v1} returns this
 */
proto.helium.iot_config.gateway_region_params_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 6, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.gateway_location_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.gateway_location_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.gateway_location_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_location_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    gateway: msg.getGateway_asB64(),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.gateway_location_req_v1}
 */
proto.helium.iot_config.gateway_location_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.gateway_location_req_v1;
  return proto.helium.iot_config.gateway_location_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.gateway_location_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.gateway_location_req_v1}
 */
proto.helium.iot_config.gateway_location_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setGateway(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_location_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.gateway_location_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.gateway_location_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_location_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getGateway_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      1,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
};


/**
 * optional bytes gateway = 1;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_location_req_v1.prototype.getGateway = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * optional bytes gateway = 1;
 * This is a type-conversion wrapper around `getGateway()`
 * @return {string}
 */
proto.helium.iot_config.gateway_location_req_v1.prototype.getGateway_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getGateway()));
};


/**
 * optional bytes gateway = 1;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getGateway()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_location_req_v1.prototype.getGateway_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getGateway()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_location_req_v1} returns this
 */
proto.helium.iot_config.gateway_location_req_v1.prototype.setGateway = function(value) {
  return jspb.Message.setProto3BytesField(this, 1, value);
};


/**
 * optional bytes signature = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_location_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes signature = 2;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.gateway_location_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_location_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_location_req_v1} returns this
 */
proto.helium.iot_config.gateway_location_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 2, value);
};


/**
 * optional bytes signer = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_location_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signer = 3;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.gateway_location_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_location_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_location_req_v1} returns this
 */
proto.helium.iot_config.gateway_location_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.gateway_location_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.gateway_location_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.gateway_location_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_location_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    location: jspb.Message.getFieldWithDefault(msg, 1, ""),
    timestamp: jspb.Message.getFieldWithDefault(msg, 2, 0),
    signer: msg.getSigner_asB64(),
    signature: msg.getSignature_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.gateway_location_res_v1}
 */
proto.helium.iot_config.gateway_location_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.gateway_location_res_v1;
  return proto.helium.iot_config.gateway_location_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.gateway_location_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.gateway_location_res_v1}
 */
proto.helium.iot_config.gateway_location_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {string} */ (reader.readString());
      msg.setLocation(value);
      break;
    case 2:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_location_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.gateway_location_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.gateway_location_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_location_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getLocation();
  if (f.length > 0) {
    writer.writeString(
      1,
      f
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      2,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * optional string location = 1;
 * @return {string}
 */
proto.helium.iot_config.gateway_location_res_v1.prototype.getLocation = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.gateway_location_res_v1} returns this
 */
proto.helium.iot_config.gateway_location_res_v1.prototype.setLocation = function(value) {
  return jspb.Message.setProto3StringField(this, 1, value);
};


/**
 * optional uint64 timestamp = 2;
 * @return {number}
 */
proto.helium.iot_config.gateway_location_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.gateway_location_res_v1} returns this
 */
proto.helium.iot_config.gateway_location_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 2, value);
};


/**
 * optional bytes signer = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_location_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signer = 3;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.gateway_location_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_location_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_location_res_v1} returns this
 */
proto.helium.iot_config.gateway_location_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signature = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_location_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signature = 4;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.gateway_location_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_location_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_location_res_v1} returns this
 */
proto.helium.iot_config.gateway_location_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.admin_load_region_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.admin_load_region_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.admin_load_region_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    region: jspb.Message.getFieldWithDefault(msg, 1, 0),
    params: (f = msg.getParams()) && blockchain_region_param_v1_pb.blockchain_region_params_v1.toObject(includeInstance, f),
    hexIndexes: msg.getHexIndexes_asB64(),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.admin_load_region_req_v1}
 */
proto.helium.iot_config.admin_load_region_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.admin_load_region_req_v1;
  return proto.helium.iot_config.admin_load_region_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.admin_load_region_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.admin_load_region_req_v1}
 */
proto.helium.iot_config.admin_load_region_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!proto.helium.region} */ (reader.readEnum());
      msg.setRegion(value);
      break;
    case 2:
      var value = new blockchain_region_param_v1_pb.blockchain_region_params_v1;
      reader.readMessage(value,blockchain_region_param_v1_pb.blockchain_region_params_v1.deserializeBinaryFromReader);
      msg.setParams(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setHexIndexes(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 5:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.admin_load_region_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.admin_load_region_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.admin_load_region_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRegion();
  if (f !== 0.0) {
    writer.writeEnum(
      1,
      f
    );
  }
  f = message.getParams();
  if (f != null) {
    writer.writeMessage(
      2,
      f,
      blockchain_region_param_v1_pb.blockchain_region_params_v1.serializeBinaryToWriter
    );
  }
  f = message.getHexIndexes_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      5,
      f
    );
  }
};


/**
 * optional helium.region region = 1;
 * @return {!proto.helium.region}
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.getRegion = function() {
  return /** @type {!proto.helium.region} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {!proto.helium.region} value
 * @return {!proto.helium.iot_config.admin_load_region_req_v1} returns this
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.setRegion = function(value) {
  return jspb.Message.setProto3EnumField(this, 1, value);
};


/**
 * optional helium.blockchain_region_params_v1 params = 2;
 * @return {?proto.helium.blockchain_region_params_v1}
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.getParams = function() {
  return /** @type{?proto.helium.blockchain_region_params_v1} */ (
    jspb.Message.getWrapperField(this, blockchain_region_param_v1_pb.blockchain_region_params_v1, 2));
};


/**
 * @param {?proto.helium.blockchain_region_params_v1|undefined} value
 * @return {!proto.helium.iot_config.admin_load_region_req_v1} returns this
*/
proto.helium.iot_config.admin_load_region_req_v1.prototype.setParams = function(value) {
  return jspb.Message.setWrapperField(this, 2, value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.admin_load_region_req_v1} returns this
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.clearParams = function() {
  return this.setParams(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.hasParams = function() {
  return jspb.Message.getField(this, 2) != null;
};


/**
 * optional bytes hex_indexes = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.getHexIndexes = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes hex_indexes = 3;
 * This is a type-conversion wrapper around `getHexIndexes()`
 * @return {string}
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.getHexIndexes_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getHexIndexes()));
};


/**
 * optional bytes hex_indexes = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getHexIndexes()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.getHexIndexes_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getHexIndexes()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.admin_load_region_req_v1} returns this
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.setHexIndexes = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signature = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signature = 4;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.admin_load_region_req_v1} returns this
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};


/**
 * optional bytes signer = 5;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 5, ""));
};


/**
 * optional bytes signer = 5;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 5;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.admin_load_region_req_v1} returns this
 */
proto.helium.iot_config.admin_load_region_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 5, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.admin_load_region_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.admin_load_region_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.admin_load_region_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.admin_load_region_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    timestamp: jspb.Message.getFieldWithDefault(msg, 1, 0),
    signer: msg.getSigner_asB64(),
    signature: msg.getSignature_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.admin_load_region_res_v1}
 */
proto.helium.iot_config.admin_load_region_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.admin_load_region_res_v1;
  return proto.helium.iot_config.admin_load_region_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.admin_load_region_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.admin_load_region_res_v1}
 */
proto.helium.iot_config.admin_load_region_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_load_region_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.admin_load_region_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.admin_load_region_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.admin_load_region_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
};


/**
 * optional uint64 timestamp = 1;
 * @return {number}
 */
proto.helium.iot_config.admin_load_region_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.admin_load_region_res_v1} returns this
 */
proto.helium.iot_config.admin_load_region_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional bytes signer = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.admin_load_region_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes signer = 2;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.admin_load_region_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_load_region_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.admin_load_region_res_v1} returns this
 */
proto.helium.iot_config.admin_load_region_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.admin_load_region_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.admin_load_region_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_load_region_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.admin_load_region_res_v1} returns this
 */
proto.helium.iot_config.admin_load_region_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.admin_add_key_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.admin_add_key_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.admin_add_key_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.admin_add_key_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    pubkey: msg.getPubkey_asB64(),
    keyType: jspb.Message.getFieldWithDefault(msg, 2, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.admin_add_key_req_v1}
 */
proto.helium.iot_config.admin_add_key_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.admin_add_key_req_v1;
  return proto.helium.iot_config.admin_add_key_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.admin_add_key_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.admin_add_key_req_v1}
 */
proto.helium.iot_config.admin_add_key_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setPubkey(value);
      break;
    case 2:
      var value = /** @type {!proto.helium.iot_config.admin_add_key_req_v1.key_type_v1} */ (reader.readEnum());
      msg.setKeyType(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_add_key_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.admin_add_key_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.admin_add_key_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.admin_add_key_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getPubkey_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      1,
      f
    );
  }
  f = message.getKeyType();
  if (f !== 0.0) {
    writer.writeEnum(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * @enum {number}
 */
proto.helium.iot_config.admin_add_key_req_v1.key_type_v1 = {
  ADMINISTRATOR: 0,
  PACKET_ROUTER: 1,
  ORACLE: 2
};

/**
 * optional bytes pubkey = 1;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.admin_add_key_req_v1.prototype.getPubkey = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * optional bytes pubkey = 1;
 * This is a type-conversion wrapper around `getPubkey()`
 * @return {string}
 */
proto.helium.iot_config.admin_add_key_req_v1.prototype.getPubkey_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getPubkey()));
};


/**
 * optional bytes pubkey = 1;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getPubkey()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_add_key_req_v1.prototype.getPubkey_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getPubkey()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.admin_add_key_req_v1} returns this
 */
proto.helium.iot_config.admin_add_key_req_v1.prototype.setPubkey = function(value) {
  return jspb.Message.setProto3BytesField(this, 1, value);
};


/**
 * optional key_type_v1 key_type = 2;
 * @return {!proto.helium.iot_config.admin_add_key_req_v1.key_type_v1}
 */
proto.helium.iot_config.admin_add_key_req_v1.prototype.getKeyType = function() {
  return /** @type {!proto.helium.iot_config.admin_add_key_req_v1.key_type_v1} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {!proto.helium.iot_config.admin_add_key_req_v1.key_type_v1} value
 * @return {!proto.helium.iot_config.admin_add_key_req_v1} returns this
 */
proto.helium.iot_config.admin_add_key_req_v1.prototype.setKeyType = function(value) {
  return jspb.Message.setProto3EnumField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.admin_add_key_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.admin_add_key_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_add_key_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.admin_add_key_req_v1} returns this
 */
proto.helium.iot_config.admin_add_key_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signer = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.admin_add_key_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signer = 4;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.admin_add_key_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_add_key_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.admin_add_key_req_v1} returns this
 */
proto.helium.iot_config.admin_add_key_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.admin_remove_key_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.admin_remove_key_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.admin_remove_key_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.admin_remove_key_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    pubkey: msg.getPubkey_asB64(),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.admin_remove_key_req_v1}
 */
proto.helium.iot_config.admin_remove_key_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.admin_remove_key_req_v1;
  return proto.helium.iot_config.admin_remove_key_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.admin_remove_key_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.admin_remove_key_req_v1}
 */
proto.helium.iot_config.admin_remove_key_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setPubkey(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_remove_key_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.admin_remove_key_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.admin_remove_key_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.admin_remove_key_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getPubkey_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      1,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
};


/**
 * optional bytes pubkey = 1;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.admin_remove_key_req_v1.prototype.getPubkey = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * optional bytes pubkey = 1;
 * This is a type-conversion wrapper around `getPubkey()`
 * @return {string}
 */
proto.helium.iot_config.admin_remove_key_req_v1.prototype.getPubkey_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getPubkey()));
};


/**
 * optional bytes pubkey = 1;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getPubkey()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_remove_key_req_v1.prototype.getPubkey_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getPubkey()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.admin_remove_key_req_v1} returns this
 */
proto.helium.iot_config.admin_remove_key_req_v1.prototype.setPubkey = function(value) {
  return jspb.Message.setProto3BytesField(this, 1, value);
};


/**
 * optional bytes signature = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.admin_remove_key_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes signature = 2;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.admin_remove_key_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_remove_key_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.admin_remove_key_req_v1} returns this
 */
proto.helium.iot_config.admin_remove_key_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 2, value);
};


/**
 * optional bytes signer = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.admin_remove_key_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signer = 3;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.admin_remove_key_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_remove_key_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.admin_remove_key_req_v1} returns this
 */
proto.helium.iot_config.admin_remove_key_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.admin_key_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.admin_key_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.admin_key_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.admin_key_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    timestamp: jspb.Message.getFieldWithDefault(msg, 1, 0),
    signer: msg.getSigner_asB64(),
    signature: msg.getSignature_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.admin_key_res_v1}
 */
proto.helium.iot_config.admin_key_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.admin_key_res_v1;
  return proto.helium.iot_config.admin_key_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.admin_key_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.admin_key_res_v1}
 */
proto.helium.iot_config.admin_key_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_key_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.admin_key_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.admin_key_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.admin_key_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
};


/**
 * optional uint64 timestamp = 1;
 * @return {number}
 */
proto.helium.iot_config.admin_key_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.admin_key_res_v1} returns this
 */
proto.helium.iot_config.admin_key_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional bytes signer = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.admin_key_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes signer = 2;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.admin_key_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_key_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.admin_key_res_v1} returns this
 */
proto.helium.iot_config.admin_key_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 2, value);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.admin_key_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.admin_key_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.admin_key_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.admin_key_res_v1} returns this
 */
proto.helium.iot_config.admin_key_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.gateway_metadata.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.gateway_metadata.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.gateway_metadata} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_metadata.toObject = function(includeInstance, msg) {
  var f, obj = {
    location: jspb.Message.getFieldWithDefault(msg, 1, ""),
    region: jspb.Message.getFieldWithDefault(msg, 2, 0),
    gain: jspb.Message.getFieldWithDefault(msg, 3, 0),
    elevation: jspb.Message.getFieldWithDefault(msg, 4, 0)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.gateway_metadata}
 */
proto.helium.iot_config.gateway_metadata.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.gateway_metadata;
  return proto.helium.iot_config.gateway_metadata.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.gateway_metadata} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.gateway_metadata}
 */
proto.helium.iot_config.gateway_metadata.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {string} */ (reader.readString());
      msg.setLocation(value);
      break;
    case 2:
      var value = /** @type {!proto.helium.region} */ (reader.readEnum());
      msg.setRegion(value);
      break;
    case 3:
      var value = /** @type {number} */ (reader.readInt32());
      msg.setGain(value);
      break;
    case 4:
      var value = /** @type {number} */ (reader.readInt32());
      msg.setElevation(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_metadata.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.gateway_metadata.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.gateway_metadata} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_metadata.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getLocation();
  if (f.length > 0) {
    writer.writeString(
      1,
      f
    );
  }
  f = message.getRegion();
  if (f !== 0.0) {
    writer.writeEnum(
      2,
      f
    );
  }
  f = message.getGain();
  if (f !== 0) {
    writer.writeInt32(
      3,
      f
    );
  }
  f = message.getElevation();
  if (f !== 0) {
    writer.writeInt32(
      4,
      f
    );
  }
};


/**
 * optional string location = 1;
 * @return {string}
 */
proto.helium.iot_config.gateway_metadata.prototype.getLocation = function() {
  return /** @type {string} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * @param {string} value
 * @return {!proto.helium.iot_config.gateway_metadata} returns this
 */
proto.helium.iot_config.gateway_metadata.prototype.setLocation = function(value) {
  return jspb.Message.setProto3StringField(this, 1, value);
};


/**
 * optional helium.region region = 2;
 * @return {!proto.helium.region}
 */
proto.helium.iot_config.gateway_metadata.prototype.getRegion = function() {
  return /** @type {!proto.helium.region} */ (jspb.Message.getFieldWithDefault(this, 2, 0));
};


/**
 * @param {!proto.helium.region} value
 * @return {!proto.helium.iot_config.gateway_metadata} returns this
 */
proto.helium.iot_config.gateway_metadata.prototype.setRegion = function(value) {
  return jspb.Message.setProto3EnumField(this, 2, value);
};


/**
 * optional int32 gain = 3;
 * @return {number}
 */
proto.helium.iot_config.gateway_metadata.prototype.getGain = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 3, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.gateway_metadata} returns this
 */
proto.helium.iot_config.gateway_metadata.prototype.setGain = function(value) {
  return jspb.Message.setProto3IntField(this, 3, value);
};


/**
 * optional int32 elevation = 4;
 * @return {number}
 */
proto.helium.iot_config.gateway_metadata.prototype.getElevation = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 4, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.gateway_metadata} returns this
 */
proto.helium.iot_config.gateway_metadata.prototype.setElevation = function(value) {
  return jspb.Message.setProto3IntField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.gateway_info.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.gateway_info.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.gateway_info} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_info.toObject = function(includeInstance, msg) {
  var f, obj = {
    address: msg.getAddress_asB64(),
    isFullHotspot: jspb.Message.getBooleanFieldWithDefault(msg, 2, false),
    metadata: (f = msg.getMetadata()) && proto.helium.iot_config.gateway_metadata.toObject(includeInstance, f)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.gateway_info}
 */
proto.helium.iot_config.gateway_info.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.gateway_info;
  return proto.helium.iot_config.gateway_info.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.gateway_info} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.gateway_info}
 */
proto.helium.iot_config.gateway_info.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setAddress(value);
      break;
    case 2:
      var value = /** @type {boolean} */ (reader.readBool());
      msg.setIsFullHotspot(value);
      break;
    case 3:
      var value = new proto.helium.iot_config.gateway_metadata;
      reader.readMessage(value,proto.helium.iot_config.gateway_metadata.deserializeBinaryFromReader);
      msg.setMetadata(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_info.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.gateway_info.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.gateway_info} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_info.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getAddress_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      1,
      f
    );
  }
  f = message.getIsFullHotspot();
  if (f) {
    writer.writeBool(
      2,
      f
    );
  }
  f = message.getMetadata();
  if (f != null) {
    writer.writeMessage(
      3,
      f,
      proto.helium.iot_config.gateway_metadata.serializeBinaryToWriter
    );
  }
};


/**
 * optional bytes address = 1;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_info.prototype.getAddress = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * optional bytes address = 1;
 * This is a type-conversion wrapper around `getAddress()`
 * @return {string}
 */
proto.helium.iot_config.gateway_info.prototype.getAddress_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getAddress()));
};


/**
 * optional bytes address = 1;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getAddress()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_info.prototype.getAddress_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getAddress()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_info} returns this
 */
proto.helium.iot_config.gateway_info.prototype.setAddress = function(value) {
  return jspb.Message.setProto3BytesField(this, 1, value);
};


/**
 * optional bool is_full_hotspot = 2;
 * @return {boolean}
 */
proto.helium.iot_config.gateway_info.prototype.getIsFullHotspot = function() {
  return /** @type {boolean} */ (jspb.Message.getBooleanFieldWithDefault(this, 2, false));
};


/**
 * @param {boolean} value
 * @return {!proto.helium.iot_config.gateway_info} returns this
 */
proto.helium.iot_config.gateway_info.prototype.setIsFullHotspot = function(value) {
  return jspb.Message.setProto3BooleanField(this, 2, value);
};


/**
 * optional gateway_metadata metadata = 3;
 * @return {?proto.helium.iot_config.gateway_metadata}
 */
proto.helium.iot_config.gateway_info.prototype.getMetadata = function() {
  return /** @type{?proto.helium.iot_config.gateway_metadata} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.gateway_metadata, 3));
};


/**
 * @param {?proto.helium.iot_config.gateway_metadata|undefined} value
 * @return {!proto.helium.iot_config.gateway_info} returns this
*/
proto.helium.iot_config.gateway_info.prototype.setMetadata = function(value) {
  return jspb.Message.setWrapperField(this, 3, value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.gateway_info} returns this
 */
proto.helium.iot_config.gateway_info.prototype.clearMetadata = function() {
  return this.setMetadata(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.gateway_info.prototype.hasMetadata = function() {
  return jspb.Message.getField(this, 3) != null;
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.gateway_info_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.gateway_info_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.gateway_info_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_info_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    address: msg.getAddress_asB64(),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.gateway_info_req_v1}
 */
proto.helium.iot_config.gateway_info_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.gateway_info_req_v1;
  return proto.helium.iot_config.gateway_info_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.gateway_info_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.gateway_info_req_v1}
 */
proto.helium.iot_config.gateway_info_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setAddress(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_info_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.gateway_info_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.gateway_info_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_info_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getAddress_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      1,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
};


/**
 * optional bytes address = 1;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_info_req_v1.prototype.getAddress = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 1, ""));
};


/**
 * optional bytes address = 1;
 * This is a type-conversion wrapper around `getAddress()`
 * @return {string}
 */
proto.helium.iot_config.gateway_info_req_v1.prototype.getAddress_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getAddress()));
};


/**
 * optional bytes address = 1;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getAddress()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_info_req_v1.prototype.getAddress_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getAddress()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_info_req_v1} returns this
 */
proto.helium.iot_config.gateway_info_req_v1.prototype.setAddress = function(value) {
  return jspb.Message.setProto3BytesField(this, 1, value);
};


/**
 * optional bytes signature = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_info_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes signature = 2;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.gateway_info_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_info_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_info_req_v1} returns this
 */
proto.helium.iot_config.gateway_info_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 2, value);
};


/**
 * optional bytes signer = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_info_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signer = 3;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.gateway_info_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_info_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_info_req_v1} returns this
 */
proto.helium.iot_config.gateway_info_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.gateway_info_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.gateway_info_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.gateway_info_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_info_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    timestamp: jspb.Message.getFieldWithDefault(msg, 1, 0),
    info: (f = msg.getInfo()) && proto.helium.iot_config.gateway_info.toObject(includeInstance, f),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.gateway_info_res_v1}
 */
proto.helium.iot_config.gateway_info_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.gateway_info_res_v1;
  return proto.helium.iot_config.gateway_info_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.gateway_info_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.gateway_info_res_v1}
 */
proto.helium.iot_config.gateway_info_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 2:
      var value = new proto.helium.iot_config.gateway_info;
      reader.readMessage(value,proto.helium.iot_config.gateway_info.deserializeBinaryFromReader);
      msg.setInfo(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_info_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.gateway_info_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.gateway_info_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_info_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getInfo();
  if (f != null) {
    writer.writeMessage(
      2,
      f,
      proto.helium.iot_config.gateway_info.serializeBinaryToWriter
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * optional uint64 timestamp = 1;
 * @return {number}
 */
proto.helium.iot_config.gateway_info_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.gateway_info_res_v1} returns this
 */
proto.helium.iot_config.gateway_info_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional gateway_info info = 2;
 * @return {?proto.helium.iot_config.gateway_info}
 */
proto.helium.iot_config.gateway_info_res_v1.prototype.getInfo = function() {
  return /** @type{?proto.helium.iot_config.gateway_info} */ (
    jspb.Message.getWrapperField(this, proto.helium.iot_config.gateway_info, 2));
};


/**
 * @param {?proto.helium.iot_config.gateway_info|undefined} value
 * @return {!proto.helium.iot_config.gateway_info_res_v1} returns this
*/
proto.helium.iot_config.gateway_info_res_v1.prototype.setInfo = function(value) {
  return jspb.Message.setWrapperField(this, 2, value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.gateway_info_res_v1} returns this
 */
proto.helium.iot_config.gateway_info_res_v1.prototype.clearInfo = function() {
  return this.setInfo(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.gateway_info_res_v1.prototype.hasInfo = function() {
  return jspb.Message.getField(this, 2) != null;
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_info_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.gateway_info_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_info_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_info_res_v1} returns this
 */
proto.helium.iot_config.gateway_info_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signer = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_info_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signer = 4;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.gateway_info_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_info_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_info_res_v1} returns this
 */
proto.helium.iot_config.gateway_info_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.gateway_info_stream_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.gateway_info_stream_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.gateway_info_stream_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_info_stream_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    batchSize: jspb.Message.getFieldWithDefault(msg, 1, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.gateway_info_stream_req_v1}
 */
proto.helium.iot_config.gateway_info_stream_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.gateway_info_stream_req_v1;
  return proto.helium.iot_config.gateway_info_stream_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.gateway_info_stream_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.gateway_info_stream_req_v1}
 */
proto.helium.iot_config.gateway_info_stream_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint32());
      msg.setBatchSize(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_info_stream_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.gateway_info_stream_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.gateway_info_stream_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_info_stream_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getBatchSize();
  if (f !== 0) {
    writer.writeUint32(
      1,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
};


/**
 * optional uint32 batch_size = 1;
 * @return {number}
 */
proto.helium.iot_config.gateway_info_stream_req_v1.prototype.getBatchSize = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.gateway_info_stream_req_v1} returns this
 */
proto.helium.iot_config.gateway_info_stream_req_v1.prototype.setBatchSize = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * optional bytes signature = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_info_stream_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes signature = 2;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.gateway_info_stream_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_info_stream_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_info_stream_req_v1} returns this
 */
proto.helium.iot_config.gateway_info_stream_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 2, value);
};


/**
 * optional bytes signer = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_info_stream_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signer = 3;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.gateway_info_stream_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_info_stream_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_info_stream_req_v1} returns this
 */
proto.helium.iot_config.gateway_info_stream_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};



/**
 * List of repeated fields within this message type.
 * @private {!Array<number>}
 * @const
 */
proto.helium.iot_config.gateway_info_stream_res_v1.repeatedFields_ = [2];



if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.gateway_info_stream_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.gateway_info_stream_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.gateway_info_stream_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_info_stream_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    timestamp: jspb.Message.getFieldWithDefault(msg, 1, 0),
    gatewaysList: jspb.Message.toObjectList(msg.getGatewaysList(),
    proto.helium.iot_config.gateway_info.toObject, includeInstance),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.gateway_info_stream_res_v1}
 */
proto.helium.iot_config.gateway_info_stream_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.gateway_info_stream_res_v1;
  return proto.helium.iot_config.gateway_info_stream_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.gateway_info_stream_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.gateway_info_stream_res_v1}
 */
proto.helium.iot_config.gateway_info_stream_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    case 2:
      var value = new proto.helium.iot_config.gateway_info;
      reader.readMessage(value,proto.helium.iot_config.gateway_info.deserializeBinaryFromReader);
      msg.addGateways(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_info_stream_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.gateway_info_stream_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.gateway_info_stream_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.gateway_info_stream_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      1,
      f
    );
  }
  f = message.getGatewaysList();
  if (f.length > 0) {
    writer.writeRepeatedMessage(
      2,
      f,
      proto.helium.iot_config.gateway_info.serializeBinaryToWriter
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
};


/**
 * optional uint64 timestamp = 1;
 * @return {number}
 */
proto.helium.iot_config.gateway_info_stream_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.gateway_info_stream_res_v1} returns this
 */
proto.helium.iot_config.gateway_info_stream_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 1, value);
};


/**
 * repeated gateway_info gateways = 2;
 * @return {!Array<!proto.helium.iot_config.gateway_info>}
 */
proto.helium.iot_config.gateway_info_stream_res_v1.prototype.getGatewaysList = function() {
  return /** @type{!Array<!proto.helium.iot_config.gateway_info>} */ (
    jspb.Message.getRepeatedWrapperField(this, proto.helium.iot_config.gateway_info, 2));
};


/**
 * @param {!Array<!proto.helium.iot_config.gateway_info>} value
 * @return {!proto.helium.iot_config.gateway_info_stream_res_v1} returns this
*/
proto.helium.iot_config.gateway_info_stream_res_v1.prototype.setGatewaysList = function(value) {
  return jspb.Message.setRepeatedWrapperField(this, 2, value);
};


/**
 * @param {!proto.helium.iot_config.gateway_info=} opt_value
 * @param {number=} opt_index
 * @return {!proto.helium.iot_config.gateway_info}
 */
proto.helium.iot_config.gateway_info_stream_res_v1.prototype.addGateways = function(opt_value, opt_index) {
  return jspb.Message.addToRepeatedWrapperField(this, 2, opt_value, proto.helium.iot_config.gateway_info, opt_index);
};


/**
 * Clears the list making it empty but non-null.
 * @return {!proto.helium.iot_config.gateway_info_stream_res_v1} returns this
 */
proto.helium.iot_config.gateway_info_stream_res_v1.prototype.clearGatewaysList = function() {
  return this.setGatewaysList([]);
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_info_stream_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.gateway_info_stream_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_info_stream_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_info_stream_res_v1} returns this
 */
proto.helium.iot_config.gateway_info_stream_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signer = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.gateway_info_stream_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signer = 4;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.gateway_info_stream_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.gateway_info_stream_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.gateway_info_stream_res_v1} returns this
 */
proto.helium.iot_config.gateway_info_stream_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.region_params_req_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.region_params_req_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.region_params_req_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.region_params_req_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    region: jspb.Message.getFieldWithDefault(msg, 1, 0),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64()
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.region_params_req_v1}
 */
proto.helium.iot_config.region_params_req_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.region_params_req_v1;
  return proto.helium.iot_config.region_params_req_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.region_params_req_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.region_params_req_v1}
 */
proto.helium.iot_config.region_params_req_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!proto.helium.region} */ (reader.readEnum());
      msg.setRegion(value);
      break;
    case 2:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.region_params_req_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.region_params_req_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.region_params_req_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.region_params_req_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRegion();
  if (f !== 0.0) {
    writer.writeEnum(
      1,
      f
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      2,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
};


/**
 * optional helium.region region = 1;
 * @return {!proto.helium.region}
 */
proto.helium.iot_config.region_params_req_v1.prototype.getRegion = function() {
  return /** @type {!proto.helium.region} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {!proto.helium.region} value
 * @return {!proto.helium.iot_config.region_params_req_v1} returns this
 */
proto.helium.iot_config.region_params_req_v1.prototype.setRegion = function(value) {
  return jspb.Message.setProto3EnumField(this, 1, value);
};


/**
 * optional bytes signature = 2;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.region_params_req_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 2, ""));
};


/**
 * optional bytes signature = 2;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.region_params_req_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 2;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.region_params_req_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.region_params_req_v1} returns this
 */
proto.helium.iot_config.region_params_req_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 2, value);
};


/**
 * optional bytes signer = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.region_params_req_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signer = 3;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.region_params_req_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.region_params_req_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.region_params_req_v1} returns this
 */
proto.helium.iot_config.region_params_req_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};





if (jspb.Message.GENERATE_TO_OBJECT) {
/**
 * Creates an object representation of this proto.
 * Field names that are reserved in JavaScript and will be renamed to pb_name.
 * Optional fields that are not set will be set to undefined.
 * To access a reserved field use, foo.pb_<name>, eg, foo.pb_default.
 * For the list of reserved names please see:
 *     net/proto2/compiler/js/internal/generator.cc#kKeyword.
 * @param {boolean=} opt_includeInstance Deprecated. whether to include the
 *     JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @return {!Object}
 */
proto.helium.iot_config.region_params_res_v1.prototype.toObject = function(opt_includeInstance) {
  return proto.helium.iot_config.region_params_res_v1.toObject(opt_includeInstance, this);
};


/**
 * Static version of the {@see toObject} method.
 * @param {boolean|undefined} includeInstance Deprecated. Whether to include
 *     the JSPB instance for transitional soy proto support:
 *     http://goto/soy-param-migration
 * @param {!proto.helium.iot_config.region_params_res_v1} msg The msg instance to transform.
 * @return {!Object}
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.region_params_res_v1.toObject = function(includeInstance, msg) {
  var f, obj = {
    region: jspb.Message.getFieldWithDefault(msg, 1, 0),
    params: (f = msg.getParams()) && blockchain_region_param_v1_pb.blockchain_region_params_v1.toObject(includeInstance, f),
    signature: msg.getSignature_asB64(),
    signer: msg.getSigner_asB64(),
    timestamp: jspb.Message.getFieldWithDefault(msg, 5, 0)
  };

  if (includeInstance) {
    obj.$jspbMessageInstance = msg;
  }
  return obj;
};
}


/**
 * Deserializes binary data (in protobuf wire format).
 * @param {jspb.ByteSource} bytes The bytes to deserialize.
 * @return {!proto.helium.iot_config.region_params_res_v1}
 */
proto.helium.iot_config.region_params_res_v1.deserializeBinary = function(bytes) {
  var reader = new jspb.BinaryReader(bytes);
  var msg = new proto.helium.iot_config.region_params_res_v1;
  return proto.helium.iot_config.region_params_res_v1.deserializeBinaryFromReader(msg, reader);
};


/**
 * Deserializes binary data (in protobuf wire format) from the
 * given reader into the given message object.
 * @param {!proto.helium.iot_config.region_params_res_v1} msg The message object to deserialize into.
 * @param {!jspb.BinaryReader} reader The BinaryReader to use.
 * @return {!proto.helium.iot_config.region_params_res_v1}
 */
proto.helium.iot_config.region_params_res_v1.deserializeBinaryFromReader = function(msg, reader) {
  while (reader.nextField()) {
    if (reader.isEndGroup()) {
      break;
    }
    var field = reader.getFieldNumber();
    switch (field) {
    case 1:
      var value = /** @type {!proto.helium.region} */ (reader.readEnum());
      msg.setRegion(value);
      break;
    case 2:
      var value = new blockchain_region_param_v1_pb.blockchain_region_params_v1;
      reader.readMessage(value,blockchain_region_param_v1_pb.blockchain_region_params_v1.deserializeBinaryFromReader);
      msg.setParams(value);
      break;
    case 3:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSignature(value);
      break;
    case 4:
      var value = /** @type {!Uint8Array} */ (reader.readBytes());
      msg.setSigner(value);
      break;
    case 5:
      var value = /** @type {number} */ (reader.readUint64());
      msg.setTimestamp(value);
      break;
    default:
      reader.skipField();
      break;
    }
  }
  return msg;
};


/**
 * Serializes the message to binary data (in protobuf wire format).
 * @return {!Uint8Array}
 */
proto.helium.iot_config.region_params_res_v1.prototype.serializeBinary = function() {
  var writer = new jspb.BinaryWriter();
  proto.helium.iot_config.region_params_res_v1.serializeBinaryToWriter(this, writer);
  return writer.getResultBuffer();
};


/**
 * Serializes the given message to binary data (in protobuf wire
 * format), writing to the given BinaryWriter.
 * @param {!proto.helium.iot_config.region_params_res_v1} message
 * @param {!jspb.BinaryWriter} writer
 * @suppress {unusedLocalVariables} f is only used for nested messages
 */
proto.helium.iot_config.region_params_res_v1.serializeBinaryToWriter = function(message, writer) {
  var f = undefined;
  f = message.getRegion();
  if (f !== 0.0) {
    writer.writeEnum(
      1,
      f
    );
  }
  f = message.getParams();
  if (f != null) {
    writer.writeMessage(
      2,
      f,
      blockchain_region_param_v1_pb.blockchain_region_params_v1.serializeBinaryToWriter
    );
  }
  f = message.getSignature_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      3,
      f
    );
  }
  f = message.getSigner_asU8();
  if (f.length > 0) {
    writer.writeBytes(
      4,
      f
    );
  }
  f = message.getTimestamp();
  if (f !== 0) {
    writer.writeUint64(
      5,
      f
    );
  }
};


/**
 * optional helium.region region = 1;
 * @return {!proto.helium.region}
 */
proto.helium.iot_config.region_params_res_v1.prototype.getRegion = function() {
  return /** @type {!proto.helium.region} */ (jspb.Message.getFieldWithDefault(this, 1, 0));
};


/**
 * @param {!proto.helium.region} value
 * @return {!proto.helium.iot_config.region_params_res_v1} returns this
 */
proto.helium.iot_config.region_params_res_v1.prototype.setRegion = function(value) {
  return jspb.Message.setProto3EnumField(this, 1, value);
};


/**
 * optional helium.blockchain_region_params_v1 params = 2;
 * @return {?proto.helium.blockchain_region_params_v1}
 */
proto.helium.iot_config.region_params_res_v1.prototype.getParams = function() {
  return /** @type{?proto.helium.blockchain_region_params_v1} */ (
    jspb.Message.getWrapperField(this, blockchain_region_param_v1_pb.blockchain_region_params_v1, 2));
};


/**
 * @param {?proto.helium.blockchain_region_params_v1|undefined} value
 * @return {!proto.helium.iot_config.region_params_res_v1} returns this
*/
proto.helium.iot_config.region_params_res_v1.prototype.setParams = function(value) {
  return jspb.Message.setWrapperField(this, 2, value);
};


/**
 * Clears the message field making it undefined.
 * @return {!proto.helium.iot_config.region_params_res_v1} returns this
 */
proto.helium.iot_config.region_params_res_v1.prototype.clearParams = function() {
  return this.setParams(undefined);
};


/**
 * Returns whether this field is set.
 * @return {boolean}
 */
proto.helium.iot_config.region_params_res_v1.prototype.hasParams = function() {
  return jspb.Message.getField(this, 2) != null;
};


/**
 * optional bytes signature = 3;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.region_params_res_v1.prototype.getSignature = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 3, ""));
};


/**
 * optional bytes signature = 3;
 * This is a type-conversion wrapper around `getSignature()`
 * @return {string}
 */
proto.helium.iot_config.region_params_res_v1.prototype.getSignature_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSignature()));
};


/**
 * optional bytes signature = 3;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSignature()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.region_params_res_v1.prototype.getSignature_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSignature()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.region_params_res_v1} returns this
 */
proto.helium.iot_config.region_params_res_v1.prototype.setSignature = function(value) {
  return jspb.Message.setProto3BytesField(this, 3, value);
};


/**
 * optional bytes signer = 4;
 * @return {!(string|Uint8Array)}
 */
proto.helium.iot_config.region_params_res_v1.prototype.getSigner = function() {
  return /** @type {!(string|Uint8Array)} */ (jspb.Message.getFieldWithDefault(this, 4, ""));
};


/**
 * optional bytes signer = 4;
 * This is a type-conversion wrapper around `getSigner()`
 * @return {string}
 */
proto.helium.iot_config.region_params_res_v1.prototype.getSigner_asB64 = function() {
  return /** @type {string} */ (jspb.Message.bytesAsB64(
      this.getSigner()));
};


/**
 * optional bytes signer = 4;
 * Note that Uint8Array is not supported on all browsers.
 * @see http://caniuse.com/Uint8Array
 * This is a type-conversion wrapper around `getSigner()`
 * @return {!Uint8Array}
 */
proto.helium.iot_config.region_params_res_v1.prototype.getSigner_asU8 = function() {
  return /** @type {!Uint8Array} */ (jspb.Message.bytesAsU8(
      this.getSigner()));
};


/**
 * @param {!(string|Uint8Array)} value
 * @return {!proto.helium.iot_config.region_params_res_v1} returns this
 */
proto.helium.iot_config.region_params_res_v1.prototype.setSigner = function(value) {
  return jspb.Message.setProto3BytesField(this, 4, value);
};


/**
 * optional uint64 timestamp = 5;
 * @return {number}
 */
proto.helium.iot_config.region_params_res_v1.prototype.getTimestamp = function() {
  return /** @type {number} */ (jspb.Message.getFieldWithDefault(this, 5, 0));
};


/**
 * @param {number} value
 * @return {!proto.helium.iot_config.region_params_res_v1} returns this
 */
proto.helium.iot_config.region_params_res_v1.prototype.setTimestamp = function(value) {
  return jspb.Message.setProto3IntField(this, 5, value);
};


/**
 * @enum {number}
 */
proto.helium.iot_config.action_v1 = {
  ADD: 0,
  REMOVE: 1
};

goog.object.extend(exports, proto.helium.iot_config);
