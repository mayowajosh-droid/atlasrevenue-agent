import type { BuyerOfficer } from "./types.js";

const CH_BASE = "https://api.company-information.service.gov.uk";

function authHeader(): Record<string, string> {
  const key = process.env.COMPANIES_HOUSE_API_KEY || "";
  if (!key) return {};
  return { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` };
}

type RawOfficer = {
  name: string;
  officer_role: string;
  appointed_on?: string;
  resigned_on?: string;
  nationality?: string;
  occupation?: string;
};

type RawPsc = {
  name?: string;
  name_elements?: { title?: string; forename?: string; surname?: string };
  kind: string;
  notified_on?: string;
  ceased_on?: string;
  nationality?: string;
  natures_of_control?: string[];
};

export async function fetchOfficers(companyNumber: string): Promise<Omit<BuyerOfficer, "id" | "fetched_at" | "buyer_entity_id">[]> {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key || !companyNumber) return [];

  try {
    const res = await fetch(`${CH_BASE}/company/${encodeURIComponent(companyNumber)}/officers?items_per_page=50`, {
      headers: { ...authHeader(), Accept: "application/json" }
    });
    if (!res.ok) return [];

    const data = await res.json();
    const items: RawOfficer[] = Array.isArray(data.items) ? data.items : [];

    return items
      .filter(o => !o.resigned_on)
      .map(o => ({
        name: o.name || "",
        role: o.officer_role || "unknown",
        appointed_on: o.appointed_on || null,
        resigned_on: o.resigned_on || null,
        nationality: o.nationality || null,
        occupation: o.occupation || null,
        source: "officer" as const,
      }))
      .filter(o => o.name.length > 1);
  } catch {
    return [];
  }
}

export async function fetchPscs(companyNumber: string): Promise<Omit<BuyerOfficer, "id" | "fetched_at" | "buyer_entity_id">[]> {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key || !companyNumber) return [];

  try {
    const res = await fetch(`${CH_BASE}/company/${encodeURIComponent(companyNumber)}/persons-with-significant-control?items_per_page=25`, {
      headers: { ...authHeader(), Accept: "application/json" }
    });
    if (!res.ok) return [];

    const data = await res.json();
    const items: RawPsc[] = Array.isArray(data.items) ? data.items : [];

    return items
      .filter(p => !p.ceased_on && p.kind?.includes("individual"))
      .map(p => {
        const name = p.name || [p.name_elements?.forename, p.name_elements?.surname].filter(Boolean).join(" ") || "";
        return {
          name,
          role: (p.natures_of_control || []).join(", ") || "psc",
          appointed_on: p.notified_on || null,
          resigned_on: p.ceased_on || null,
          nationality: p.nationality || null,
          occupation: null,
          source: "psc" as const,
        };
      })
      .filter(o => o.name.length > 1);
  } catch {
    return [];
  }
}

export async function fetchCompanyProfile(companyNumber: string): Promise<{
  name: string;
  status: string;
  type: string;
  address: string;
  sicCodes: string[];
  dateOfCreation: string | null;
} | null> {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key || !companyNumber) return null;

  try {
    const res = await fetch(`${CH_BASE}/company/${encodeURIComponent(companyNumber)}`, {
      headers: { ...authHeader(), Accept: "application/json" }
    });
    if (!res.ok) return null;

    const data = await res.json();
    const addr = data.registered_office_address;
    const address = addr
      ? [addr.address_line_1, addr.address_line_2, addr.locality, addr.region, addr.postal_code].filter(Boolean).join(", ")
      : "";

    return {
      name: data.company_name || "",
      status: data.company_status || "",
      type: data.type || "",
      address,
      sicCodes: Array.isArray(data.sic_codes) ? data.sic_codes : [],
      dateOfCreation: data.date_of_creation || null,
    };
  } catch {
    return null;
  }
}
