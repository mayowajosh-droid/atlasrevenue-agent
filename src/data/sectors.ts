import { z } from "zod";
import { intakeSchema } from "./intake.js";
import type { SectorResult } from "../types.js";

export function buildKeywords(input: z.infer<typeof intakeSchema>): string[] {
  const text = [
    input.mainServices,
    input.secondaryServices,
    input.idealBuyers,
    input.mainGoal,
    input.preferredOutput,
    input.lastPublicContract,
    input.frameworkStatus
  ]
    .join(" ")
    .toLowerCase();

  interface SectorDef {
    key: string;
    // All triggers are multi-word phrases — score = number of these that match
    primary: string[];
    // If ANY exclusion phrase is present the sector is disqualified even if primary matched
    excludeIf?: string[];
    keywords: string[];
  }

  const SECTORS: SectorDef[] = [
    {
      key: "social-housing-maintenance",
      primary: [
        "social housing", "housing repairs", "void maintenance", "void property",
        "responsive repairs", "planned maintenance", "housing maintenance",
        "repairs and maintenance", "housing refurbishment", "almo",
        "registered social landlord", "housing association repairs",
        "housing management", "voids and planned", "resident-facing",
        "housing with care", "housing compliance", "housing contract"
      ],
      keywords: [
        "housing repairs and maintenance",
        "responsive repairs",
        "void property maintenance",
        "planned maintenance",
        "social housing maintenance",
        "housing refurbishment",
        "property maintenance housing",
        "housing compliance works"
      ]
    },
    {
      key: "housing-retrofit",
      primary: [
        "social housing retrofit", "shdf", "social housing decarbonisation",
        "housing decarbonisation", "whole house retrofit",
        "housing energy efficiency", "housing insulation", "external wall insulation",
        "loft insulation housing", "ventilation upgrade", "housing net zero"
      ],
      keywords: [
        "social housing retrofit",
        "housing decarbonisation",
        "SHDF retrofit",
        "energy efficiency housing",
        "whole house retrofit"
      ]
    },
    {
      key: "construction-qs",
      primary: [
        "quantity surveying", "quantity surveyor", "cost consultancy",
        "cost consultant", "cost management", "qs services",
        "bills of quantities", "pre-contract cost", "post-contract cost"
      ],
      excludeIf: ["social housing", "housing repairs", "void maintenance", "responsive repairs"],
      keywords: [
        "quantity surveying",
        "cost management",
        "cost consultancy",
        "construction consultancy",
        "employer's agent"
      ]
    },
    {
      key: "construction-pm",
      primary: [
        "construction project management", "employer's agent", "employer agent",
        "contract administration", "project controls", "programme management",
        "project management construction", "site management", "clerk of works"
      ],
      excludeIf: ["social housing", "housing repairs", "void maintenance", "responsive repairs"],
      keywords: [
        "construction project management",
        "project management",
        "programme management",
        "employer's agent",
        "contract administration"
      ]
    },
    {
      key: "building-surveying",
      primary: [
        "building surveying", "building survey", "condition survey",
        "six facet survey", "estate consultancy", "estate management services",
        "strategic estate", "built asset consultancy",
        "asset management consultancy", "property consultancy",
        "dilapidations", "measured survey", "planned preventive maintenance survey"
      ],
      excludeIf: ["social housing", "housing repairs", "void maintenance", "responsive repairs"],
      keywords: [
        "building surveying",
        "condition survey",
        "estate consultancy",
        "asset management",
        "property consultancy",
        "built asset consultancy"
      ]
    },
    {
      key: "cleaning",
      primary: [
        "cleaning services", "specialist cleaning", "deep cleaning",
        "clinical cleaning", "healthcare cleaning", "infection control cleaning",
        "office cleaning", "communal cleaning", "janitorial services",
        "washroom services", "bio fogging", "sanitisation services",
        "environmental cleaning", "school cleaning", "academy cleaning"
      ],
      excludeIf: ["social housing", "housing repairs", "building surveying"],
      keywords: [
        "cleaning services",
        "specialist cleaning",
        "healthcare cleaning",
        "deep cleaning",
        "infection control cleaning",
        "communal area cleaning",
        "estate cleaning",
        "school cleaning"
      ]
    },
    {
      key: "facilities-management",
      primary: [
        "facilities management", "hard fm", "soft fm",
        "total fm", "integrated fm", "fm services", "tupe fm",
        "building services maintenance", "mechanical and electrical maintenance",
        "m&e maintenance", "helpdesk services"
      ],
      excludeIf: ["social housing", "housing repairs", "void maintenance"],
      keywords: [
        "facilities management",
        "hard FM",
        "soft FM",
        "integrated facilities management",
        "building services maintenance"
      ]
    },
    {
      key: "energy-retrofit",
      primary: [
        "solar pv", "photovoltaic", "heat pump installation",
        "ev charging", "energy efficiency consultancy",
        "retrofit consultancy", "net zero consultancy",
        "decarbonisation consultancy", "energy assessment",
        "epc assessment", "insulation contractor",
        "air source heat pump", "ground source heat pump"
      ],
      excludeIf: ["social housing", "housing repairs", "housing maintenance"],
      keywords: [
        "energy efficiency",
        "retrofit",
        "solar PV",
        "heat pumps",
        "net zero services",
        "decarbonisation",
        "energy consultancy"
      ]
    },
    {
      key: "software-ict",
      primary: [
        "software development", "software services", "digital transformation",
        "saas", "cloud services", "it services", "cyber security",
        "data analytics", "app development", "technology services",
        "software platform", "managed it", "it support services"
      ],
      keywords: [
        "software development",
        "digital transformation",
        "IT services",
        "technology solutions",
        "cloud services",
        "cyber security"
      ]
    },
    {
      key: "training-skills",
      primary: [
        "training services", "learning and development", "skills training",
        "apprenticeship", "coaching services", "professional development",
        "training provider", "workforce development", "skills programme",
        "e-learning", "classroom training", "cpd training"
      ],
      keywords: [
        "training services",
        "professional development",
        "skills training",
        "apprenticeship programmes",
        "workforce development"
      ]
    },
    {
      key: "photography",
      primary: [
        "photography services", "event photography",
        "portrait photography", "graduation photography",
        "property photography", "commercial photography",
        "wedding photography", "corporate photography"
      ],
      keywords: [
        "photography",
        "event photography",
        "corporate photography",
        "property photography",
        "visual content services"
      ]
    },
    {
      key: "marketing-creative",
      primary: [
        "marketing agency", "creative agency", "communications agency",
        "content production", "video production", "campaign management",
        "brand strategy", "public relations", "media production",
        "graphic design services", "social media management"
      ],
      keywords: [
        "marketing services",
        "communications",
        "creative services",
        "content production",
        "video production"
      ]
    },
    {
      key: "healthcare",
      primary: [
        "healthcare consultancy", "nhs consultancy", "clinical services",
        "health services management", "patient pathway", "primary care services",
        "community health", "mental health services", "care home management"
      ],
      keywords: [
        "healthcare services",
        "NHS services",
        "clinical services",
        "health management",
        "patient services"
      ]
    }
  ];

  // Score each sector: count primary phrase matches, skip if excluded
  const scored = SECTORS
    .filter(def => !def.excludeIf?.some(exc => text.includes(exc)))
    .map(def => ({
      def,
      score: def.primary.filter(t => text.includes(t)).length
    }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    // Fallback: extract service phrases directly from intake
    const phrases = [input.mainServices, input.secondaryServices]
      .join(",")
      .split(/[,./;|]+/)
      .map(v => v.trim().toLowerCase())
      .filter(v => v.length >= 4 && v.length <= 60)
      .slice(0, 8);
    return Array.from(new Set(phrases));
  }

  // Primary sector keywords
  const selected = new Set<string>(scored[0].def.keywords);

  // Allow one compatible secondary sector to supplement keywords up to the cap
  const COMPATIBLE_SECONDARY: Record<string, string[]> = {
    "social-housing-maintenance": ["housing-retrofit"],
    "housing-retrofit":           ["social-housing-maintenance"],
    "construction-qs":            ["construction-pm", "building-surveying"],
    "construction-pm":            ["construction-qs", "building-surveying"],
    "building-surveying":         ["construction-qs", "construction-pm"],
    "energy-retrofit":            ["housing-retrofit"],
    "cleaning":                   ["facilities-management"],
    "facilities-management":      ["cleaning"]
  };

  if (scored.length > 1 && selected.size < 8) {
    const allowed = COMPATIBLE_SECONDARY[scored[0].def.key] ?? [];
    const secondary = scored.slice(1).find(m => allowed.includes(m.def.key));
    if (secondary) {
      for (const kw of secondary.def.keywords) {
        if (selected.size >= 8) break;
        selected.add(kw);
      }
    }
  }

  return [...selected].slice(0, 8);
}

export function buildRegion(input: z.infer<typeof intakeSchema>) {
  const raw = `${input.regionsToScan} ${input.areasServed} ${input.location}`.toLowerCase();
  const regions: string[] = [];

  if (raw.includes("west midlands") || raw.includes("birmingham") || raw.includes("coventry") || raw.includes("wolverhampton") || raw.includes("walsall") || raw.includes("sandwell")) regions.push("West Midlands");
  if (raw.includes("london") || raw.includes("greater london")) regions.push("London");
  if (raw.includes("north west") || raw.includes("manchester") || raw.includes("liverpool") || raw.includes("lancashire") || raw.includes("cheshire") || raw.includes("cumbria")) regions.push("North West");
  if (raw.includes("east midlands") || raw.includes("nottingham") || raw.includes("leicester") || raw.includes("derby") || raw.includes("northampton") || raw.includes("lincoln")) regions.push("East Midlands");
  if (raw.includes("south east") || raw.includes("kent") || raw.includes("surrey") || raw.includes("sussex") || raw.includes("hampshire") || raw.includes("oxford") || raw.includes("reading") || raw.includes("brighton")) regions.push("South East");
  if (raw.includes("yorkshire") || raw.includes("sheffield") || raw.includes("leeds") || raw.includes("bradford") || raw.includes("hull") || raw.includes("york") || raw.includes("rotherham") || raw.includes("doncaster") || raw.includes("barnsley") || raw.includes("wakefield")) regions.push("Yorkshire and The Humber");
  if (raw.includes("north east") || raw.includes("newcastle") || raw.includes("sunderland") || raw.includes("durham") || raw.includes("tyne") || raw.includes("gateshead") || raw.includes("middlesbrough") || raw.includes("stockton")) regions.push("North East");
  if (raw.includes("east of england") || raw.includes("norfolk") || raw.includes("suffolk") || raw.includes("essex") || raw.includes("cambridge") || raw.includes("hertfordshire") || raw.includes("bedfordshire") || raw.includes("norwich") || raw.includes("ipswich")) regions.push("East of England");
  if (raw.includes("south west") || raw.includes("bristol") || raw.includes("plymouth") || raw.includes("exeter") || raw.includes("devon") || raw.includes("cornwall") || raw.includes("somerset") || raw.includes("gloucester") || raw.includes("swindon") || raw.includes("dorset") || raw.includes("wiltshire")) regions.push("South West");
  if (raw.includes("wales") || raw.includes("cardiff") || raw.includes("swansea") || raw.includes("newport") || raw.includes("welsh") || raw.includes("wrexham") || raw.includes("rhondda")) regions.push("Wales");
  if (raw.includes("scotland") || raw.includes("edinburgh") || raw.includes("glasgow") || raw.includes("aberdeen") || raw.includes("dundee") || raw.includes("scottish") || raw.includes("highland") || raw.includes("stirling")) regions.push("Scotland");
  if (raw.includes("northern ireland") || raw.includes("belfast") || raw.includes("ni council") || raw.includes("derry") || raw.includes("antrim") || raw.includes("armagh")) regions.push("Northern Ireland");

  return regions.length ? Array.from(new Set(regions)).join(",") : "";
}

// excluded: too broad, they pull new-build and unrelated contracts.
export const SECTOR_CPV: Record<string, string[]> = {
  "social-housing":    ["50700000", "45453100", "45262700"],  // maintenance, renovation, conversion
  "cleaning":          ["90910000", "90911000", "90919000", "90920000"],
  "facilities":        ["50700000", "79993000"],               // maintenance + facilities mgmt only
  "built-environment": ["71315300", "71315200", "45453100"],   // building surveying, testing, renovation
  "creative":          ["79342200", "79952000"],               // promotional, events
  "photography":       ["79962000"],
  "energy":            ["71314000", "50710000"],               // energy services, heating/ventilation maintenance
  "health":            ["85100000", "85110000", "85140000", "85120000"],
  "digital":          ["72000000", "48000000", "72212000"],   // IT services, software, programming
  "social-care":      ["85311000", "85312000", "85320000"],   // social work with/without accommodation, social services
  "childrens":        ["85312000", "85311200", "85321000"],   // social work without accommodation, child day care, admin social services
  "waste":            ["90500000", "90511000", "90600000"],   // waste collection, street cleaning
  "security":         ["79710000", "79711000", "79715000"],   // security services, alarm monitoring, patrol
  "catering":         ["55500000", "55520000", "55523000"],   // canteen/catering, catering outside premises, catering for schools
  "legal":            ["79100000", "79200000", "79212000"],   // legal services, accountancy, auditing
  "housing-support":  ["85311000", "70220000"],               // social work, commercial property letting (supported housing)
  "finance":          ["79200000", "66100000", "79212000"],   // accountancy, banking, auditing
  "comms":            ["79340000", "79341000", "79960000"],   // advertising, general advertising, photography services
  "leisure":          ["92000000", "92600000", "92610000"],   // recreational, sporting, sports grounds
  "planning":         ["71400000", "71410000", "71420000"],   // urban planning, regional planning, landscape
  "justice":          ["75231200", "75231210", "79997000"],   // rehabilitation, community service, business travel arrangements
  "emergency":        ["75250000", "75252000", "35110000"],   // fire/rescue, ambulance, firefighting equipment
  "research":         ["73100000", "73200000", "72316000"],   // R&D, business consultancy, data analysis
  "consulting":       ["73200000", "72224000", "72220000"],   // business consultancy, project management consulting, systems/tech consulting
  "training-skills":  ["80000000", "80500000", "80530000", "80521000", "80522000"], // education, training, vocational training, training programme, technical training
  "transport":        ["60130000", "60112000", "60140000", "60100000"],             // public road transport, public bus, non-scheduled passenger transport, road transport
  "recruitment":      ["79620000", "79621000", "79624000", "79625000"],             // supply of personnel, supply office staff, supply nursing, supply medical
  "frameworks":       ["79000000", "72000000", "45000000"],                         // business services (broad), IT services (broad), construction works (broad)
};

// Single canonical sector resolver. Check order matters: social-care and social-housing
// must win before health/facilities to prevent ICB-buyer false reclassification.
export function resolveSector(text: string): SectorResult {
  const t = text.toLowerCase();

  if (t.includes("adult social care") || t.includes("domiciliary") || t.includes("domiciliary care") ||
      t.includes("residential care") || t.includes("care services") || t.includes("personal care") ||
      t.includes("home care") || t.includes("homecare") || t.includes("care provider") ||
      t.includes("reablement") || t.includes("learning disability") || t.includes("care home") ||
      t.includes("supported living") || t.includes("community care") || t.includes("care worker")) {
    return {
      key: "social-care",
      label: "Adult social care",
      terms: ["adult social care", "domiciliary care", "residential care", "learning disability", "reablement", "supported living", "nursing home", "care services", "personal care", "home care", "care provider"]
    };
  }

  if (t.includes("nhs") || t.includes("integrated care board") || t.includes("integrated care system") ||
      t.includes("clinical commissioning") || t.includes("health trust") || t.includes("icb") ||
      t.includes("mental health service") || t.includes("community health") || t.includes("primary care") ||
      t.includes("public health commissioning") || t.includes("gp service") ||
      t.includes("healthcare commissioning") || t.includes("nhs england")) {
    return {
      key: "health",
      label: "Health & NHS commissioning",
      terms: ["NHS", "integrated care board", "clinical commissioning", "mental health", "community health", "primary care", "public health", "GP services", "healthcare", "NHS trust", "ICB", "health commissioning"]
    };
  }

  if (t.includes("social housing") || t.includes("housing maintenance") ||
      t.includes("responsive repairs") || t.includes("void") ||
      t.includes("damp and mould") || t.includes("tenancy")) {
    return {
      key: "social-housing",
      label: "Social housing / housing maintenance",
      terms: ["social housing", "housing maintenance", "responsive repairs", "void properties", "damp and mould", "tenancy", "housing association", "council housing"]
    };
  }

  if (t.includes("cleaning") || t.includes("deep clean") || t.includes("hygiene") ||
      t.includes("clinical") || t.includes("domestic cleaning") || t.includes("commercial cleaning")) {
    return {
      key: "cleaning",
      label: "Specialist cleaning / facilities hygiene",
      terms: ["cleaning", "contract cleaning", "deep clean", "clinical cleaning", "domestic cleaning", "commercial cleaning", "hygiene", "facilities cleaning"]
    };
  }

  if (t.includes("facilities") || t.includes(" fm ") || t.includes("soft fm") ||
      t.includes("hard fm") || t.includes("property services") || t.includes("maintenance")) {
    return {
      key: "facilities",
      label: "Facilities management / property services",
      terms: ["facilities management", "fm services", "soft fm", "hard fm", "maintenance", "property services", "estates management"]
    };
  }

  if (t.includes("construction") || t.includes("quantity surveying") ||
      t.includes("cost management") || t.includes("employer") ||
      t.includes("building surveying") || t.includes("estate")) {
    return {
      key: "built-environment",
      label: "Built environment / construction consultancy",
      terms: ["construction", "quantity surveying", "cost management", "project management", "employer", "building surveying", "estate", "asset management", "contract administration", "programme management"]
    };
  }

  if (t.includes("communications") || t.includes("public engagement") || t.includes("pr ") ||
      t.includes("media relations") || t.includes("council communications") || t.includes("public health campaign") ||
      t.includes("stakeholder engagement") || t.includes("consultation")) {
    return {
      key: "comms",
      label: "Communications, PR & public engagement",
      terms: ["communications", "PR", "public engagement", "media relations", "public health campaigns", "council communications", "print management", "stakeholder engagement", "consultation"]
    };
  }

  if (t.includes("marketing") || t.includes("creative") || t.includes("campaign") ||
      t.includes("video") || t.includes("film") ||
      t.includes("event production") || t.includes("drpg")) {
    return {
      key: "creative",
      label: "Creative / marketing production / events",
      terms: ["marketing", "creative", "campaign", "video", "film", "event", "production", "digital content", "media services"]
    };
  }

  if (t.includes("photography") || t.includes("portrait") || t.includes("graduation") ||
      t.includes("property photography") || t.includes("wedding")) {
    return {
      key: "photography",
      label: "Photography / visual content / public communications",
      terms: ["photography", "event photography", "corporate photography", "graduation", "portrait", "property photography", "visual content", "creative services"]
    };
  }

  if (t.includes("retrofit") || t.includes("solar") || t.includes("energy") ||
      t.includes("decarbonisation") || t.includes("net zero")) {
    return {
      key: "energy",
      label: "Energy / retrofit / built-environment decarbonisation",
      terms: ["energy", "retrofit", "solar", "decarbonisation", "net zero", "energy efficiency", "low carbon", "sustainability"]
    };
  }

  if (t.includes("education") || t.includes("school") || t.includes("academy trust") ||
      t.includes("further education") || t.includes("apprenticeship") || t.includes("dfe") ||
      t.includes("nvq") || t.includes("cpd") || t.includes("learning management") ||
      (t.includes("training") && (t.includes("skills") || t.includes("workforce") || t.includes("courses")))) {
    return {
      key: "training-skills",
      label: "Education, training & skills",
      terms: ["education", "school", "academy", "training", "apprenticeship", "skills", "further education", "learning", "teaching", "curriculum", "NVQ", "CPD", "workforce development", "upskilling"]
    };
  }

  if (t.includes("passenger transport") || t.includes("home to school") || t.includes("school transport") ||
      t.includes("send transport") || t.includes("community transport") || t.includes("dial-a-ride") ||
      t.includes("minibus") || t.includes("accessible transport")) {
    return {
      key: "transport",
      label: "Passenger transport & SEND travel",
      terms: ["passenger transport", "home to school transport", "SEND transport", "community transport", "minibus", "dial-a-ride", "accessible transport", "school transport", "taxi", "fleet management"]
    };
  }

  if (t.includes("recruitment") || t.includes("staffing") || t.includes("agency worker") ||
      t.includes("temporary staff") || t.includes("locum") || t.includes("supply teacher") ||
      t.includes("managed service provider")) {
    return {
      key: "recruitment",
      label: "Recruitment & temporary staffing",
      terms: ["recruitment", "staffing", "agency workers", "temporary staff", "locum", "supply teacher", "managed service provider", "permanent placement", "nursing agency", "social work agency"]
    };
  }

  if (t.includes("framework agreement") || t.includes("dynamic purchasing") || t.includes("dps") ||
      t.includes("call-off") || t.includes("multi-provider") || t.includes("crown commercial")) {
    return {
      key: "frameworks",
      label: "Frameworks & dynamic purchasing systems",
      terms: ["framework agreement", "dynamic purchasing system", "DPS", "call-off", "multi-supplier", "Crown Commercial Service", "G-Cloud", "Digital Outcomes"]
    };
  }

  if (t.includes("it services") || t.includes("software") || t.includes("digital") ||
      t.includes("cloud") || t.includes("cyber") || t.includes("g-cloud") ||
      t.includes("data analytics") || t.includes("it infrastructure") || t.includes("saas")) {
    return {
      key: "digital",
      label: "Digital, IT & technology",
      terms: ["IT services", "software", "digital transformation", "cloud", "cyber security", "G-Cloud", "data analytics", "infrastructure", "SaaS", "ICT"]
    };
  }

  if (t.includes("children") || t.includes("fostering") || t.includes("camhs") ||
      t.includes("early years") || t.includes("looked after") || t.includes("youth services") ||
      t.includes("young people") || t.includes("adoption")) {
    return {
      key: "childrens",
      label: "Children's services",
      terms: ["children's services", "fostering", "adoption", "CAMHS", "early years", "looked after children", "youth services", "safeguarding", "short breaks"]
    };
  }

  if (t.includes("waste management") || t.includes("refuse") || t.includes("recycling") ||
      t.includes("street cleansing") || t.includes("grounds maintenance") || t.includes("waste collection")) {
    return {
      key: "waste",
      label: "Waste, environment & grounds",
      terms: ["waste management", "refuse collection", "recycling", "street cleansing", "grounds maintenance", "composting", "environmental monitoring"]
    };
  }

  if (t.includes("security guard") || t.includes("manned guarding") || t.includes("cctv") ||
      t.includes("access control") || t.includes("event security") || t.includes("lone worker")) {
    return {
      key: "security",
      label: "Security services",
      terms: ["security guarding", "manned guarding", "CCTV", "access control", "event security", "lone worker", "key holding", "patrol services"]
    };
  }

  if (t.includes("catering") || t.includes("school meals") || t.includes("food services") ||
      t.includes("vending") || t.includes("hospital catering") || t.includes("meals on wheels")) {
    return {
      key: "catering",
      label: "Catering & food services",
      terms: ["catering services", "school meals", "hospital catering", "meals on wheels", "vending", "food services", "kitchen management"]
    };
  }

  if (t.includes("legal services") || t.includes("solicitor") || t.includes("legal advice") ||
      t.includes("litigation") || t.includes("barrister") || t.includes("legal counsel")) {
    return {
      key: "legal",
      label: "Legal & professional services",
      terms: ["legal services", "solicitor", "barrister", "litigation", "procurement advisory", "HR advisory", "management consultancy"]
    };
  }

  if (t.includes("homelessness") || t.includes("housing support") || t.includes("rough sleeping") ||
      t.includes("supported housing") || t.includes("refuge") || t.includes("temporary accommodation")) {
    return {
      key: "housing-support",
      label: "Housing & homelessness support",
      terms: ["homelessness prevention", "rough sleeping", "supported housing", "temporary accommodation", "refuge", "floating support", "housing advice"]
    };
  }

  if (t.includes("external audit") || t.includes("internal audit") || t.includes("treasury") ||
      t.includes("payroll") || t.includes("insurance services") || t.includes("council tax collection")) {
    return {
      key: "finance",
      label: "Finance, audit & insurance",
      terms: ["external audit", "internal audit", "treasury management", "payroll", "insurance", "banking", "debt recovery", "financial systems"]
    };
  }

  if (t.includes("leisure management") || t.includes("leisure centre") || t.includes("library") ||
      t.includes("arts services") || t.includes("museum") || t.includes("parks management") || t.includes("sports development")) {
    return {
      key: "leisure",
      label: "Leisure, culture & parks",
      terms: ["leisure management", "libraries", "arts & culture", "museums", "parks management", "sports development", "heritage"]
    };
  }

  if (t.includes("planning consultancy") || t.includes("urban regeneration") || t.includes("economic development") ||
      t.includes("masterplan") || t.includes("heritage conservation") || t.includes("transport planning")) {
    return {
      key: "planning",
      label: "Planning, regeneration & economic development",
      terms: ["planning consultancy", "urban regeneration", "economic development", "masterplanning", "heritage", "transport planning", "land development"]
    };
  }

  if (t.includes("probation") || t.includes("prison") || t.includes("custody") ||
      t.includes("youth justice") || t.includes("community safety") || t.includes("rehabilitation")) {
    return {
      key: "justice",
      label: "Justice, probation & community safety",
      terms: ["probation", "prison services", "custody", "youth justice", "community safety", "rehabilitation", "electronic monitoring"]
    };
  }

  if (t.includes("police") || t.includes("fire service") || t.includes("ambulance") ||
      t.includes("emergency planning") || t.includes("fire rescue") || t.includes("paramedic")) {
    return {
      key: "emergency",
      label: "Emergency services",
      terms: ["police", "fire & rescue", "ambulance", "paramedic", "emergency planning", "control room", "PPE emergency services"]
    };
  }

  if (t.includes("policy evaluation") || t.includes("social research") || t.includes("research evaluation") ||
      t.includes("public health research") || t.includes("epidemiology") || t.includes("deliberative")) {
    return {
      key: "research",
      label: "Research, evaluation & data",
      terms: ["social research", "policy evaluation", "public health research", "epidemiology", "data analytics", "consultation research", "market research"]
    };
  }

  if (t.includes("management consulting") || t.includes("transformation consultancy") ||
      t.includes("programme delivery") || t.includes("operating model") || t.includes("business case") ||
      t.includes("central government") || t.includes("cabinet office")) {
    return {
      key: "consulting",
      label: "Central government consulting & transformation",
      terms: ["management consulting", "digital transformation", "programme delivery", "policy development", "operating model", "commercial advisory"]
    };
  }

  return {
    key: "general",
    label: "General public-sector services",
    terms: text.split(/\s+/).filter((word: string) => word.length > 5).slice(0, 12)
  };
}

export function resolveSectorFromInput(input: any): SectorResult {
  // Use only what the company DOES — not who their buyers are.
  // idealBuyers/frameworkStatus/lastPublicContract contain buyer-type terms (e.g. "NHS Trust")
  // that trigger the health-sector check before cleaning/facilities, causing wrong sector classification.
  const text = [
    input?.companyName, input?.mainServices, input?.secondaryServices,
  ].filter(Boolean).join(" ");
  return resolveSector(text);
}

export function resolveSectorFromScan(scan: any): SectorResult {
  const input: any = scan.input_json || {};
  const text = [
    input.companyName, input.mainServices, input.secondaryServices,
    scan.company_name,
  ].filter(Boolean).join(" ");
  return resolveSector(text);
}
