import { CompanyHouseRecord } from "../types.js";

export function companyHouseAddress(address: any) {
  if (!address) return "";
  return [
    address.premises,
    address.address_line_1,
    address.address_line_2,
    address.locality,
    address.region,
    address.postal_code,
    address.country
  ].filter(Boolean).join(", ");
}

export async function companiesHouseSearch(companyName: string): Promise<{ matches: CompanyHouseRecord[]; errors: string[] }> {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY || "";
  const errors: string[] = [];

  if (!apiKey || !companyName.trim()) {
    return { matches: [], errors: apiKey ? [] : ["Companies House API key not configured."] };
  }

  try {
    const url = new URL("https://api.company-information.service.gov.uk/search/companies");
    url.searchParams.set("q", companyName.trim());
    url.searchParams.set("items_per_page", "5");

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return { matches: [], errors: [`Companies House search failed: ${response.status} ${response.statusText}`] };
    }

    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];

    const matches = items.map((item: any): CompanyHouseRecord => ({
      companyName: String(item.title || item.company_name || "").trim(),
      companyNumber: String(item.company_number || ""),
      companyStatus: String(item.company_status || ""),
      companyType: String(item.company_type || ""),
      dateOfCreation: item.date_of_creation || null,
      address: companyHouseAddress(item.address),
      sicCodes: Array.isArray(item.sic_codes) ? item.sic_codes.map(String) : [],
      url: item.links?.self
        ? `https://find-and-update.company-information.service.gov.uk${item.links.self}`
        : "https://find-and-update.company-information.service.gov.uk/"
    })).filter((item: CompanyHouseRecord) => item.companyName && item.companyNumber);

    return { matches, errors };
  } catch (error: any) {
    return { matches: [], errors: [error?.message || String(error)] };
  }
}
