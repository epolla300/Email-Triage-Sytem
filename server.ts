import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import {
  BlackboardSlate,
  LLMConfig,
  SanitizerOutput,
  ClassifierOutput,
  RouterOutput,
  ReplyDrafterOutput,
  TelemetryOutput
} from './src/types/triage';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

/**
 * Helper: Luhn check for credit card number validation
 */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * Agent 1: Deterministic Code-Based Sanitizer & Security Engine (0 LLM Tokens)
 */
function runCodeSanitizer(email: { from: string; subject: string; body: string }): SanitizerOutput {
  const rawSubject = (email.subject || '').trim();
  const rawBody = (email.body || '').trim();
  const rawText = `${rawSubject}\n${rawBody}`;

  // 1. Security Vector Detection (Prompt Injection, Phishing, Malicious Content)
  const injectionPatterns = [
    /ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules)/i,
    /disregard\s+(?:all\s+|any\s+)?(?:previous|prior)\s+(?:instructions|prompts|rules)/i,
    /system\s+override/i,
    /jailbreak/i,
    /you\s+are\s+now\s+(?:in\s+)?(?:developer\s+mode|dan\s+mode|unfiltered|unrestricted|admin|root)/i,
    /new\s+system\s+prompt/i,
    /reveal\s+(?:your\s+)?(?:system\s+prompt|instructions|api\s*key|secrets)/i,
    /bypass\s+(?:all\s+)?(?:security|filters|guardrails|safety)/i,
    /<\|(?:im_start|system|assistant)\|>/i,
    /\[INST\]|###\s*SYSTEM\s*:/i
  ];

  const phishingPatterns = [
    /https?:\/\/(?:bit\.ly|tinyurl\.com|goo\.gl|rb\.gy|is\.gd|cutt\.ly|t\.co)\/\S+/i,
    /login-update-[a-z0-9.-]+/i,
    /verify-bank-security/i,
    /password-reset-urgent/i,
    /secure-login-[a-z0-9.-]+/i,
    /account-verify-[a-z0-9.-]+/i,
    /https?:\/\/\d{1,3}(?:\.\d{1,3}){3}(?:[:/]\S*)?/i,
    /(?:verify\s+your\s+account\s+immediately|click\s+here\s+to\s+avoid\s+suspension|update\s+your\s+banking\s+credentials|enter\s+your\s+password\s+below)/i,
    /(?:paypa1|micr0soft|g00gle|amaz0n|app1e)\./i
  ];

  const maliciousPatterns = [
    /<script[\s\S]*?>/i,
    /javascript\s*:/i,
    /on(?:error|load|click|mouseover)\s*=/i,
    /<iframe[\s\S]*?>/i,
    /\beval\s*\(/i,
    /document\.cookie/i,
    /drop\s+table\b/i,
    /union\s+select\b/i,
    /;\s*delete\s+from\b/i,
    /xp_cmdshell/i,
    /data:text\/html;base64,/i,
    /\bcurl\s+-[a-zA-Z]*s\b/i,
    /\bwget\s+https?:\/\//i,
    /\bpowershell\s+-e(?:ncodedcommand)?\b/i,
    /\brm\s+-rf\b/i
  ];

  let isSafe = true;
  let securityFlag: SanitizerOutput['security_flag'] = 'NONE';
  const notes: string[] = [];

  if (injectionPatterns.some((p) => p.test(rawText))) {
    isSafe = false;
    securityFlag = 'PROMPT_INJECTION';
    notes.push('Prompt injection pattern detected and neutralized; command execution blocked.');
  } else if (phishingPatterns.some((p) => p.test(rawText))) {
    isSafe = false;
    securityFlag = 'PHISHING';
    notes.push('Suspicious redirect link, IP-literal URL, or deceptive phishing pattern detected.');
  } else if (maliciousPatterns.some((p) => p.test(rawText))) {
    isSafe = false;
    securityFlag = 'MALICIOUS_CONTENT';
    notes.push('Potentially malicious script, SQL injection, or shell execution payload detected.');
  }

  // 2. Thread & Footer Sanitization
  let sanitizedBody = rawBody;
  const beforeLen = sanitizedBody.length;

  // Strip quoted lines (> ...)
  sanitizedBody = sanitizedBody.replace(/^>.*$/gm, '');
  // Strip "On <date>, <person> wrote:" historical reply blocks
  sanitizedBody = sanitizedBody.replace(/\n\s*On\s+.{5,120}\s+wrote:\s*[\s\S]*$/i, '');
  // Strip "-----Original Message-----" or Outlook reply headers
  sanitizedBody = sanitizedBody.replace(/\n\s*-{3,}\s*Original Message\s*-{3,}[\s\S]*$/i, '');
  sanitizedBody = sanitizedBody.replace(/\n\s*From:\s+[^\n]+\n\s*Sent:\s+[^\n]+\n\s*To:\s+[^\n]+[\s\S]*$/i, '');
  // Strip legal confidentiality disclaimers
  sanitizedBody = sanitizedBody.replace(
    /\n\s*(?:CONFIDENTIALITY NOTICE|PRIVILEGED AND CONFIDENTIAL|DISCLAIMER:|This e-?mail(?: message)? (?:and any attachments )?(?:is|are) intended only for)[\s\S]*$/i,
    ''
  );
  // Strip standard signature separator (-- ) & mobile footers
  sanitizedBody = sanitizedBody.replace(/\n\s*--\s*\n[\s\S]*$/, '');
  sanitizedBody = sanitizedBody.replace(
    /\n\s*(?:Sent from my (?:iPhone|iPad|Android|Galaxy|Mobile)|Get Outlook for (?:iOS|Android))[\s\S]*$/i,
    ''
  );

  // Capture any sign-off name before stripping trailing signature block
  const signoffMatch = sanitizedBody.match(
    /\n\s*(?:Best regards|Kind regards|Warm regards|Thanks & Regards|Sincerely|Respectfully|Cheers|Many thanks|Regards),?\s*\n+([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){1,2})/
  );
  const discoveredNames = new Set<string>();
  if (signoffMatch && signoffMatch[1]) {
    discoveredNames.add(signoffMatch[1].trim());
  }

  // Strip trailing sign-off signature block (only if near the end, up to 5 short lines)
  sanitizedBody = sanitizedBody.replace(
    /\n\s*(?:Best regards|Kind regards|Warm regards|Thanks & Regards|Sincerely|Respectfully|Cheers|Many thanks),?\s*(?:\n.{0,100}){1,5}\s*$/i,
    ''
  );

  sanitizedBody = sanitizedBody.replace(/\n{3,}/g, '\n\n').trim();
  const threadStripped = sanitizedBody.length < beforeLen;
  if (threadStripped) {
    notes.push('Stripped thread history, signature, or footer boilerplate.');
  }

  // 3. PII Scrubbing & Redaction
  const redactedTypes = new Set<string>();

  const redactString = (input: string): string => {
    let out = input;

    // SSN (e.g. 123-45-6789)
    out = out.replace(/\b\d{3}-\d{2}-\d{4}\b/g, () => {
      redactedTypes.add('SSN');
      return '[REDACTED_SSN]';
    });

    // Credit Cards (13-19 digits with spaces/dashes, validated with Luhn or 4x4 pattern)
    out = out.replace(/\b(?:\d{4}[ -]){3}\d{4}\b|\b(?:\d[ -]?){13,19}\b/g, (match) => {
      const digits = match.replace(/\D/g, '');
      if (digits.length >= 13 && digits.length <= 19 && (passesLuhn(digits) || /^(?:\d{4}[ -]){3}\d{4}$/.test(match))) {
        redactedTypes.add('CREDIT_CARD');
        return '[REDACTED_CREDIT_CARD]';
      }
      return match;
    });

    // Email Addresses
    out = out.replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, () => {
      redactedTypes.add('EMAIL');
      return '[REDACTED_EMAIL]';
    });

    // Phone Numbers
    out = out.replace(/(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g, () => {
      redactedTypes.add('PHONE');
      return '[REDACTED_PHONE]';
    });

    // Physical Street Addresses
    out = out.replace(
      /\b\d{1,5}\s+(?:[A-Z][a-zA-Z0-9.'-]+\s+){1,4}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Way|Parkway|Pkwy|Circle|Cir|Place|Pl)\.?(?:,\s*(?:Apt|Suite|Ste|Unit|#)\s*[A-Za-z0-9-]+)?(?:,\s*[A-Za-z\s.'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)?\b/g,
      () => {
        redactedTypes.add('ADDRESS');
        return '[REDACTED_ADDRESS]';
      }
    );

    // Human Names: from `from` display name or `first.last@`
    const fromDisplay = email.from.match(/^"?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})"?\s*</);
    if (fromDisplay?.[1]) discoveredNames.add(fromDisplay[1].trim());
    const fromLocal = email.from.match(/^([a-z]{2,15})\.([a-z]{2,15})@/i);
    if (fromLocal) {
      const genericLocal = new Set(['no', 'do', 'info', 'sales', 'support', 'customer', 'billing', 'admin', 'team']);
      if (!genericLocal.has(fromLocal[1].toLowerCase())) {
        const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        discoveredNames.add(`${cap(fromLocal[1])} ${cap(fromLocal[2])}`);
      }
    }

    // Explicit self-introduction names ("My name is Jane Doe", "This is John Smith")
    out = out.replace(
      /\b(My name is|I am|I'm|This is|Contact:)\s+([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){1,2})\b/g,
      (_m, prefix, name) => {
        redactedTypes.add('NAME');
        return `${prefix} [REDACTED_NAME]`;
      }
    );

    // Salutation names ("Hi John," / "Dear Sarah Smith,") excluding generic words
    const genericGreetingWords = new Set([
      'Team', 'Support', 'Sales', 'Centelli', 'Sir', 'Madam', 'All', 'Everyone',
      'Customer', 'User', 'Admin', 'Billing', 'Operations', 'There', 'Friends'
    ]);
    out = out.replace(
      /\b(Hi|Hello|Dear)\s+([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20})?)(?=[,\n!])/g,
      (full, greet, name) => {
        const firstWord = name.split(/\s+/)[0];
        if (genericGreetingWords.has(firstWord)) return full;
        redactedTypes.add('NAME');
        return `${greet} [REDACTED_NAME]`;
      }
    );

    // Redact any discovered full names
    discoveredNames.forEach((name) => {
      if (name.length >= 4) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nameRe = new RegExp(`\\b${escaped}\\b`, 'g');
        if (nameRe.test(out)) {
          out = out.replace(nameRe, '[REDACTED_NAME]');
          redactedTypes.add('NAME');
        }
      }
    });

    return out;
  };

  const sanitizedSubject = redactString(rawSubject);
  sanitizedBody = redactString(sanitizedBody || rawBody);

  const piiRedacted = redactedTypes.size > 0;
  if (piiRedacted) {
    notes.push(`Redacted PII (${Array.from(redactedTypes).join(', ')}).`);
  }

  if (isSafe && notes.length === 0) {
    notes.push('Clean payload verified. No PII or security threats detected.');
  }

  return {
    is_safe: isSafe,
    security_flag: securityFlag,
    sanitized_subject: sanitizedSubject,
    sanitized_body: sanitizedBody,
    pii_redacted: piiRedacted,
    preprocessor_notes: `[Code Engine] ${notes.join(' ')}`
  };
}

/**
 * Agent 2: Deterministic Code-Based Classifier Engine (0 LLM Tokens)
 * Operates exclusively on Agent 1's sanitized Blackboard Slate output.
 */
function runCodeClassifier(sanitizer: SanitizerOutput): ClassifierOutput {
  const subj = sanitizer.sanitized_subject || '';
  const body = sanitizer.sanitized_body || '';
  const subjLower = subj.toLowerCase();
  const bodyLower = body.toLowerCase();
  const combined = `${subj} ${body}`;
  const combinedLower = `${subjLower} ${bodyLower}`;

  // Score each primary category (Subject matches count 2x, Body matches count 1x)
  const scoreKeywords = (patterns: RegExp[]): number => {
    let score = 0;
    for (const p of patterns) {
      if (p.test(subjLower)) score += 2;
      if (p.test(bodyLower)) score += 1;
    }
    return score;
  };

  const salesScore = scoreKeywords([
    /\brfp\b/,
    /request for proposal/,
    /\benterprise\b/,
    /\bpricing\b/,
    /\bquote\b|\bquotation\b/,
    /\bdemo\b|\bwalkthrough\b/,
    /\bseats?\b|\blicenses?\b/,
    /\bcontract\b|\bmsa\b|\bprocurement\b/,
    /\bpartnership\b|\bvolume discount\b/,
    /\bgroup booking\b|\bcorporate package\b|\bcharter\b/,
    /\bupgrade\b|\bsales\b|\bdeal\b/
  ]);

  const supportScore = scoreKeywords([
    /\bsupport\b|\bhelp\b|\bticket\b/,
    /\bissue\b|\bproblem\b|\bbug\b|\berror\b/,
    /\bbroken\b|\bnot working\b|\bfailing\b|\bcrash(?:ed|ing)?\b/,
    /\boutage\b|\bdown\b|\bunavailable\b/,
    /\brefund\b|\bcharged twice\b|\bdouble charge\b|\bovercharged\b/,
    /\bcancel(?:lation)?\b|\bmodif(?:y|ication)\b|\breschedule\b/,
    /\bcomplaint\b|\bescalat(?:e|ion)\b|\bdisappointed\b/,
    /\blocked out\b|\bcannot log\s?in\b|\bcan't log\s?in\b/,
    /\bhow do i\b|\bfaq\b|\bstatus of my\b/
  ]);

  const opsScore = scoreKeywords([
    /\binvoice\b|\baccounts? payable\b|\baccounts? receivable\b|\bap\/ar\b/,
    /\bw-?9\b|\btax form\b|\bremittance\b|\bach\b|\bwire details\b/,
    /\bpurchase order\b|\bpo\s*#?\d*\b|\bvendor\b/,
    /\bpayroll\b|\bhuman resources\b|\bhr\b|\bpto\b|\bonboarding\b/,
    /\bvpn\b|\bit access\b|\bpermission\b|\bprovisioning\b/,
    /\baudit\b|\bcertificate of insurance\b|\bcoi\b|\baddress update\b/,
    /\bbilling statement\b|\bcompliance\b/
  ]);

  const junkScore = scoreKeywords([
    /\bunsubscribe\b|\bnewsletter\b|\bpromotional\b/,
    /\bcrypto\b|\bbitcoin\b|\blottery\b|\bwinner\b|\bcasino\b/,
    /\bviagra\b|\bseo rank\b|\bbacklinks\b/,
    /\blimited time offer\b|\bact now\b|\bearn money\b/,
    /\bcold outreach\b|\bmarketing list\b/
  ]);

  // Sentiment Detection
  const hostilePatterns = [
    /\blawyer\b|\battorney\b|\blawsuit\b|\bsue\b|\blegal action\b/i,
    /\bfraud\b|\bscam\b|\bthief\b|\bunacceptable\b|\bfurious\b|\bhorrible\b|\bdisgrace\b|\bworst\b|\bincompetent\b/i,
    /\bftc\b|\bbbb\b|\bregulator(?:y)?\b|\breport you\b|\bgdpr violation\b/i
  ];
  const frustratedPatterns = [
    /\bbroken\b|\berror\b|\bdown\b|\boutage\b|\bfailing\b|\bcrash/i,
    /\bstill waiting\b|\bno response\b|\bthird time\b|\bcharged twice\b|\bovercharged\b/i,
    /\brefund\b|\bdelayed\b|\bdisappointed\b|\bannoying\b|\bstuck\b|\bunable to\b/i
  ];
  const positivePatterns = [
    /\bexcited\b|\blove\b|\bgreat\b|\bthank\b|\bappreciate\b|\blooking forward\b/i,
    /\binterested in\b|\bhappy to\b|\bdelighted\b|\bwonderful\b|\bimpressive\b/i
  ];

  const isHostile = hostilePatterns.some((p) => p.test(combinedLower));
  const isFrustrated = !isHostile && frustratedPatterns.some((p) => p.test(combinedLower));
  const isPositive = !isHostile && !isFrustrated && positivePatterns.some((p) => p.test(combinedLower));

  let sentiment: ClassifierOutput['sentiment'] = 'Neutral';
  if (!sanitizer.is_safe || isHostile) {
    sentiment = 'Hostile';
  } else if (isFrustrated) {
    sentiment = 'Frustrated';
  } else if (isPositive) {
    sentiment = 'Positive';
  }

  // Primary Category & Confidence Calculation
  const scores: Array<{ cat: ClassifierOutput['category']; score: number }> = [
    { cat: 'Sales / High-Value', score: salesScore },
    { cat: 'Customer Service', score: supportScore },
    { cat: 'Admin / Operations', score: opsScore },
    { cat: 'Junk / Low-Priority', score: junkScore }
  ].sort((a, b) => b.score - a.score);

  let category: ClassifierOutput['category'];
  let confidenceScore: number;

  if (!sanitizer.is_safe) {
    category = 'Junk / Low-Priority';
    confidenceScore = 0.99;
  } else if (scores[0].score === 0) {
    // No strong keywords matched -> default to Customer Service with lower confidence so human review triggers
    category = 'Customer Service';
    confidenceScore = 0.72;
  } else {
    category = scores[0].cat;
    const margin = scores[0].score - scores[1].score;
    const rawConf = 0.76 + Math.min(0.14, margin * 0.035) + Math.min(0.08, scores[0].score * 0.015);
    confidenceScore = parseFloat(Math.min(0.98, rawConf).toFixed(2));
  }

  // Secondary Intent Identification
  let intent = 'General Inquiry';
  if (!sanitizer.is_safe) {
    intent =
      sanitizer.security_flag === 'PROMPT_INJECTION'
        ? 'Security Threat / Prompt Injection'
        : sanitizer.security_flag === 'PHISHING'
        ? 'Phishing / Spoofing Attempt'
        : 'Malicious Payload / Code Injection';
  } else if (category === 'Sales / High-Value') {
    if (/\brfp\b|group booking|corporate package/i.test(combinedLower)) intent = 'Group RFP / Volume Quote';
    else if (/demo|walkthrough/i.test(combinedLower)) intent = 'Enterprise Demo & Evaluation';
    else if (/pricing|quote|contract|seats|license/i.test(combinedLower)) intent = 'Contract & Pricing Inquiry';
    else if (/partnership/i.test(combinedLower)) intent = 'Partnership / Commercial Inquiry';
    else intent = 'New Sales Opportunity';
  } else if (category === 'Customer Service') {
    if (isHostile) intent = 'Escalation / Legal Risk';
    else if (/outage|down|crash|broken|bug|error/i.test(combinedLower)) intent = 'Technical Outage / Defect';
    else if (/refund|charged twice|double charge|overcharged/i.test(combinedLower)) intent = 'Refund & Billing Dispute';
    else if (/modif|reschedule|cancel|booking/i.test(combinedLower)) intent = 'Booking / Order Modification';
    else if (/how do i|faq|locked out|log\s?in/i.test(combinedLower)) intent = 'Account Access & Support FAQ';
    else intent = 'General Customer Support';
  } else if (category === 'Admin / Operations') {
    if (/invoice|ap\/ar|accounts payable|remittance|po\s*#|purchase order/i.test(combinedLower)) intent = 'Vendor Invoice & AP';
    else if (/w-?9|tax|audit|coi|compliance/i.test(combinedLower)) intent = 'Compliance & Tax Admin';
    else if (/payroll|hr|human resources|pto|onboarding/i.test(combinedLower)) intent = 'HR / Internal Operations';
    else if (/vpn|it access|permission|provisioning/i.test(combinedLower)) intent = 'Internal IT & Access Request';
    else intent = 'Operational / Billing Admin';
  } else {
    intent = /newsletter|unsubscribe|promotional/i.test(combinedLower)
      ? 'Marketing / Newsletter'
      : 'Spam Solicitation';
  }

  // Urgency Score (1 to 5)
  let urgency =
    category === 'Junk / Low-Priority'
      ? 1
      : category === 'Admin / Operations'
      ? 2
      : category === 'Customer Service'
      ? 2
      : 3;

  if (!sanitizer.is_safe || isHostile) {
    urgency = 5;
  } else {
    if (/outage|down|crash|critical|emergency|production|cannot access|charged twice/i.test(combinedLower)) {
      urgency += 2;
    }
    if (/urgent|asap|immediately|today|tomorrow|deadline|\brfp\b|\benterprise\b/i.test(combinedLower)) {
      urgency += 1;
    }
    if (sentiment === 'Frustrated') {
      urgency += 1;
    }
  }
  urgency = Math.max(1, Math.min(5, urgency));

  // Metadata Extraction strictly from sanitized text (null when missing)
  const accountMatch = combined.match(
    /(?:account|acct|customer|client|member|ticket|order|invoice|inv|po|case|ref(?:erence)?)\s*(?:id|number|no\.?|#)?\s*[:#-]\s*([A-Z0-9][A-Z0-9\-]{2,20})/i
  );
  const dateMatch = combined.match(
    /\b(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|Q[1-4](?:\s+\d{4})?|next\s+(?:week|month)|monday|tuesday|wednesday|thursday|friday)\b/i
  );
  const sizeMatch = combined.match(
    /\b(\d[\d,]*)\s*(?:people|persons|guests|attendees|seats|users|licenses|employees|rooms|participants|team members)\b/i
  );
  const valMatch = combined.match(
    /(?:\$|USD\s*|€|£)\s*[\d,]+(?:\.\d{1,2})?(?:\s*[kmb]\b)?|\b\d+(?:\.\d+)?[kKmM]\b(?=\s*(?:budget|arr|deal|contract|value|usd|annual))?/i
  );

  const hasLegalKeywords = /\b(?:lawyer|attorney|lawsuit|sue|gdpr|hipaa|pci|subpoena|regulator|legal action)\b/i.test(
    combinedLower
  );

  const needsHumanReview =
    !sanitizer.is_safe ||
    confidenceScore < 0.8 ||
    sentiment === 'Hostile' ||
    hasLegalKeywords;

  return {
    category,
    intent,
    confidence_score: confidenceScore,
    urgency,
    sentiment,
    needs_human_review: needsHumanReview,
    extracted_metadata: {
      account_id: accountMatch ? accountMatch[1] : null,
      requested_dates: dateMatch ? dateMatch[0] : null,
      party_size: sizeMatch ? sizeMatch[0] : null,
      estimated_value: valMatch ? valMatch[0].trim() : null
    }
  };
}

/**
 * Deterministic Fallback Analyzer (Router, Reply Drafter, Telemetry)
 * Uses code-based Sanitizer (Agent 1) and Classifier (Agent 2), plus rule-based fallback for Agents 3-5 if LLM is unavailable.
 */
function deterministicAnalyze(email: { from: string; subject: string; body: string }) {
  const sanitizer = runCodeSanitizer(email);
  const classifier = runCodeClassifier(sanitizer);
  const isSafe = sanitizer.is_safe;
  const { category, urgency, sentiment } = classifier;
  const lower = `${sanitizer.sanitized_subject} ${sanitizer.sanitized_body}`.toLowerCase();

  // 4. Router
  let targetQueue = 'Customer_Support_Tier1';
  let assignedTeam = 'Customer Support Team';
  let priorityTag: RouterOutput['priority_tag'] = 'NORMAL';
  let notif: RouterOutput['notification_channel'] = 'NONE';
  let crmAction: RouterOutput['crm_action'] = 'UPDATE_TICKET';
  let routingReason = 'Standard inquiry routed to front-line support queue.';

  if (!isSafe) {
    targetQueue = 'Security_Quarantine_Queue';
    assignedTeam = 'SecOps Infosec Triage';
    priorityTag = 'URGENT';
    notif = 'SLACK_VIP_CHANNEL';
    crmAction = 'LOG_ONLY';
    routingReason = 'Security vector triggered automated quarantine isolation.';
  } else if (category === 'Sales / High-Value') {
    targetQueue = 'Sales_Gold_Queue';
    assignedTeam = 'Enterprise Commercial Team';
    priorityTag = urgency >= 4 ? 'URGENT' : 'HIGH';
    notif = urgency >= 4 ? 'SLACK_VIP_CHANNEL' : 'TEAMS_LEAD_CHANNEL';
    crmAction = 'CREATE_LEAD';
    routingReason = 'High-value enterprise opportunity assigned to specialized account executives.';
  } else if (category === 'Customer Service') {
    if (urgency >= 4 || sentiment === 'Hostile') {
      targetQueue = 'Support_Tier2_Escalation';
      assignedTeam = 'Executive Resolution Squad';
      priorityTag = 'URGENT';
      notif = 'SLACK_VIP_CHANNEL';
      crmAction = 'UPDATE_TICKET';
      routingReason = 'Priority escalation triggered due to critical urgency and customer sentiment.';
    } else {
      targetQueue = 'Support_Tier1_Queue';
      assignedTeam = 'General Support Team';
      priorityTag = 'NORMAL';
      notif = 'NONE';
      crmAction = 'UPDATE_TICKET';
      routingReason = 'Routine user inquiry placed into standard FIFO ticket queue.';
    }
  } else if (category === 'Admin / Operations') {
    targetQueue = /invoice|billing/i.test(lower) ? 'Finance_AP' : 'Admin_Operations_Queue';
    assignedTeam = /invoice|billing/i.test(lower) ? 'Finance Accounts Payable' : 'Internal IT & Operations';
    priorityTag = 'NORMAL';
    notif = 'NONE';
    crmAction = 'LOG_ONLY';
    routingReason = 'Operational workflow item dispatched to designated departmental queue.';
  } else {
    targetQueue = 'Junk_Quarantine';
    assignedTeam = 'Automated Spam Filters';
    priorityTag = 'LOW';
    notif = 'NONE';
    crmAction = 'SKIP';
    routingReason = 'Low priority / spam payload flagged for suppression.';
  }

  const router: RouterOutput = {
    target_queue: targetQueue,
    assigned_team: assignedTeam,
    priority_tag: priorityTag,
    notification_channel: notif,
    crm_action: crmAction,
    routing_reason: routingReason
  };

  // 5. Reply Drafter
  let draftStatus: ReplyDrafterOutput['draft_status'] = 'READY_FOR_APPROVAL';
  let draftSubject = `Re: ${email.subject}`;
  let draftBody = '';
  let templateUsed = 'Standard Customer Response Template';

  if (!isSafe) {
    draftStatus = 'MANUAL_WRITE_REQUIRED';
    draftSubject = `[SECURITY NOTICE] Review of: ${email.subject}`;
    draftBody = 'Automated response disabled. This incoming message was flagged for potential security or injection risks and requires manual inspection by security personnel.';
    templateUsed = 'Security Quarantine Protocol';
  } else if (sentiment === 'Hostile' || urgency === 5) {
    draftStatus = 'MANUAL_WRITE_REQUIRED';
    draftBody = `Dear [REDACTED_NAME],\n\nThank you for bringing this to our attention. We take this issue very seriously and our leadership team has been alerted.\n\nA senior specialist is investigating this matter immediately and will reach out with a resolution by [Insert Resolution Time].\n\nCase Reference: ${classifier.extracted_metadata.account_id || '[Insert Ticket ID]'}\n\nSincerely,\nExecutive Resolution Team`;
    templateUsed = 'Priority Customer Escalation Template';
  } else if (category === 'Sales / High-Value') {
    draftStatus = 'READY_FOR_APPROVAL';
    draftBody = `Hello [REDACTED_NAME],\n\nThank you for reaching out to Centelli regarding our enterprise solutions!\n\nWe would be delighted to arrange a customized walkthrough for your team${classifier.extracted_metadata.party_size ? ` (${classifier.extracted_metadata.party_size})` : ''}. Our account team is available at [Insert Date/Time Window].\n\nCould you please confirm if this timeframe works for you, or feel free to pick a slot directly via our schedule link.\n\nBest regards,\nCentelli Enterprise Sales Team`;
    templateUsed = 'Enterprise Sales Qualification Template';
  } else if (classifier.confidence_score > 0.95 && sentiment === 'Neutral') {
    draftStatus = 'AUTO_SEND_ELIGIBLE';
    draftBody = `Hi [REDACTED_NAME],\n\nThank you for contacting Centelli Support regarding "${email.subject}".\n\nWe have received your request and our team is actively reviewing the details. If you have any additional information or screenshots to provide, please reply directly to this thread.\n\nBest regards,\nCentelli Support Team`;
    templateUsed = 'Standard Acknowledgement FAQ';
  } else {
    draftStatus = 'READY_FOR_APPROVAL';
    draftBody = `Hello [REDACTED_NAME],\n\nThank you for contacting Centelli. We have logged your request under ticket reference [Insert Ticket ID].\n\nOur operations team is reviewing your inquiry and will follow up with next steps within one business day.\n\nKind regards,\nCentelli Operations`;
    templateUsed = 'Operations Routing Template';
  }

  const replyDrafter: ReplyDrafterOutput = {
    draft_status: draftStatus,
    subject_line: draftSubject,
    body_text: draftBody,
    template_used: templateUsed
  };

  // 6. Telemetry & Advisory (Agents 1 & 2 run in code = 0 tokens)
  const rawLength = `${email.subject}\n${email.body}`.length;
  const inputToks = Math.max(80, Math.floor(rawLength * 0.45) + 220);
  const outputToks = Math.max(60, Math.floor((draftBody.length + 140) * 0.35));
  const cost = (inputToks / 1000) * 0.0005 + (outputToks / 1000) * 0.0015;

  const telemetry: TelemetryOutput = {
    telemetry_summary: {
      total_input_tokens: inputToks,
      total_output_tokens: outputToks,
      total_pipeline_cost_usd: parseFloat(cost.toFixed(5))
    },
    cost_optimization_recommendation: category === 'Junk / Low-Priority'
      ? 'Agents 1 & 2 blocked/filtered this payload in code (0 LLM tokens). Consider skipping LLM reply drafting for spam/quarantine payloads to achieve 100% token savings.'
      : 'Agents 1 & 2 execute deterministically in code (0 tokens). Consolidating Agent 3 routing into rules could further reduce LLM latency.',
    business_process_advisory: urgency >= 4
      ? 'High-urgency transaction: Recommended establishing an automated SLA escalation trigger if unassigned after 15 minutes.'
      : 'Routine transaction: Standard 4-hour SLA applies. Candidate for 1-click automated response approval.'
  };

  return { sanitizer, classifier, router, replyDrafter, telemetry };
}

/**
 * Execute prompt with Gemini API using @google/genai SDK
 */
async function callGemini(
  systemInstruction: string,
  userPrompt: string,
  modelName: string = 'gemini-3.8-flash',
  customKey?: string
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = customKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server or in request.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });

  const response = await ai.models.generateContent({
    model: modelName || 'gemini-3.8-flash',
    contents: userPrompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json'
    }
  });

  const text = response.text || '{}';
  const inputTokens = response.usageMetadata?.promptTokenCount || 250;
  const outputTokens = response.usageMetadata?.candidatesTokenCount || 100;

  return { text, inputTokens, outputTokens };
}

/**
 * Execute OpenAI / Compatible / Ollama / Custom Endpoint
 */
async function callOpenAICompatible(
  systemInstruction: string,
  userPrompt: string,
  config: LLMConfig
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  let endpoint = config.endpoint.replace(/\/+$/, '');
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint = `${endpoint}/chat/completions`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI-compatible API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '{}';
  const inputTokens = data.usage?.prompt_tokens || 250;
  const outputTokens = data.usage?.completion_tokens || 100;

  return { text, inputTokens, outputTokens };
}

/**
 * Execute Anthropic API
 */
async function callAnthropic(
  systemInstruction: string,
  userPrompt: string,
  config: LLMConfig
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  let endpoint = config.endpoint.replace(/\/+$/, '');
  if (!endpoint.endsWith('/messages')) {
    endpoint = `${endpoint}/messages`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': config.apiKey || '',
    'anthropic-version': '2023-06-01'
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model || 'claude-3-5-sonnet-20241022',
      system: `${systemInstruction}\nReturn your answer strictly as valid JSON without extra text or markdown wraps.`,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 1500
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text || '{}';
  // Strip potential markdown codefence
  const cleaned = rawText.replace(/^```json/m, '').replace(/^```/m, '').replace(/```$/m, '').trim();

  const inputTokens = data.usage?.input_tokens || 250;
  const outputTokens = data.usage?.output_tokens || 100;

  return { text: cleaned, inputTokens, outputTokens };
}

function withTimeout<T>(promise: Promise<T>, ms: number = 5500): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`API call timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * Unified Agent Dispatcher: calls selected model or falls back gracefully
 */
async function callAgent(
  systemInstruction: string,
  userPrompt: string,
  config: LLMConfig
): Promise<{ json: any; inputTokens: number; outputTokens: number }> {
  let rawText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    if (config.provider === 'gemini') {
      const res = await withTimeout(callGemini(systemInstruction, userPrompt, config.model, config.apiKey), 5500);
      rawText = res.text;
      inputTokens = res.inputTokens;
      outputTokens = res.outputTokens;
    } else if (config.provider === 'openai' || config.provider === 'ollama' || config.provider === 'custom') {
      const res = await withTimeout(callOpenAICompatible(systemInstruction, userPrompt, config), 5500);
      rawText = res.text;
      inputTokens = res.inputTokens;
      outputTokens = res.outputTokens;
    } else if (config.provider === 'anthropic') {
      const res = await withTimeout(callAnthropic(systemInstruction, userPrompt, config), 5500);
      rawText = res.text;
      inputTokens = res.inputTokens;
      outputTokens = res.outputTokens;
    } else {
      throw new Error(`Unsupported provider: ${config.provider}`);
    }

    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    return { json: parsed, inputTokens, outputTokens };
  } catch (err: any) {
    // If the external LLM call failed or wasn't configured, log and throw so the pipeline orchestrator can use deterministic fallback
    console.warn(`[Agent Execution Notice] Using deterministic analyzer: ${err.message}`);
    throw err;
  }
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Server Health & Status
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    defaultProvider: 'gemini',
    defaultModel: 'gemini-3.8-flash',
    geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY)
  });
});

// Test Endpoint / Connection Check
app.post('/api/test-connection', async (req: Request, res: Response) => {
  const config: LLMConfig = req.body.config || req.body || {};
  try {
    if (config.provider === 'gemini') {
      const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ success: false, message: 'No Gemini API key detected in env or request.' });
      }
      const test = await callGemini(
        'Return JSON: {"status": "ok", "provider": "gemini"}',
        'Ping',
        config.model || 'gemini-3.8-flash',
        apiKey
      );
      return res.json({ success: true, message: `Connected to Gemini (${config.model || 'gemini-3.8-flash'})`, payload: JSON.parse(test.text) });
    } else if (config.provider === 'openai' || config.provider === 'custom' || config.provider === 'ollama') {
      const test = await callOpenAICompatible(
        'Return JSON: {"status": "ok"}',
        'Ping',
        config
      );
      return res.json({ success: true, message: `Connected to ${config.provider} (${config.model})`, payload: JSON.parse(test.text) });
    } else if (config.provider === 'anthropic') {
      const test = await callAnthropic(
        'Return JSON: {"status": "ok"}',
        'Ping',
        config
      );
      return res.json({ success: true, message: `Connected to Anthropic (${config.model})`, payload: JSON.parse(test.text) });
    }
    res.status(400).json({ success: false, message: `Unknown provider ${config.provider}` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Connection test failed.' });
  }
});

// Triage Pipeline Execution
app.post('/api/triage/single', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { email, config }: { email: { from: string; subject: string; body: string }; config?: LLMConfig } = req.body;

  if (!email || !email.body) {
    return res.status(400).json({ error: 'Missing email payload or body.' });
  }

  const activeConfig: LLMConfig = config || {
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    endpoint: 'https://generativelanguage.googleapis.com',
    apiKey: process.env.GEMINI_API_KEY || ''
  };

  const slate: BlackboardSlate = {
    raw_input: {
      from: email.from || 'unknown@domain.com',
      subject: email.subject || '(no subject)',
      body: email.body || ''
    }
  };

  const stepDurations: Record<string, number> = {};
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  try {
    // ---------------------------------------------
    // Agent 1: Sanitizer & Security Agent (Code Engine - 0 LLM Tokens)
    // ---------------------------------------------
    const t1 = Date.now();
    const sanitizerRes: SanitizerOutput = runCodeSanitizer(slate.raw_input);
    stepDurations['agent1_sanitizer'] = Date.now() - t1;
    slate.agent1_sanitizer = sanitizerRes;

    // ---------------------------------------------
    // Agent 2: Classifier Agent (Code Engine - 0 LLM Tokens)
    // ---------------------------------------------
    const t2 = Date.now();
    const classifierRes: ClassifierOutput = runCodeClassifier(slate.agent1_sanitizer);
    stepDurations['agent2_classifier'] = Date.now() - t2;
    slate.agent2_classifier = classifierRes;

    // ---------------------------------------------
    // Agent 3: Router & Action Agent
    // ---------------------------------------------
    const t3 = Date.now();
    const prompt3 = `TITLE: You are the Router & Action Agent for Centelli CommsIQ.
ROLE: Your role is to evaluate classification metadata on the Blackboard Slate and determine optimal queue placement, team assignment, priority tagging, and alert recommendations.
TASKS: Using the classification slate inputs, compute the operational routing decision:
Step 1. Destination Queue Assignment: Determine target queue (e.g., Sales_Gold_Queue, Support_Tier2_Escalation, Finance_AP, Human_Triage_Queue).
Step 2. Priority Tagging: Assign operational priority tag: URGENT, HIGH, NORMAL, or LOW.
Step 3. Notification Routing: Select real-time alert destination: SLACK_VIP_CHANNEL, TEAMS_LEAD_CHANNEL, or NONE.
Step 4. CRM / Helpdesk System Action: Specify required backend system updates: CREATE_LEAD, UPDATE_TICKET, LOG_ONLY, or SKIP.
Step 5. Decision Rationale: Provide a concise sentence explaining the routing logic applied.
CONSTRAINTS: Do not make external API calls or send emails directly. You strictly produce structured execution payload instructions for downstream system orchestrators.
OUTPUT FORMAT: Return a strict JSON object following this format:
{
  "target_queue": "string",
  "assigned_team": "string",
  "priority_tag": "URGENT",
  "notification_channel": "SLACK_VIP_CHANNEL",
  "crm_action": "CREATE_LEAD",
  "routing_reason": "string"
}
Valid priority_tag values: "URGENT", "HIGH", "NORMAL", "LOW".
Valid notification_channel values: "SLACK_VIP_CHANNEL", "TEAMS_LEAD_CHANNEL", "NONE".
Valid crm_action values: "CREATE_LEAD", "UPDATE_TICKET", "LOG_ONLY", "SKIP".

BLACKBOARD SLATE (Classifier Output):
${JSON.stringify(slate.agent2_classifier, null, 2)}`;

    let routerRes: RouterOutput;
    try {
      const res = await callAgent('You are the Router & Action Agent for Centelli CommsIQ.', prompt3, activeConfig);
      totalInputTokens += res.inputTokens;
      totalOutputTokens += res.outputTokens;
      routerRes = res.json as RouterOutput;
    } catch {
      routerRes = deterministicAnalyze(slate.raw_input).router;
    }
    stepDurations['agent3_router'] = Date.now() - t3;
    slate.agent3_router = routerRes;

    // ---------------------------------------------
    // Agent 4: Reply Drafter Agent
    // ---------------------------------------------
    const t4 = Date.now();
    const prompt4 = `TITLE: You are the Reply Drafter Agent for Centelli CommsIQ.
ROLE: Your role is to draft clear, professional, contextually appropriate response emails using classification metadata, sanitized bodies, and verified company policy guidelines.
TASKS: For emails flagged for automated response or pre-drafting, perform the following:
Step 1. Intent & Context Review: Inspect sanitized body text and extracted metadata (e.g., requested dates, account IDs).
Step 2. Draft Status Determination:
- AUTO_SEND_ELIGIBLE: Simple, unambiguous FAQs with confidence > 0.95 and neutral sentiment.
- READY_FOR_APPROVAL: Complex queries, high-value inquiries, or ambiguous requests requiring 1-click human sign-off.
- MANUAL_WRITE_REQUIRED: Escalated complaints, hostile communications, or security threats.
Step 3. Subject Line & Body Generation: Draft a professional response adhering to corporate tone. Use explicit placeholders like [Insert Date] or [Attach Invoice] for details requiring manual confirmation.
CONSTRAINTS: Do not make unverified commitments regarding pricing, legal terms, or policy exceptions outside provided company parameters. Maintain a polite, concise enterprise communication tone.
OUTPUT FORMAT: Return a strict JSON object following this format:
{
  "draft_status": "READY_FOR_APPROVAL",
  "subject_line": "string",
  "body_text": "string",
  "template_used": "string"
}
Valid draft_status values: "READY_FOR_APPROVAL", "AUTO_SEND_ELIGIBLE", "MANUAL_WRITE_REQUIRED".

BLACKBOARD SLATE INPUTS:
Sanitized Body: ${slate.agent1_sanitizer.sanitized_body}
Classification: ${JSON.stringify(slate.agent2_classifier, null, 2)}
Routing Plan: ${JSON.stringify(slate.agent3_router, null, 2)}`;

    let replyRes: ReplyDrafterOutput;
    try {
      const res = await callAgent('You are the Reply Drafter Agent for Centelli CommsIQ.', prompt4, activeConfig);
      totalInputTokens += res.inputTokens;
      totalOutputTokens += res.outputTokens;
      replyRes = res.json as ReplyDrafterOutput;
    } catch {
      replyRes = deterministicAnalyze(slate.raw_input).replyDrafter;
    }
    stepDurations['agent4_reply'] = Date.now() - t4;
    slate.agent4_reply = replyRes;

    // ---------------------------------------------
    // Agent 5: Token Telemetry & Business Advisory Agent
    // ---------------------------------------------
    const t5 = Date.now();
    const benchmarkCost = (totalInputTokens / 1000) * 0.0005 + (totalOutputTokens / 1000) * 0.0015;
    const isTelemetryEnabled = activeConfig.enableTelemetry !== false;

    let telemetryRes: TelemetryOutput;

    if (!isTelemetryEnabled) {
      // Telemetry Agent toggled OFF: Bypass LLM inference to save tokens and time
      stepDurations['agent5_telemetry'] = 0;
      telemetryRes = {
        telemetry_summary: {
          total_input_tokens: totalInputTokens,
          total_output_tokens: totalOutputTokens,
          total_pipeline_cost_usd: parseFloat(benchmarkCost.toFixed(6))
        },
        cost_optimization_recommendation: 'Telemetry Agent bypassed per user pipeline toggle (zero extra tokens consumed).',
        business_process_advisory: 'Telemetry Agent disabled. Core 4-agent triage was executed successfully.'
      };
    } else {
      const prompt5 = `TITLE: You are the Token Telemetry & Business Advisory Agent for Centelli CommsIQ.
ROLE: Your role is to analyze pipeline execution metrics, compute transaction token costs, track model performance, and generate executive optimization and process advisory recommendations.
TASKS: For each transaction state on the Blackboard Slate, execute the following evaluation:
Step 1. Token Usage Computation: Note that Agent 1 (Sanitizer) and Agent 2 (Classifier) execute deterministically in code (0 LLM tokens). Total LLM input/output tokens from Agents 3-4: (Input: ${totalInputTokens}, Output: ${totalOutputTokens}).
Step 2. Financial Cost Calculation: Compute total USD cost per transaction using benchmark enterprise API pricing ($0.0005 / 1k input tokens, $0.0015 / 1k output tokens). Baseline cost: $${benchmarkCost.toFixed(6)}.
Step 3. Optimization Advisory: Identify opportunities to further reduce LLM overhead (e.g., routing simple requests to deterministic rules, skipping LLM reply drafts for spam/quarantine).
Step 4. Strategic Business Impact: Assess workflow efficiency and recommend operational improvements (e.g., staffing re-allocation, SLA bottleneck fixes).
CONSTRAINTS: Focus exclusively on computational cost, system telemetry, and business process performance. Do not alter routing outcomes or draft text on the Blackboard Slate.
OUTPUT FORMAT: Return a strict JSON object following this format:
{
  "telemetry_summary": {
    "total_input_tokens": ${totalInputTokens},
    "total_output_tokens": ${totalOutputTokens},
    "total_pipeline_cost_usd": ${parseFloat(benchmarkCost.toFixed(6))}
  },
  "cost_optimization_recommendation": "string",
  "business_process_advisory": "string"
}

BLACKBOARD SLATE TRANSACTION SUMMARY:
Category: ${slate.agent2_classifier.category}
Urgency: ${slate.agent2_classifier.urgency}
Needs Human Review: ${slate.agent2_classifier.needs_human_review}
Assigned Queue: ${slate.agent3_router.target_queue}`;

      try {
        const res = await callAgent('You are the Token Telemetry & Business Advisory Agent.', prompt5, activeConfig);
        telemetryRes = res.json as TelemetryOutput;
      } catch {
        telemetryRes = deterministicAnalyze(slate.raw_input).telemetry;
        telemetryRes.telemetry_summary.total_input_tokens = totalInputTokens || telemetryRes.telemetry_summary.total_input_tokens;
        telemetryRes.telemetry_summary.total_output_tokens = totalOutputTokens || telemetryRes.telemetry_summary.total_output_tokens;
        telemetryRes.telemetry_summary.total_pipeline_cost_usd = parseFloat(benchmarkCost.toFixed(6)) || telemetryRes.telemetry_summary.total_pipeline_cost_usd;
      }
      stepDurations['agent5_telemetry'] = Date.now() - t5;
    }
    slate.agent5_telemetry = telemetryRes;

    const totalDuration = Date.now() - startTime;
    slate.execution_meta = {
      provider: activeConfig.provider,
      model: activeConfig.model,
      totalDurationMs: totalDuration,
      stepDurationsMs: stepDurations,
      executedAt: new Date().toISOString()
    };

    res.json({ success: true, slate });
  } catch (err: any) {
    console.error('Triage pipeline execution error:', err);
    res.status(500).json({ success: false, error: err.message || 'Pipeline execution failed.' });
  }
});

// Single Step Execution (for live blackboard interactive inspection)
app.post('/api/triage/step', async (req: Request, res: Response) => {
  const { stepId, slate, config }: { stepId: number; slate: BlackboardSlate; config?: LLMConfig } = req.body;
  if (!slate || !slate.raw_input) {
    return res.status(400).json({ error: 'Missing slate or raw_input.' });
  }

  const activeConfig: LLMConfig = config || {
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    endpoint: 'https://generativelanguage.googleapis.com',
    apiKey: process.env.GEMINI_API_KEY || ''
  };

  try {
    const fallback = deterministicAnalyze(slate.raw_input);
    let output: any = null;

    if (stepId === 1) {
      output = fallback.sanitizer;
      slate.agent1_sanitizer = output;
    } else if (stepId === 2) {
      output = fallback.classifier;
      slate.agent2_classifier = output;
    } else if (stepId === 3) {
      output = fallback.router;
      slate.agent3_router = output;
    } else if (stepId === 4) {
      output = fallback.replyDrafter;
      slate.agent4_reply = output;
    } else if (stepId === 5) {
      output = fallback.telemetry;
      slate.agent5_telemetry = output;
    } else {
      return res.status(400).json({ error: `Invalid stepId: ${stepId}` });
    }

    res.json({ success: true, stepId, output, slate });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// Frontend Serving & Dev Middleware
// ----------------------------------------------------
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Centelli CommsIQ] Server running on http://0.0.0.0:${PORT} in ${isProd ? 'production' : 'development'} mode.`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
