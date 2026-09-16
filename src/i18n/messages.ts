/**
 * PC-7 — Canonical Admin Next message catalog.
 * Built from semantic namespaces under ./namespaces.
 * Domain presentation maps (financeTerminology, statusPresentation, geography)
 * remain authoritative for their domains — do not duplicate those here.
 */

import { common } from "./namespaces/common";
import { navigation } from "./namespaces/navigation";
import { dashboard } from "./namespaces/dashboard";
import { tripsNs } from "./namespaces/trips";
import { driversNs } from "./namespaces/drivers";
import { usersNs } from "./namespaces/users";
import { geographyNs } from "./namespaces/geography";
import { dataQualityNs } from "./namespaces/dataQuality";
import { catalogNs } from "./namespaces/catalog";

export type Locale = "ar" | "en";

export const messages = {
  en: {
    ...common.en,
    ...navigation.en,
    ...dashboard.en,
    ...tripsNs.en,
    ...driversNs.en,
    ...usersNs.en,
    ...geographyNs.en,
    ...dataQualityNs.en,
    ...catalogNs.en,
  },
  ar: {
    ...common.ar,
    ...navigation.ar,
    ...dashboard.ar,
    ...tripsNs.ar,
    ...driversNs.ar,
    ...usersNs.ar,
    ...geographyNs.ar,
    ...dataQualityNs.ar,
    ...catalogNs.ar,
  },
} as const;

export type MessageKey = keyof typeof messages.en;

export function t(locale: Locale, key: MessageKey): string {
  return messages[locale][key] ?? messages.en[key] ?? String(key);
}

export function hasMessageKey(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(messages.en, key);
}

export { I18N_NAMESPACES } from "./namespaces/index";
