export type OpportunityTier = 'HOT' | 'WARM' | 'TO WATCH'

export type OpportunitySignalKind =
  | 'operations_hiring'
  | 'administrative_hiring'
  | 'customer_support_hiring'
  | 'other_hiring'
  | 'operations_expansion'
  | 'multiple_locations'
  | 'service_workload'
  | 'process_gap'

export type OpportunitySignal = {
  kind: OpportunitySignalKind
  title: string
  source: string
  sourceUrl?: string
  observedAt?: string
  confidence: 'high' | 'medium' | 'low'
  verified: true
  responsibilityEvidence?: string[]
}

export type OpportunityRecommendation = {
  service: string
  tasks: string[]
  valueProposition: string
  nextStep: string
  supported: boolean
}

export type OpportunityAssessment = {
  score: number
  tier: OpportunityTier
  signal: string
  bottleneck: string
  opportunity: string
  explanation: string
  recommendation: OpportunityRecommendation
  evidence: OpportunitySignal[]
}

export type OpportunityBusinessContext = {
  company?: string
  industry?: string
}

export const OPPORTUNITY_THRESHOLDS = {
  hot: 70,
  warm: 35,
} as const

const SIGNAL_STRENGTH: Record<OpportunitySignalKind, number> = {
  operations_hiring: 80,
  administrative_hiring: 74,
  customer_support_hiring: 60,
  other_hiring: 24,
  operations_expansion: 42,
  multiple_locations: 20,
  service_workload: 30,
  process_gap: 45,
}

const CONFIDENCE_FACTOR = { high: 1, medium: 0.8, low: 0.6 } as const
const MAX_SUPPORTING_POINTS = 20
const RECENCY_WINDOWS = [30, 90, 180, 365] as const

function recencyFactor(observedAt: string | undefined, now: number) {
  if (!observedAt) return 0.4
  const observedTime = Date.parse(observedAt)
  if (!Number.isFinite(observedTime)) return 0.4
  if (observedTime > now + 86_400_000) return 0.2
  const ageInDays = Math.max(0, (now - observedTime) / 86_400_000)
  if (ageInDays <= RECENCY_WINDOWS[0]) return 1
  if (ageInDays <= RECENCY_WINDOWS[1]) return 0.85
  if (ageInDays <= RECENCY_WINDOWS[2]) return 0.65
  if (ageInDays <= RECENCY_WINDOWS[3]) return 0.4
  return 0.2
}

function effectiveStrength(signal: OpportunitySignal, now: number) {
  return SIGNAL_STRENGTH[signal.kind]
    * CONFIDENCE_FACTOR[signal.confidence]
    * recencyFactor(signal.observedAt, now)
}

function getTier(score: number): OpportunityTier {
  if (score >= OPPORTUNITY_THRESHOLDS.hot) return 'HOT'
  if (score >= OPPORTUNITY_THRESHOLDS.warm) return 'WARM'
  return 'TO WATCH'
}

function getVerifiedTasks(signal: OpportunitySignal) {
  const sourceText = (signal.responsibilityEvidence ?? []).join(' ').toLowerCase()
  const taskPatterns: Array<[string, RegExp]> = [
    ['calendar and appointment scheduling', /\b(?:schedule|scheduling|calendar|appointments?)\b/],
    ['inbox and email coordination', /\b(?:inbox|emails?|correspondence)\b/],
    ['records and data entry', /\b(?:data entry|records|database|crm)\b/],
    ['report preparation', /\b(?:reporting|reports|metrics|spreadsheets?)\b/],
    ['customer inquiry triage and follow-up', /\b(?:customer inquiries|customer support|support tickets|follow[- ]?up|answer calls|phone calls)\b/],
    ['new-hire onboarding coordination', /\b(?:onboard|onboarding|new hire|orientation)\b/],
    ['dispatch and work coordination', /\b(?:dispatch|coordination)\b/],
    ['billing and bookkeeping administration', /\b(?:billing|bookkeeping|payroll)\b/],
  ]

  return taskPatterns.filter(([, pattern]) => pattern.test(sourceText)).map(([task]) => task)
}

function makeRecommendation(
  evidence: OpportunitySignal[],
  context: OpportunityBusinessContext,
): { bottleneck: string; recommendation: OpportunityRecommendation } {
  const business = context.company?.trim() || 'This business'
  const primary = evidence[0]

  if (!primary) {
    const industryContext = context.industry?.trim()
      ? ` The search categorized the listing under ${context.industry}, but that category does not verify operational need.`
      : ''
    return {
      bottleneck: `No linked source verifies an active operational or administrative need at ${business}. The available directory information confirms a listing, not workload pressure or a process problem.${industryContext}`,
      recommendation: {
        service: 'Not established from current evidence',
        tasks: [],
        valueProposition: 'A service recommendation would be guesswork until a public source or direct conversation confirms a recurring task the team needs covered.',
        nextStep: 'Before outreach, check the company’s official careers page or ask its owner whether scheduling, inbox coordination, records, reporting, or customer follow-up is currently assigned to an overloaded team member.',
        supported: false,
      },
    }
  }

  const verifiedTasks = getVerifiedTasks(primary)
  const title = `“${primary.title}”`
  const responsibilitySummary = verifiedTasks.length ? verifiedTasks.join(', ') : ''

  if (verifiedTasks.length) {
    const customerWork = primary.kind === 'customer_support_hiring' || primary.kind === 'service_workload'
      || verifiedTasks.some((task) => task.includes('customer'))
    const service = customerWork ? 'customer-support VA coverage' : 'administrative and operations VA support'
    const bottleneck = `The official posting for ${title} lists ${responsibilitySummary}; that confirms these duties are part of the role, not that the current team is failing to handle them. While the position is being filled, the likely pressure is keeping those recurring tasks moving without pulling managers away from core work.`
    const valueProposition = `Temporary coverage for the listed work could keep handoffs and follow-through consistent while the hire focuses on the role’s core responsibilities.`
    const nextStep = `Contact the hiring lead at ${business}, reference ${title}, and ask which of these listed duties needs coverage before the role is filled; scope only the tasks they confirm.`
    return {
      bottleneck,
      recommendation: { service, tasks: verifiedTasks, valueProposition, nextStep, supported: true },
    }
  }

  if (primary.kind === 'operations_hiring' || primary.kind === 'administrative_hiring') {
    return {
      bottleneck: `The official posting confirms ${business} is hiring for ${title}, a role associated with operations or administration. The posting does not expose day-to-day responsibilities, so any specific coordination gap is still an inference—not a verified problem.`,
      recommendation: {
        service: 'Administrative or operations VA support (conditional on the posted duties)',
        tasks: ['scheduling', 'inbox coordination', 'records or data entry', 'reporting', 'follow-up'],
        valueProposition: 'If the posting assigns any of these recurring duties to the role, temporary VA coverage could keep them moving while the hire focuses on higher-priority work.',
        nextStep: `Review ${title} on the official careers page, then ask ${business}’s hiring lead which of those specific duties needs coverage before the position is filled. Offer support only for duties the posting or hiring lead confirms.`,
        supported: false,
      },
    }
  }

  if (primary.kind === 'customer_support_hiring' || primary.kind === 'service_workload') {
    return {
      bottleneck: `The source confirms a customer-service capacity signal for ${business} through ${title}. It does not say which channels or workloads are under pressure, so a slow response queue or follow-up backlog cannot be treated as fact.`,
      recommendation: {
        service: 'Customer-support VA coverage (after confirming the channel and workload)',
        tasks: ['inbox or ticket triage', 'customer follow-up', 'escalation routing'],
        valueProposition: 'Coverage for a confirmed channel could keep customer questions moving while the team staffs or handles its core service work.',
        nextStep: `Reference ${title} when contacting ${business}; ask whether email, phone, or ticket volume needs coverage and which follow-ups can be delegated. Propose coverage only for the channel and tasks they confirm.`,
        supported: false,
      },
    }
  }

  if (primary.kind === 'operations_expansion' || primary.kind === 'multiple_locations') {
    return {
      bottleneck: `The linked source describes ${primary.title}, which can add handoffs and coordination across ${business}’s operation. It does not verify inconsistent execution or a process failure, so the bottleneck is a risk to validate rather than a confirmed problem.`,
      recommendation: {
        service: 'Operations workflow mapping and SOP documentation (if a handoff gap is confirmed)',
        tasks: ['map one recurring cross-team or cross-location handoff', 'document the agreed steps and owner', 'create a reusable checklist'],
        valueProposition: 'A concise, shared workflow can make responsibilities and handoffs clearer if the team confirms that the same process is being handled differently.',
        nextStep: `Ask ${business}’s operations lead which handoff changed because of “${primary.title}” and where work currently stalls; propose documenting that one workflow only if they confirm a coordination gap.`,
        supported: false,
      },
    }
  }

  if (primary.kind === 'process_gap') {
    return {
      bottleneck: `The linked source identifies “${primary.title}” as a process gap at ${business}. That makes the named workflow or tool the likely friction point, but the source does not establish its impact on staff time or customers.`,
      recommendation: {
        service: 'Workflow documentation and targeted process improvement',
        tasks: ['map the named workflow', 'record handoffs and repeat steps', 'identify one practical change to test'],
        valueProposition: `A focused review of “${primary.title}” can turn the documented issue into a specific, testable workflow change without assuming a broader system failure.`,
        nextStep: `Contact the person responsible for “${primary.title}” at ${business}; ask them to walk through the current steps and identify the one handoff or repeat task they want improved.`,
        supported: true,
      },
    }
  }

  return {
    bottleneck: `A current source confirms that ${business} is hiring for ${title}, but it does not connect the role to operations, administration, or customer support. Hiring is verified; an operational bottleneck and a fit for VA support are not.`,
    recommendation: {
      service: 'No service recommendation until role responsibilities are verified',
      tasks: [],
      valueProposition: 'The role may have no connection to LeadTrench’s operational or administrative services; pitching one now would rely on an unsupported assumption.',
      nextStep: `Open the linked posting for ${title} and look for recurring scheduling, inbox, data-entry, reporting, or follow-up duties. If one is present, ask ${business}’s hiring lead whether it needs temporary coverage; do not pitch VA support if the role is unrelated.`,
      supported: false,
    },
  }
}

function formatRecommendation(recommendation: OpportunityRecommendation) {
  if (recommendation.supported) {
    return `Offer ${recommendation.service} to handle ${recommendation.tasks.join(', ')}. ${recommendation.valueProposition} ${recommendation.nextStep}`
  }
  if (recommendation.tasks.length) {
    return `${recommendation.service}: ${recommendation.tasks.join(', ')}. ${recommendation.valueProposition} ${recommendation.nextStep}`
  }
  return `${recommendation.valueProposition} ${recommendation.nextStep}`
}

function getDiagnosis(evidence: OpportunitySignal[], context: OpportunityBusinessContext) {
  const diagnosis = makeRecommendation(evidence, context)
  return {
    ...diagnosis,
    opportunity: formatRecommendation(diagnosis.recommendation),
  }
}

function hasVerifiableSource(signal: OpportunitySignal) {
  if (!signal?.verified || !signal.title.trim() || !signal.source.trim() || !signal.sourceUrl) return false

  try {
    const sourceUrl = new URL(signal.sourceUrl)
    return sourceUrl.protocol === 'https:' && !sourceUrl.username && !sourceUrl.password
  } catch {
    return false
  }
}

export function assessOpportunity(
  signals: OpportunitySignal[],
  now = Date.now(),
  context: OpportunityBusinessContext = {},
): OpportunityAssessment {
  const uniqueSignals = new Map<string, OpportunitySignal>()
  for (const signal of signals) {
    if (!hasVerifiableSource(signal)) continue
    const signalKey = `${signal.kind}:${signal.title.trim().toLowerCase()}:${signal.sourceUrl}`
    const existing = uniqueSignals.get(signalKey)
    if (!existing || effectiveStrength(signal, now) > effectiveStrength(existing, now)) {
      uniqueSignals.set(signalKey, signal)
    }
  }

  const evidence = [...uniqueSignals.values()].sort((a, b) => effectiveStrength(b, now) - effectiveStrength(a, now))
  const strengths = evidence.map((signal) => effectiveStrength(signal, now))
  const strongest = strengths[0] ?? 0
  const supporting = strengths.slice(1).reduce((total, strength) => total + strength * 0.2, 0)
  const score = Math.min(98, Math.round(strongest + Math.min(MAX_SUPPORTING_POINTS, supporting)))
  const diagnosis = getDiagnosis(evidence, context)

  return {
    score,
    tier: getTier(score),
    signal: evidence.length ? evidence.map((item) => item.title).join(' · ') : 'No verified need signal detected',
    ...diagnosis,
    explanation: evidence.length
      ? `Fit Score uses the existing signal-relevance, source-confidence, and recency calculation across ${evidence.length} distinct verified signal${evidence.length === 1 ? '' : 's'}. Directory listing details do not add points; the score is not proof of a specific workload or buying intent.`
      : 'No verified need evidence is available. Google Places listing completeness, operating hours, and website presence do not increase this score.',
    recommendation: diagnosis.recommendation,
    evidence,
  }
}

const TIER_ORDER: Record<OpportunityTier, number> = { HOT: 0, WARM: 1, 'TO WATCH': 2 }

export function compareOpportunitySignals(
  a: { score: number; tier: OpportunityTier; evidence: OpportunitySignal[]; company: string },
  b: { score: number; tier: OpportunityTier; evidence: OpportunitySignal[]; company: string },
) {
  return TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
    || b.score - a.score
    || b.evidence.length - a.evidence.length
    || a.company.localeCompare(b.company)
}

export function getEvidenceDateLabel(observedAt?: string) {
  if (!observedAt) return 'Date not provided'
  const date = new Date(observedAt)
  return Number.isNaN(date.getTime()) ? 'Date not provided' : date.toLocaleDateString()
}

export function getEvidenceConfidenceLabel(confidence: OpportunitySignal['confidence']) {
  return `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence`
}

export function rankLeadsByOpportunity<T extends { needSignals: OpportunitySignal[]; company: string }>(leads: T[]) {
  const now = Date.now()
  return [...leads].sort((a, b) => compareOpportunitySignals(
    { company: a.company, ...assessOpportunity(a.needSignals, now) },
    { company: b.company, ...assessOpportunity(b.needSignals, now) },
  ))
}
