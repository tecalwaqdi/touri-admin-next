/** Shared locale type for namespace catalogs. */
export type Locale = "ar" | "en";

export type LocaleDict<K extends string> = Record<Locale, Record<K, string>>;
