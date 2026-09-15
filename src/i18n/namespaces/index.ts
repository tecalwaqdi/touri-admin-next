import { common } from "./common";
import { navigation } from "./navigation";
import { dashboard } from "./dashboard";
import { tripsNs } from "./trips";
import { driversNs } from "./drivers";
import { usersNs } from "./users";
import { geographyNs } from "./geography";
import { dataQualityNs } from "./dataQuality";

/** Semantic namespace ids (documentation / inventory). */
export const I18N_NAMESPACES = [
  "common",
  "navigation",
  "dashboard",
  "trips",
  "drivers",
  "customers",
  "agents",
  "finance",
  "settlements",
  "reports",
  "geography",
  "users",
  "roles",
  "audit",
  "status",
  "errors",
  "dataQuality",
] as const;

export const namespaceModules = {
  common,
  navigation,
  dashboard,
  trips: tripsNs,
  drivers: driversNs,
  users: usersNs,
  geography: geographyNs,
  dataQuality: dataQualityNs,
} as const;
