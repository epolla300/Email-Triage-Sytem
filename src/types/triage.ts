/**
 * Centelli CommsIQ - Blackboard Slate and Agent Types
 */

export type SecurityFlag = 'NONE' | 'PROMPT_INJECTION' | 'PHISHING' | 'MALICIOUS_CONTENT';

export type PrimaryCategory = 
  | 'Sales / High-Value'
  | 'Customer Service'
  | 'Admin / Operations'
  | 'Junk / Low-Priority';

export type Sentiment = 'Positive' | 'Neutral' | 'Frustrated' | 'Hostile';

export type PriorityTag = 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';

export type NotificationChannel = 'SLACK_VIP_CHANNEL' | 'TEAMS_LEAD_CHANNEL' | 'NONE';

export type CRMAction = 'CREATE_LEAD' | 'UPDATE_TICKET' | 'LOG_ONLY' | 'SKIP';

export type DraftStatus = 'READY_FOR_APPROVAL' | 'AUTO_SEND_ELIGIBLE' | 'MANUAL_WRITE_REQUIRED';

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
  execution_meta?: {
    provider: string;
    model: string;
    totalDurationMs: number;
    stepDurationsMs: Record<string, number>;
    executedAt: string;
  };
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
}

export type LLMProviderId = 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'custom';

export interface LLMConfig {
  provider: LLMProviderId;
  model: string;
  endpoint: string;
  apiKey?: string;
}

export interface PipelineAgentDef {
  id: number;
  name: string;
  title: string;
  role: string;
  description: string;
  promptInstructions: string;
  expectedOutputKeys: string[];
}
