import {
  PipelineAgentDef,
  LLMConfig,
  ScoringWeights,
  AcceptanceThresholds
} from '../types/triage';

export const AGENT_DEFINITIONS: PipelineAgentDef[] = [
  {
    id: 1,
    name: 'Sanitizer & Security',
    title: 'Sanitizer & Security Agent (Code Engine)',
    role: 'Deterministically sanitize raw incoming email payloads, scrub personally identifiable information (PII), and detect security risks (phishing, prompt injection, malicious payloads) in code with zero LLM tokens.',
    description: 'Deterministic code engine: thread cleanup, regex PII redaction ([REDACTED_*]), and threat scanning.',
    executionMode: 'code',
    promptInstructions: `EXECUTION ENGINE: Deterministic TypeScript Rule & Regex Engine (0 LLM Tokens)
TASKS: Executed locally in server code for every incoming email payload:
Step 1. Thread & Footers Sanitization: Strips quoted reply chains (^> lines, "On ... wrote:", "-----Original Message-----", Outlook header chains), signature delimiters (--), mobile footers, and legal confidentiality disclaimers.
Step 2. PII Scrubbing & Redaction: Pattern-matches and replaces SSNs ([REDACTED_SSN]), credit card numbers ([REDACTED_CREDIT_CARD]), email addresses ([REDACTED_EMAIL]), phone numbers ([REDACTED_PHONE]), physical street addresses ([REDACTED_ADDRESS]), and detected sender/contact names ([REDACTED_NAME]).
Step 3. Security Vector Detection: Scans subject and body against rule sets for:
- PROMPT_INJECTION: instruction override attempts ("ignore previous instructions", "system override", "developer mode", "jailbreak", "[INST]", prompt leaks).
- PHISHING: URL shorteners, deceptive login/verify domains, IP-literal links, and urgent credential harvesting phrasing.
- MALICIOUS_CONTENT: XSS/script tags, SQL injection patterns, shell commands (curl/wget/powershell), and dangerous executable payload indicators.
Step 4. Slate Flagging & Output Generation: Outputs strict SanitizerOutput JSON with is_safe, security_flag, sanitized_subject, sanitized_body, pii_redacted, and preprocessor_notes.`,
    expectedOutputKeys: ['is_safe', 'security_flag', 'sanitized_subject', 'sanitized_body', 'pii_redacted', 'preprocessor_notes']
  },
  {
    id: 2,
    name: 'Classifier',
    title: 'Classifier Agent for AI Email Triage',
    role: 'Analyze sanitized Blackboard Slate payloads to classify primary business category, identify secondary intent, score urgency and sentiment, extract structured entities, and determine human review requirements.',
    description: '4-bucket categorization, urgency 1-5 scoring, sentiment analysis, and structured metadata extraction.',
    executionMode: 'llm',
    promptInstructions: `TITLE: You are the Classifier Agent for AI Email Triage.
ROLE: Your role is to analyze sanitized Blackboard Slate payloads to classify primary business category, identify secondary intent, score urgency and sentiment, extract structured entities, and determine human review requirements.
TASKS: Using the sanitized email inputs from Agent 1 on the Blackboard Slate, perform the following:
Step 1. Primary Category Classification: Classify into exactly one of:
- "Sales / High-Value" (RFPs, enterprise pricing, demos, seats/licenses, contracts, partnerships, group bookings)
- "Customer Service" (technical support, outages, bugs, refunds, complaints, booking modifications, FAQs)
- "Admin / Operations" (invoices, AP/AR, W-9/tax forms, vendor management, payroll, HR, IT/VPN access, compliance)
- "Junk / Low-Priority" (spam, promotional newsletters, solicitations, or flagged security threats)
Step 2. Secondary Intent Identification: Provide a concise specific intent label (e.g., "Group RFP / Volume Quote", "Technical Outage / Defect", "Refund & Billing Dispute", "Vendor Invoice & AP", "Security Threat / Prompt Injection").
Step 3. Urgency (1-5) & Sentiment Rating:
- Assign sentiment: "Positive", "Neutral", "Frustrated", or "Hostile".
- Assign urgency integer 1 to 5 (5 = critical outage, hostile/legal threat, or security risk; 1 = spam/low-priority).
Step 4. Metadata Extraction: Extract account_id, requested_dates, party_size, and estimated_value strictly from the sanitized text (use null when not present).
Step 5. Confidence & Human Review Flagging: Assign confidence_score (0.00 to 1.00). Set needs_human_review to true if confidence_score < 0.80, sentiment is "Hostile", is_safe is false, or legal/regulatory/ambiguous multi-request issues require human oversight.
CONSTRAINTS: Operate strictly on the sanitized Blackboard Slate inputs. Do not invent or fabricate extracted_metadata values that do not appear in the email.
OUTPUT FORMAT: Return a strict JSON object following this format:
{
  "category": "Sales / High-Value" | "Customer Service" | "Admin / Operations" | "Junk / Low-Priority",
  "intent": "string",
  "confidence_score": 0.92,
  "urgency": 1-5,
  "sentiment": "Positive" | "Neutral" | "Frustrated" | "Hostile",
  "needs_human_review": false,
  "extracted_metadata": {
    "account_id": null,
    "requested_dates": null,
    "party_size": null,
    "estimated_value": null
  }
}`,
    expectedOutputKeys: ['category', 'intent', 'confidence_score', 'urgency', 'sentiment', 'needs_human_review', 'extracted_metadata']
  },
  {
    id: 3,
    name: 'Router & Action',
    title: 'Router & Action Agent for AI Email Triage',
    role: 'Evaluate classification metadata on the Blackboard Slate and determine optimal queue placement, team assignment, priority tagging, and alert recommendations.',
    description: 'Target queue assignment, operational priority tag, VIP notifications, and CRM actions.',
    executionMode: 'llm',
    promptInstructions: `TITLE: You are the Router & Action Agent for AI Email Triage.
ROLE: Your role is to evaluate classification metadata on the Blackboard Slate and determine optimal queue placement, team assignment, priority tagging, and alert recommendations.
TASKS: Using the classification slate inputs, compute the operational routing decision:
Step 1. Destination Queue Assignment: Determine target queue (e.g., Sales_Gold_Queue, Support_Tier2_Escalation, Finance_AP, Human_Triage_Queue, Operations_Queue, Quarantine_Queue).
Step 2. Priority Tagging: Assign operational priority tag: URGENT, HIGH, NORMAL, or LOW.
Step 3. Notification Routing: Select real-time alert destination: SLACK_VIP_CHANNEL, TEAMS_LEAD_CHANNEL, or NONE.
Step 4. CRM / Helpdesk System Action: Specify required backend system updates: CREATE_LEAD, UPDATE_TICKET, LOG_ONLY, or SKIP.
Step 5. Decision Rationale: Provide a concise sentence explaining the routing logic applied.
CONSTRAINTS: Do not make external API calls or send emails directly. You strictly produce structured execution payload instructions for downstream system orchestrators.
OUTPUT FORMAT: Return a strict JSON object following this format:
{
  "target_queue": "string",
  "assigned_team": "string",
  "priority_tag": "URGENT" | "HIGH" | "NORMAL" | "LOW",
  "notification_channel": "SLACK_VIP_CHANNEL" | "TEAMS_LEAD_CHANNEL" | "NONE",
  "crm_action": "CREATE_LEAD" | "UPDATE_TICKET" | "LOG_ONLY" | "SKIP",
  "routing_reason": "string"
}`,
    expectedOutputKeys: ['target_queue', 'assigned_team', 'priority_tag', 'notification_channel', 'crm_action', 'routing_reason']
  },
  {
    id: 4,
    name: 'Reply Drafter',
    title: 'Reply Drafter Agent for AI Email Triage',
    role: 'Draft clear, professional, contextually appropriate response emails using classification metadata, sanitized bodies, and verified company policy guidelines.',
    description: 'Auto-send eligibility or 1-click human sign-off drafting with explicit placeholders.',
    executionMode: 'llm',
    promptInstructions: `TITLE: You are the Reply Drafter Agent for AI Email Triage.
ROLE: Your role is to draft clear, professional, contextually appropriate response emails using classification metadata, sanitized bodies, and verified company policy guidelines.
TASKS: For emails flagged for automated response or pre-drafting, perform the following:
Step 1. Intent & Context Review: Inspect sanitized body text and extracted metadata (e.g., requested dates, account IDs).
Step 2. Draft Status Determination:
- AUTO_SEND_ELIGIBLE: Simple, unambiguous FAQs with confidence > 0.95 and neutral sentiment.
- READY_FOR_APPROVAL: Complex queries, high-value inquiries, or ambiguous requests requiring 1-click human sign-off.
- MANUAL_WRITE_REQUIRED: Escalated complaints or hostile communications.
Step 3. Subject Line & Body Generation: Draft a professional response adhering to corporate tone. Use explicit placeholders like [Insert Date] or [Attach Invoice] for details requiring manual confirmation.
CONSTRAINTS: Do not make unverified commitments regarding pricing, legal terms, or policy exceptions outside provided company parameters. Maintain a polite, concise enterprise communication tone.
OUTPUT FORMAT: Return a strict JSON object following this format:
{
  "draft_status": "READY_FOR_APPROVAL" | "AUTO_SEND_ELIGIBLE" | "MANUAL_WRITE_REQUIRED",
  "subject_line": "string",
  "body_text": "string",
  "template_used": "string"
}`,
    expectedOutputKeys: ['draft_status', 'subject_line', 'body_text', 'template_used']
  },
  {
    id: 5,
    name: 'Telemetry & Advisory',
    title: 'Token Telemetry & Business Advisory Agent',
    role: 'Analyze pipeline execution metrics, compute transaction token costs, track model performance, and generate executive optimization and process advisory recommendations.',
    description: 'Token calculation ($0.0005/1k in, $0.0015/1k out), LLM overhead reduction advisory, and workflow insights.',
    executionMode: 'llm',
    promptInstructions: `TITLE: You are the Token Telemetry & Business Advisory Agent for AI Email Triage.
ROLE: Your role is to analyze pipeline execution metrics, compute transaction token costs, track model performance, and generate executive optimization and process advisory recommendations.
TASKS: For each transaction state on the Blackboard Slate, execute the following evaluation:
Step 1. Token Usage Computation: Calculate total input and output tokens across all pipeline LLM calls.
Step 2. Financial Cost Calculation: Compute total USD cost per transaction using benchmark enterprise API pricing ($0.0005 / 1k input tokens, $0.0015 / 1k output tokens).
Step 3. Optimization Advisory: Identify opportunities to reduce LLM overhead (e.g., routing simple requests to deterministic rules, migrating classification to local open-weight models).
Step 4. Strategic Business Impact: Assess workflow efficiency and recommend operational improvements (e.g., staffing re-allocation, SLA bottleneck fixes).
CONSTRAINTS: Focus exclusively on computational cost, system telemetry, and business process performance. Do not alter routing outcomes or draft text on the Blackboard Slate.
OUTPUT FORMAT: Return a strict JSON object following this format:
{
  "telemetry_summary": {
    "total_input_tokens": 800,
    "total_output_tokens": 280,
    "total_pipeline_cost_usd": 0.00082
  },
  "cost_optimization_recommendation": "string",
  "business_process_advisory": "string"
}`,
    expectedOutputKeys: ['telemetry_summary', 'cost_optimization_recommendation', 'business_process_advisory']
  }
];

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'gemini',
  model: 'gemini-3.8-flash',
  endpoint: 'https://generativelanguage.googleapis.com',
  apiKey: '',
  enableTelemetry: true,
  classifierMode: 'llm',
  temperature: 0,
  timeoutMs: 15000,
  allowFallbackOnFailure: true
};

export const AVAILABLE_PROVIDERS: { id: LLMConfig['provider']; name: string; defaultModel: string; defaultEndpoint: string; note: string }[] = [
  {
    id: 'gemini',
    name: 'Google Gemini (Default)',
    defaultModel: 'gemini-3.8-flash',
    defaultEndpoint: 'https://generativelanguage.googleapis.com',
    note: 'Native high-speed multimodal & reasoning engine. Pre-configured via server environment.'
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT-4o / Compatible)',
    defaultModel: 'gpt-4o-mini',
    defaultEndpoint: 'https://api.openai.com/v1',
    note: 'Compatible with OpenAI, Groq, Together, DeepSeek, or any /v1/chat/completions endpoint.'
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    defaultModel: 'claude-3-5-sonnet-20241022',
    defaultEndpoint: 'https://api.anthropic.com/v1',
    note: 'Uses Anthropic Messages API format.'
  },
  {
    id: 'ollama',
    name: 'Local LLM (Ollama)',
    defaultModel: 'llama3.2',
    defaultEndpoint: 'http://localhost:11434/v1',
    note: 'Private on-premise execution with zero cloud egress costs.'
  },
  {
    id: 'custom',
    name: 'Custom LLM Gateway',
    defaultModel: 'custom-model',
    defaultEndpoint: 'https://your-llm-proxy.example.com/v1',
    note: 'Custom enterprise LLM gateway with OpenAI-compatible signature.'
  },
  {
    id: 'code-baseline',
    name: 'Deterministic Code Baseline (0 Tokens)',
    defaultModel: 'regex-keyword-v1',
    defaultEndpoint: 'local://deterministic',
    note: 'Zero-token rule/regex baseline for Tier-0 cost & accuracy benchmarking.'
  }
];

export const PRIMARY_CATEGORIES = [
  'Sales / High-Value',
  'Customer Service',
  'Admin / Operations',
  'Junk / Low-Priority',
  'Insufficient Info / Unroutable'
] as const;

export const QUEUE_LIST = [
  'Sales_Gold_Queue',
  'Support_Tier2_Escalation',
  'Finance_AP',
  'Human_Triage_Queue',
  'Admin_Operations_Queue',
  'Security_Quarantine_Queue',
  'General_Inquiry_Queue'
];

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  accuracy: 35,
  consistency: 20,
  doNotDecide: 15,
  formatCompliance: 10,
  costEfficiency: 10,
  latency: 10,
  locked: false
};

export const DEFAULT_ACCEPTANCE_THRESHOLDS: AcceptanceThresholds = {
  minCategoryAccuracyPct: 85,
  minConsistencyPct: 90,
  minFormatCompliancePct: 98,
  maxFalseNegativeRatePct: 5,
  maxLatencyMs: 5000
};

/**
 * Per-1k token pricing table (USD) for realistic economic comparisons & 100k/1M annual projections.
 */
const MODEL_PRICING_PER_1K: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /gemini.*pro/i, input: 0.00125, output: 0.005 },
  { match: /gemini.*flash-lite|flash-8b/i, input: 0.000075, output: 0.0003 },
  { match: /gemini.*flash/i, input: 0.0001, output: 0.0004 },
  { match: /gpt-4o-mini/i, input: 0.00015, output: 0.0006 },
  { match: /gpt-4o/i, input: 0.0025, output: 0.01 },
  { match: /gpt-4\.1-mini|gpt-4\.1-nano/i, input: 0.0004, output: 0.0016 },
  { match: /claude.*haiku/i, input: 0.0008, output: 0.004 },
  { match: /claude.*sonnet/i, input: 0.003, output: 0.015 },
  { match: /claude.*opus/i, input: 0.015, output: 0.075 }
];

export function calculateModelCostUSD(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const p = (provider || '').toLowerCase();
  if (p === 'ollama' || p === 'custom' || p === 'code-baseline') {
    return 0;
  }
  const m = model || '';
  const entry = MODEL_PRICING_PER_1K.find((row) => row.match.test(m));
  const inRate = entry ? entry.input : 0.0005;
  const outRate = entry ? entry.output : 0.0015;
  return (inputTokens / 1000) * inRate + (outputTokens / 1000) * outRate;
}
