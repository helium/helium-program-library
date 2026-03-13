import { DeviceType } from "@/types/hotspot";

export const deviceTypeImageUrl = (deviceType: DeviceType) => {
  switch (deviceType) {
    case DeviceType.WifiIndoor:
      return "/images/hotspot-indoor.png";
    case DeviceType.WifiOutdoor:
      return "/images/hotspot-outdoor.png";
    case DeviceType.WifiDataOnly:
      return "/images/hotspot-data-only.svg";
    case DeviceType.Cbrs:
      return "/images/hotspot-outdoor.png";
    case DeviceType.IotGateway:
      return "/images/hotspot-iot.png";
    default: {
      const _exhaustive: never = deviceType;
      return "/images/hotspot-iot.png";
    }
  }
};

export const formatDeviceType = (deviceType: DeviceType) => {
  switch (deviceType) {
    case DeviceType.WifiDataOnly:
      return "Converted Wi-Fi Network";
    case DeviceType.WifiIndoor:
      return "Helium Mobile Hotspot Indoor";
    case DeviceType.WifiOutdoor:
      return "Helium Mobile Hotspot Outdoor";
    case DeviceType.Cbrs:
      return "Helium CBRs";
    case DeviceType.IotGateway:
      return "Helium IoT Gateway";
    default: {
      const _exhaustive: never = deviceType;
      return "Unknown Device";
    }
  }
};

export const formatDeviceTypeShort = (deviceType: DeviceType) => {
  switch (deviceType) {
    case DeviceType.WifiDataOnly:
      return "Wi-Fi Network";
    case DeviceType.WifiIndoor:
      return "HMH Indoor";
    case DeviceType.WifiOutdoor:
      return "HMH Outdoor";
    case DeviceType.Cbrs:
      return "CBRs";
    case DeviceType.IotGateway:
      return "IoT Gateway";
    default: {
      const _exhaustive: never = deviceType;
      return "Unknown";
    }
  }
};

export const deviceTypeOgImageUrl = (deviceType: DeviceType) => {
  switch (deviceType) {
    case DeviceType.WifiIndoor:
      return "https://hm-metrics.s3.us-west-2.amazonaws.com/helium-world/assets/images/og-hotspot-indoor.png";
    case DeviceType.WifiOutdoor:
      return "https://hm-metrics.s3.us-west-2.amazonaws.com/helium-world/assets/images/og-hotspot-outdoor.png";
    case DeviceType.WifiDataOnly:
      return "https://hm-metrics.s3.us-west-2.amazonaws.com/helium-world/assets/images/og-hotspot-data-only.png";
    case DeviceType.Cbrs:
      return "https://hm-metrics.s3.us-west-2.amazonaws.com/helium-world/assets/images/og-hotspot-outdoor.png";
    case DeviceType.IotGateway:
      return "https://hm-metrics.s3.us-west-2.amazonaws.com/helium-world/assets/images/og-hotspot-iot.png";
    default: {
      const _exhaustive: never = deviceType;
      return "https://hm-metrics.s3.us-west-2.amazonaws.com/helium-world/assets/images/og-hotspot-iot.png";
    }
  }
};
