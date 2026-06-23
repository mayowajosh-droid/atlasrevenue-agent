import { z } from "zod";
import { ProcurementNotice, ProcurementData } from "../types.js";
import { intakeSchema } from "../data/intake.js";
import { buildKeywords, buildRegion, SECTOR_CPV } from "../data/sectors.js";
import { resolveSectorFromInput } from "../data/sectors.js";
import { captureError } from "../config.js";
import { contractsFinderSearchAll } from "./contracts-finder.js";
import { dedupeNotices } from "./contracts-finder.js";
import { companiesHouseSearch } from "./companies-house.js";
import { findTenderSearch } from "./find-a-tender.js";
import { enrichNoticeQuality } from "./scoring.js";
import { dataQualitySummary } from "./scoring.js";
import { generateSearchKeywords } from "./keywords.js";

function nowIso() {
  return new Date().toISOString();
}

export async function pullProcurementData(input: z.infer<typeof intakeSchema>, signal?: AbortSignal): Promise<ProcurementData> {
  let keywords: string[];
  try {
    keywords = await generateSearchKeywords(input);
    console.log(`[keywords] LLM generated: ${keywords.join(", ")}`);
  } catch (err: any) {
    console.warn(`[keywords] LLM failed, using static fallback: ${err?.message}`);
    keywords = buildKeywords(input);
  }
  const regions = buildRegion(input);
  const open: ProcurementNotice[] = [];
  const awarded: ProcurementNotice[] = [];
  const errors: string[] = [];

  const now = new Date();
  // Open notices: only pull from last 90 days so live signal stays fresh
  const openPublishedFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // Awarded notices: last 18 months for meaningful buyer/value history
  const awardedDateFrom = new Date(now.getTime() - 548 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const staticCriteria = {
    keyword: null as string | null,
    queryString: null,
    regions,
    postcode: null,
    radius: 0,
    valueFrom: null,
    valueTo: null,
    publishedFrom: null,
    publishedTo: null,
    deadlineFrom: null,
    deadlineTo: null,
    approachMarketFrom: null,
    approachMarketTo: null,
    awardedFrom: null,
    awardedTo: null,
    isSubcontract: null,
    suitableForSme: true,
    suitableForVco: null,
    awardedToSme: null,
    awardedToVcse: null,
    cpvCodes: null as string[] | null
  };

  for (const keyword of keywords) {
    const base = { ...staticCriteria, keyword };

    try {
      open.push(...(await contractsFinderSearchAll(
        { ...base, types: ["Contract"], statuses: ["Open"], publishedFrom: openPublishedFrom },
        keyword,
        signal
      )));
    } catch (error: any) {
      if ((error as any)?.name === "AbortError") throw error;
      captureError(error, { dataPull: { source: "contracts_finder", status: "open", keyword } });
      errors.push(`Open search failed for "${keyword}": ${error?.message || error}`);
    }

    try {
      awarded.push(...(await contractsFinderSearchAll(
        { ...base, types: ["Contract"], statuses: ["Awarded"], awardedFrom: awardedDateFrom },
        keyword,
        signal
      )));
    } catch (error: any) {
      if ((error as any)?.name === "AbortError") throw error;
      captureError(error, { dataPull: { source: "contracts_finder", status: "awarded", keyword } });
      errors.push(`Awarded search failed for "${keyword}": ${error?.message || error}`);
    }
  }

  // CPV-code parallel pass — catches notices that keyword search misses
  const cpvCodes = SECTOR_CPV[resolveSectorFromInput(input).key] ?? null;
  if (cpvCodes) {
    const cpvBase = { ...staticCriteria, cpvCodes };
    try {
      open.push(...(await contractsFinderSearchAll(
        { ...cpvBase, types: ["Contract"], statuses: ["Open"], publishedFrom: openPublishedFrom },
        "cpv",
        signal
      )));
    } catch (error: any) {
      if ((error as any)?.name === "AbortError") throw error;
      errors.push(`CPV open search failed: ${error?.message || error}`);
    }
    try {
      awarded.push(...(await contractsFinderSearchAll(
        { ...cpvBase, types: ["Contract"], statuses: ["Awarded"], awardedFrom: awardedDateFrom },
        "cpv",
        signal
      )));
    } catch (error: any) {
      if ((error as any)?.name === "AbortError") throw error;
      errors.push(`CPV awarded search failed: ${error?.message || error}`);
    }
  }

  const companiesHouse = await companiesHouseSearch(input.companyName);
  if (companiesHouse.errors.length) {
    for (const error of companiesHouse.errors) {
      errors.push(`Companies House: ${error}`);
    }
  }

  const findTender = await findTenderSearch(keywords, signal);
  if (findTender.errors.length) {
    for (const error of findTender.errors) {
      errors.push(`Find a Tender: ${error}`);
    }
  }

  const finalOpen = dedupeNotices(open).map(notice => enrichNoticeQuality(notice, keywords));
  const finalAwarded = dedupeNotices(awarded).map(notice => enrichNoticeQuality(notice, keywords));
  const quality = dataQualitySummary(
    finalOpen,
    [...finalAwarded, ...findTender.notices],
    errors,
    keywords,
    regions
  );

  return {
    generatedAt: nowIso(),
    quality,
    keywords,
    regions,
    companiesHouse,
    findTender,
    contractsFinder: {
      open: finalOpen,
      awarded: finalAwarded,
      errors
    }
  };
}
