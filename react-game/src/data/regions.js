// Region/team data for Team Up Mode.
// Codes are ISO 3166-1 alpha-2 (uppercase). Lookups are case-insensitive.
// Grouped into the five playable continental teams plus a fallback bucket.

export const REGION_GROUPS = {
  Africa: ["AO", "BF", "BI", "BJ", "BW", "CD", "CF", "CG", "CI", "CM", "CV", "DJ", "DZ", "EG", "ER", "ET", "GA", "GH", "GM", "GN", "GQ", "GW", "KE", "KM", "LR", "LS", "LY", "MA", "MG", "ML", "MR", "MU", "MW", "MZ", "NA", "NE", "NG", "RW", "SC", "SD", "SL", "SN", "SO", "SS", "ST", "SZ", "TD", "TG", "TN", "TZ", "UG", "ZA", "ZM", "ZW"],
  Asia: ["AE", "AF", "AM", "AZ", "BD", "BH", "BN", "BT", "CN", "GE", "HK", "ID", "IL", "IN", "IQ", "IR", "JO", "JP", "KG", "KH", "KP", "KR", "KW", "KZ", "LA", "LB", "LK", "MM", "MN", "MO", "MV", "MY", "NP", "OM", "PH", "PK", "PS", "QA", "SA", "SG", "SY", "TH", "TJ", "TL", "TM", "TR", "TW", "UZ", "VN", "YE"],
  Europe: ["AD", "AL", "AT", "BA", "BE", "BG", "BY", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FO", "FR", "GB", "GI", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "RU", "SE", "SI", "SK", "SM", "UA", "VA", "XK"],
  Americas: ["AG", "AR", "AW", "BB", "BM", "BO", "BR", "BS", "BZ", "CA", "CL", "CO", "CR", "CU", "CW", "DM", "DO", "EC", "GD", "GL", "GT", "GY", "HN", "HT", "JM", "KN", "KY", "LC", "MX", "NI", "PA", "PE", "PR", "PY", "SR", "SV", "TT", "US", "UY", "VC", "VE", "VI"],
  Oceania: ["AU", "FJ", "FM", "GU", "KI", "MH", "NC", "NR", "NZ", "PF", "PG", "PW", "SB", "TO", "TV", "VU", "WS"],
  Other: [],
};

export const REGION_ORDER = ["Africa", "Asia", "Europe", "Americas", "Oceania", "Other"];

export const REGION_META = {
  Africa:   { label: "Africa",   short: "AFR", color: "#f5a623", emoji: "\u{1F30D}" },
  Asia:     { label: "Asia",     short: "ASI", color: "#ff5d5d", emoji: "\u{1F30F}" },
  Europe:   { label: "Europe",   short: "EUR", color: "#4da3ff", emoji: "\u{1F30D}" },
  Americas: { label: "Americas", short: "AME", color: "#2ecc71", emoji: "\u{1F30E}" },
  Oceania:  { label: "Oceania",  short: "OCE", color: "#b06bff", emoji: "\u{1F30F}" },
  Other:    { label: "Other",    short: "OTH", color: "#9aa4ad", emoji: "\u{1F3F3}" },
};

const REGION_BY_CODE = {};
for (const region of REGION_ORDER) {
  for (const code of REGION_GROUPS[region] || []) REGION_BY_CODE[code] = region;
}

export function getRegion(code) {
  if (!code) return "Other";
  return REGION_BY_CODE[String(code).toUpperCase()] || "Other";
}
