import { z } from "zod";

export const intakeSchema = z.object({
  companyName: z.string().min(2),
  clientEmail: z.string().email().optional().or(z.literal("")).default(""),
  email: z.string().email().optional().or(z.literal("")).default(""),
  website: z.string().optional().default(""),
  location: z.string().optional().default(""),
  areasServed: z.string().optional().default(""),
  mainServices: z.string().min(5),
  secondaryServices: z.string().optional().default(""),
  idealBuyers: z.string().optional().default(""),
  idealContractSize: z.string().optional().default(""),
  maximumContractSize: z.string().optional().default(""),
  teamSize: z.string().optional().default(""),
  publicSectorExperience: z.string().optional().default(""),
  caseStudies: z.string().optional().default(""),
  certifications: z.string().optional().default(""),
  excludedServices: z.string().optional().default(""),
  regionsToScan: z.string().optional().default(""),
  mainGoal: z.string().optional().default(""),
  biggestConcern: z.string().optional().default(""),
  preferredOutput: z.string().optional().default(""),
  frameworkStatus: z.string().optional().default(""),
  lastPublicContract: z.string().optional().default("")
});

export function clientEmailFromInput(input: z.infer<typeof intakeSchema>) {
  return input.clientEmail || input.email || null;
}
