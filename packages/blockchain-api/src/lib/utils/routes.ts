export const ROUTE_HOME = "/";
export const ROUTE_SUPPORT = "/support";
export const ROUTE_HOW_IT_WORKS = "/how-it-works";
export const ROUTE_INVITES = "/invites";
export const ROUTE_DASHBOARD = "/dashboard";
export const ROUTE_MIGRATE = "/migrate";

export const dashboard = (walletAddress: string) =>
  `/dashboard/${walletAddress}`;
export const invites = (welcomePack: string) => `/invites/${welcomePack}`;
export const hotspots = (hotspotId: string) => `/hotspots/${hotspotId}`;

export const PUBLIC_ROUTES = [
  ROUTE_HOME,
  ROUTE_SUPPORT,
  ROUTE_HOW_IT_WORKS,
  ROUTE_DASHBOARD,
  ROUTE_INVITES,
  ROUTE_MIGRATE,
];
