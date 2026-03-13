import { latLngToCell } from "h3-js";

const IOT_H3_RESOLUTION = 12;
const MOBILE_H3_RESOLUTION = 12;

interface LatLng {
  lat: number;
  lng: number;
}

interface H3Location {
  iot: string;
  mobile: string;
}

export function latLngToH3(location: LatLng): H3Location {
  return {
    iot: latLngToCell(location.lat, location.lng, IOT_H3_RESOLUTION),
    mobile: latLngToCell(location.lat, location.lng, MOBILE_H3_RESOLUTION),
  };
}

export function latLngToIotH3(location: LatLng): string {
  return latLngToCell(location.lat, location.lng, IOT_H3_RESOLUTION);
}

export function latLngToMobileH3(location: LatLng): string {
  return latLngToCell(location.lat, location.lng, MOBILE_H3_RESOLUTION);
}

export { IOT_H3_RESOLUTION, MOBILE_H3_RESOLUTION };
