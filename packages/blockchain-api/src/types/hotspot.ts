export enum DeviceType {
  IotGateway = "iot-gateway",
  WifiIndoor = "wifiIndoor",
  WifiOutdoor = "wifiOutdoor",
  WifiDataOnly = "wifiDataOnly",
  Cbrs = "cbrs",
}

export type HotspotType = "iot" | "mobile" | "all";

export interface Hotspot {
  address: string;
  entityKey: string;
  name: string;
  type: "iot" | "mobile" | "all";
  deviceType: DeviceType;
  city?: string;
  state?: string;
  country?: string;
  asset: string;
  isOnline?: boolean;
  owner?: string;
  shares?: {
    fixed?: string;
    percentage?: number;
  };
  ownershipType: string;
}

export interface HotspotsData {
  hotspots: Hotspot[];
  total: number;
  page: number;
  totalPages: number;
}

export interface UseOwnedHotspotsOptions {
  type?: HotspotType;
  page?: number;
  limit?: number;
}
