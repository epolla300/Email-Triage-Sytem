/**
 * Centelli CommsIQ - Blackboard Slate, Evaluation & Capstone Types
 */

export type SecurityFlag = 'NONE' | 'PROMPT_INJECTION' | 'PHISHING' | 'MALICIOUS_CONTENT';

export type PrimaryCategory =
  | 'Sales / High-Value'
  | 'Customer Service'
  | 'Admin / Operations'
  | 'Junk / Low-Priority'
  | 'Insufficient Info / Unroutable';

export type Sentiment = 'Positive' | 'Neutral' | 'Frustrated' | 'Hostile';

export type PriorityTag = 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';

export type NotificationChannel = 'SLACK_VIP_CHANNEL' | 'TEAMS_LEAD_CHANNEL' | 'NONE';

export type CRMAction = 'CREATE_LEAD' | 'UPDATE_TICKET' | 'LOG_ONLY' | 'SKIP';

export type DraftStatus = 'READY_FOR_APPROVAL' | 'AUTO_SEND_ELIGIBLE' | 'MANUAL_WRITE_REQUIRED';

export type FailureType =
  | 'NONE'
  | 'TIMEOUT'
  | 'FORMAT_ERROR'
  | 'SCHEMA_ERROR'
  | 'API_ERROR';

export type EvalErrorType =
  | 'NONE'
  | 'MISROUTED_CATEGORY'
  | 'MISROUTED_QUEUE'
  | 'FALSE_POSITIVE_ESCALATION'
  | 'FALSE_NEGATIVE_ESCALATION'
  | 'DO_NOT_DECIDE_FAILURE'
  | 'FORMAT_FAILURE'
  | 'API_FAILURE';

export type ComplexityGroup = 'Simple' | 'Moderate' | 'Difficult';
export type LengthGroup = 'Short' | 'Medium' | 'Long';
export type AmbiguityGroup = 'Clear' | 'Partially Clear' | 'Unclear';
export type DatasetSplit = 'dev' | 'test' | 'manual';

export interface EmailGroundTruth {
  expected_category?: string;
  expected_queue?: string;
  expected_urgency?: number;
  expected_human_review?: boolean;
  is_do_not_decide?: boolean;
  expected_account_id?: string | null;
  expected_dates?: string | null;
  expected_party_size?: string | null;
  expected_value?: string | null;
  complexity?: ComplexityGroup;
  length_group?: LengthGroup;
  ambiguity?: AmbiguityGroup;
  split?: DatasetSplit;
  notes?: string;
}

export interface RunEvaluationResult {
  hasGroundTruth: boolean;
  categoryCorrect: boolean | null;
  queueCorrect: boolean | null;
  urgencyExact: boolean | null;
  urgencyWithin1: boolean | null;
  humanReviewCorrect: boolean | null;
  doNotDecideCorrect: boolean | null;
  metadataFieldsCorrect: number;
  metadataFieldsTotal: number;
  wholeRecordCorrect: boolean | null;
  errorType: EvalErrorType;
  overallScore: number | null; // 0 to 100
}

export interface ExtractedMetadata {
  account_id: string | null;
  requested_dates: string | null;
  party_size: string | null;
  estimated_value: string | null;
}

export interface SanitizerOutput {
  is_safe: boolean;
  security_flag: SecurityFlag;
  sanitized_subject: string;
  sanitized_body: string;
  pii_redacted: boolean;
  preprocessor_notes: string;
}

export interface ClassifierOutput {
  category: PrimaryCategory | string;
  intent: string;
  confidence_score: number;
  urgency: number; // 1 to 5
  sentiment: Sentiment | string;
  needs_human_review: boolean;
  extracted_metadata: ExtractedMetadata;
}

export interface RouterOutput {
  target_queue: string;
  assigned_team: string;
  priority_tag: PriorityTag;
  notification_channel: NotificationChannel;
  crm_action: CRMAction;
  routing_reason: string;
}

export interface ReplyDrafterOutput {
  draft_status: DraftStatus;
  subject_line: string;
  body_text: string;
  template_used: string;
}

export interface TelemetrySummary {
  total_input_tokens: number;
  total_output_tokens: number;
  total_pipeline_cost_usd: number;
}

export interface TelemetryOutput {
  telemetry_summary: TelemetrySummary;
  cost_optimization_recommendation: string;
  business_process_advisory: string;
}

export interface ExecutionMeta {
  provider: string;
  model: string;
  classifierMode: 'llm' | 'code';
  temperature: number;
  accessMethod: 'Cloud API' | 'Local Hosted' | 'Custom Gateway' | 'Deterministic Code';
  totalDurationMs: number;
  stepDurationsMs: Record<string, number>;
  executedAt: string;
  formatCompliant: boolean;
  failureType: FailureType;
  failureDetail?: string;
  usedFallback: boolean;
}

export interface BlackboardSlate {
  raw_input: {
    from: string;
    subject: string;
    body: string;
  };
  agent1_sanitizer?: SanitizerOutput;
  agent2_classifier?: ClassifierOutput;
  agent3_router?: RouterOutput;
  agent4_reply?: ReplyDrafterOutput;
  agent5_telemetry?: TelemetryOutput;
  execution_meta?: ExecutionMeta;
}

export type EmailStatus = 'Pending' | 'Processing' | 'Processed' | 'Security_Flagged' | 'Error';

export interface EmailItem {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: number;
  status: EmailStatus;
  activeStepIndex?: number;
  error?: string;
  slate?: BlackboardSlate;
  datasetName?: string;
  groundTruth?: EmailGroundTruth;
}

export type LLMProviderId = 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'custom' | 'code-baseline';

export interface LLMConfig {
  provider: LLMProviderId;
  model: string;
  endpoint: string;
  apiKey?: string;
  enableTelemetry?: boolean;
  classifierMode?: 'llm' | 'code';
  temperature?: number;
  timeoutMs?: number;
  allowFallbackOnFailure?: boolean;
}

export interface CandidateModelProfile {
  id: string;
  label: string;
  enabled: boolean;
  config: LLMConfig;
}

export interface ScoringWeights {
  accuracy: number;
  consistency: number;
  doNotDecide: number;
  formatCompliance: number;
  costEfficiency: number;
  latency: number;
  locked: boolean;
  lockedAt?: string;
}

export interface AcceptanceThresholds {
  minCategoryAccuracyPct: number;
  minConsistencyPct: number;
  minFormatCompliancePct: number;
  maxFalseNegativeRatePct: number;
  maxLatencyMs: number;
}

export interface PipelineAgentDef {
  id: number;
  name: string;
  title: string;
  role: string;
  description: string;
  executionMode?: 'code' | 'llm' | 'hybrid';
  promptInstructions: string;
  expectedOutputKeys: string[];
}

export interface TriageRunRecord {
  runId: string;
  batchId?: string;
  repeatIndex?: number;
  timestamp: number;
  dateStr: string;
  datasetName: string;
  telemetryEnabled: boolean;
  classifierMode: 'llm' | 'code';
  temperature: number;
  accessMethod: string;
  emailId: string;
  from: string;
  subject: string;
  provider: string;
  model: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUSD: number;
  isSafe: boolean;
  securityFlag: SecurityFlag;
  piiRedacted: boolean;
  category: string;
  intent: string;
  urgency: number;
  sentiment: string;
  confidenceScore: number;
  needsHumanReview: boolean;
  targetQueue: string;
  priorityTag: PriorityTag;
  notificationChannel: NotificationChannel;
  crmAction: CRMAction;
  routingReason: string;
  draftStatus: DraftStatus;
  draftSubject: string;
  draftBody: string;
  templateUsed: string;
  costTip: string;
  businessAdvisory: string;
  extractedMetadata: ExtractedMetadata;
  formatCompliant: boolean;
  failureType: FailureType;
  failureDetail?: string;
  usedFallback: boolean;
  groundTruth?: EmailGroundTruth;
  evaluation?: RunEvaluationResult;
  slate: BlackboardSlate;
}
