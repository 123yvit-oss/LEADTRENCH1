export type Profile = {
  firstName: string
  lastName: string
  email: string
}

export type Lead = {
  id: string
  company: string
  initials: string
  industry: string
  city: string
  state: string
  signal: string
  bottleneck: string
  opportunity: string
  revenue: string
  employees: string
  contact: string
  role: string
  score: number
  tags: string[]
}

export const PROFILE_STORAGE_KEY = "leadtrench-profile-v1"
export const SESSION_STORAGE_KEY = "leadtrench-session-v1"

export const industries = [
  "Software & Technology",
  "Healthcare",
  "Financial Services",
  "Real Estate",
  "Manufacturing",
  "Construction",
  "Professional Services",
  "Legal Services",
  "Marketing & Advertising",
  "Logistics & Supply Chain",
  "Retail & E-commerce",
  "Hospitality",
  "Education",
  "Energy & Utilities",
  "Telecommunications",
  "Insurance",
  "Human Resources",
  "Food & Beverage",
  "Automotive",
  "Nonprofit & Associations",
]

export const metros = [
  "New York City, NY",
  "Los Angeles, CA",
  "Chicago, IL",
  "Houston, TX",
  "Phoenix, AZ",
  "Philadelphia, PA",
  "San Antonio, TX",
  "San Diego, CA",
  "Dallas, TX",
  "Austin, TX",
  "Jacksonville, FL",
  "Columbus, OH",
  "Charlotte, NC",
  "San Francisco, CA",
  "Seattle, WA",
  "Denver, CO",
  "Boston, MA",
  "Nashville, TN",
  "Atlanta, GA",
  "Washington, DC",
  "Newark, NJ (North)",
  "Edison, NJ (Central)",
  "Cherry Hill, NJ (South)",
]

export const leads: Lead[] = [
  {
    id: "northstar-health",
    company: "Northstar Health Group",
    initials: "NH",
    industry: "Healthcare",
    city: "Newark, NJ",
    state: "NJ",
    signal: "Hiring across 4 locations",
    bottleneck: "Patient intake is fragmented across four clinics, creating long response times and costly appointment leakage.",
    opportunity: "Unify intake and automate follow-up to recover missed appointments.",
    revenue: "$18M–$25M",
    employees: "120–180",
    contact: "Dr. Maya Bennett",
    role: "Chief Operating Officer",
    score: 96,
    tags: ["Growth signal", "Multi-location"],
  },
  {
    id: "meridian-fabrication",
    company: "Meridian Fabrication Co.",
    initials: "MF",
    industry: "Manufacturing",
    city: "Edison, NJ",
    state: "NJ",
    signal: "New facility announced",
    bottleneck: "Manual quoting and disconnected order updates are slowing a newly expanded production floor.",
    opportunity: "Streamline quoting and order visibility to turn expansion into dependable throughput.",
    revenue: "$32M–$48M",
    employees: "210–320",
    contact: "Elliot Park",
    role: "VP of Operations",
    score: 93,
    tags: ["Expansion", "Operations"],
  },
  {
    id: "atlas-property-partners",
    company: "Atlas Property Partners",
    initials: "AP",
    industry: "Real Estate",
    city: "Cherry Hill, NJ",
    state: "NJ",
    signal: "Portfolio up 28% YoY",
    bottleneck: "Leasing teams are spending hours qualifying inbound inquiries across a growing portfolio.",
    opportunity: "Qualify prospects faster and give every property team a consistent leasing pipeline.",
    revenue: "$12M–$19M",
    employees: "55–90",
    contact: "Jordan Ellis",
    role: "Managing Partner",
    score: 91,
    tags: ["Portfolio growth", "Leasing"],
  },
  {
    id: "clearpath-logistics",
    company: "Clearpath Logistics",
    initials: "CL",
    industry: "Logistics & Supply Chain",
    city: "Newark, NJ",
    state: "NJ",
    signal: "New distribution contract",
    bottleneck: "Dispatch coordination is still spreadsheet-driven, making service levels harder to protect as volume rises.",
    opportunity: "Connect dispatch workflows and surface delivery exceptions before they become costly delays.",
    revenue: "$44M–$60M",
    employees: "280–420",
    contact: "Nina Patel",
    role: "Chief Commercial Officer",
    score: 89,
    tags: ["New contract", "Scaling"],
  },
  {
    id: "signalworks-studio",
    company: "Signalworks Studio",
    initials: "SS",
    industry: "Marketing & Advertising",
    city: "New York City, NY",
    state: "NY",
    signal: "Senior growth hires",
    bottleneck: "Client reporting is assembled by hand, leaving strategists less time for higher-value campaign work.",
    opportunity: "Automate reporting so account teams can focus on campaign performance and retention.",
    revenue: "$8M–$14M",
    employees: "45–75",
    contact: "Avery Chen",
    role: "Founder & CEO",
    score: 87,
    tags: ["Hiring", "Client services"],
  },
  {
    id: "forgepoint-systems",
    company: "Forgepoint Systems",
    initials: "FS",
    industry: "Software & Technology",
    city: "New York City, NY",
    state: "NY",
    signal: "Series B momentum",
    bottleneck: "A lean revenue team is struggling to prioritize high-fit accounts and keep product handoffs timely.",
    opportunity: "Focus the pipeline on best-fit accounts and create a cleaner path from discovery to activation.",
    revenue: "$22M–$35M",
    employees: "90–140",
    contact: "Riley Morgan",
    role: "VP of Revenue",
    score: 95,
    tags: ["Funded", "Revenue ops"],
  },
  {
    id: "harborstone-legal",
    company: "Harborstone Legal",
    initials: "HL",
    industry: "Legal Services",
    city: "Philadelphia, PA",
    state: "PA",
    signal: "Opened a second office",
    bottleneck: "New client requests are split between inboxes, making response speed and intake consistency difficult to track.",
    opportunity: "Centralize matter intake and keep prospective clients moving from first contact to consultation.",
    revenue: "$6M–$10M",
    employees: "30–55",
    contact: "Morgan Price",
    role: "Managing Partner",
    score: 85,
    tags: ["Office expansion", "Intake"],
  },
  {
    id: "bluepeak-energy",
    company: "Bluepeak Energy Services",
    initials: "BE",
    industry: "Energy & Utilities",
    city: "Houston, TX",
    state: "TX",
    signal: "Regional hiring push",
    bottleneck: "Field service schedules and customer updates are managed in separate tools, creating avoidable repeat work.",
    opportunity: "Give dispatch and service teams a shared operating picture from scheduling through resolution.",
    revenue: "$68M–$95M",
    employees: "350–520",
    contact: "Samir Shah",
    role: "Chief Transformation Officer",
    score: 90,
    tags: ["Hiring", "Field operations"],
  },
  {
    id: "aster-commerce",
    company: "Aster Commerce",
    initials: "AC",
    industry: "Retail & E-commerce",
    city: "Austin, TX",
    state: "TX",
    signal: "Product catalog doubled",
    bottleneck: "A growing catalog has made replenishment planning and post-purchase support increasingly reactive.",
    opportunity: "Improve demand visibility and automate customer updates across the order lifecycle.",
    revenue: "$15M–$24M",
    employees: "70–115",
    contact: "Taylor Brooks",
    role: "Chief Customer Officer",
    score: 84,
    tags: ["Catalog growth", "Customer experience"],
  },
  {
    id: "pinnacle-financial",
    company: "Pinnacle Financial Partners",
    initials: "PF",
    industry: "Financial Services",
    city: "Boston, MA",
    state: "MA",
    signal: "New advisory practice",
    bottleneck: "Advisor onboarding depends on manual document chasing, limiting capacity for new client relationships.",
    opportunity: "Reduce onboarding friction and give advisors more time for relationship-led growth.",
    revenue: "$28M–$42M",
    employees: "100–160",
    contact: "Jamie Rivera",
    role: "Director of Client Experience",
    score: 88,
    tags: ["New practice", "Onboarding"],
  },
  {
    id: "summit-builders",
    company: "Summit Builders Group",
    initials: "SB",
    industry: "Construction",
    city: "Denver, CO",
    state: "CO",
    signal: "Backlog at 18-month high",
    bottleneck: "Project updates are scattered across teams, making change orders and client communication difficult to coordinate.",
    opportunity: "Create a clearer project workflow and help teams spot schedule risk earlier.",
    revenue: "$55M–$82M",
    employees: "190–300",
    contact: "Casey Walker",
    role: "President",
    score: 86,
    tags: ["Record backlog", "Project delivery"],
  },
  {
    id: "kindred-learning",
    company: "Kindred Learning Network",
    initials: "KL",
    industry: "Education",
    city: "Atlanta, GA",
    state: "GA",
    signal: "Enrollment campaign launched",
    bottleneck: "Admissions follow-up varies between campuses, causing promising inquiries to go quiet during peak season.",
    opportunity: "Coordinate timely outreach and help admissions teams convert more qualified interest.",
    revenue: "$9M–$16M",
    employees: "85–130",
    contact: "Devon Lewis",
    role: "VP of Enrollment",
    score: 82,
    tags: ["Enrollment growth", "Multi-campus"],
  },
]

export const scoreLabel = (score: number) => {
  if (score >= 92) return "Priority"
  if (score >= 86) return "High intent"
  return "Strong fit"
}

export const getLeadCity = (lead: Lead) => {
  if (lead.city === "Newark, NJ") return "Newark, NJ (North)"
  if (lead.city === "Edison, NJ") return "Edison, NJ (Central)"
  if (lead.city === "Cherry Hill, NJ") return "Cherry Hill, NJ (South)"
  return `${lead.city}, ${lead.state}`
}

export const makeOutreachMessage = (lead: Lead) =>
  `Hi ${lead.contact.split(" ")[0]},\n\nI noticed ${lead.company}'s recent signal: ${lead.signal.toLowerCase()}. As your team grows, ${lead.bottleneck.toLowerCase()}\n\nWe help ${lead.industry.toLowerCase()} teams ${lead.opportunity.charAt(0).toLowerCase()}${lead.opportunity.slice(1)} Would you be open to a brief conversation to compare notes on what that could look like for ${lead.company}?\n\nBest,\n[Your name]`

export const formatIndustryCount = (industry: string) =>
  industry === "All industries" ? "across every industry" : `in ${industry.toLowerCase()}`

export const initialSearchCity = "All metros"
export const initialSearchIndustry = "All industries"

export const isProfile = (value: unknown): value is Profile => {
  if (typeof value !== "object" || value === null) return false
  const profile = value as Partial<Profile>
  return (
    typeof profile.firstName === "string" &&
    typeof profile.lastName === "string" &&
    typeof profile.email === "string"
  )
}

export const cityMatchesLead = (metro: string, lead: Lead) =>
  metro === "All metros" || getLeadCity(lead) === metro

export const industriesForSelect = ["All industries", ...industries]
export const metrosForSelect = ["All metros", ...metros]

export const formatInitials = (profile: Profile) =>
  `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase()

export const localProfileDisclosure =
  "Profile details stay in this browser. Passwords are never saved or verified."
