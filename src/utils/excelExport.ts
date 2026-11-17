import * as XLSX from 'xlsx';
import { TriageRunRecord } from '../types/triage';

/**
 * Exports historical triage runs to a formatted .xlsx workbook with multiple sheets
 * including dataset tracking and model comparisons per dataset.
 */
export function exportRunsToExcel(runs: TriageRunRecord[], filename = 'AI_Email_Triage_Runs.xlsx') {
  if (!runs || runs.length === 0) {
    alert('No run history available to export yet. Execute triage on an email first.');
    return;
  }

  // Sheet 1: Detailed Run History with Dataset and Telemetry status
  const detailRows = runs.map((r) => ({
    'Run ID': r.runId || '',
    'Timestamp': r.dateStr || '',
    'Dataset Name': r.datasetName || 'General Queue',
    'Provider': r.provider || '',
    'Model': r.model || '',
    'Telemetry Agent': r.telemetryEnabled !== false ? 'Active' : 'Bypassed',
    'Latency (ms)': r.durationMs || 0,
    'Sender (From)': r.from || '',
    'Subject': r.subject || '',
    'Security Safe?': r.isSafe ? 'YES' : 'NO',
    'Security Flag': r.securityFlag || 'NONE',
    'PII Scrubbed': r.piiRedacted ? 'YES' : 'NO',
    'Category': r.category || 'General',
    'Secondary Intent': r.intent || '',
    'Urgency (1-5)': r.urgency ?? 2,
    'Sentiment': r.sentiment || 'Neutral',
    'Confidence Score': `${((r.confidenceScore ?? 0.85) * 100).toFixed(1)}%`,
    'Needs Human Review': r.needsHumanReview ? 'YES' : 'NO',
    'Target Queue': r.targetQueue || 'General_Queue',
    'Priority Tag': r.priorityTag || 'NORMAL',
    'Notification Channel': r.notificationChannel || 'NONE',
    'CRM Action': r.crmAction || 'LOG_ONLY',
    'Routing Rationale': r.routingReason || '',
    'Reply Draft Status': r.draftStatus || 'READY_FOR_APPROVAL',
    'Draft Template': r.templateUsed || '',
    'Input Tokens': r.inputTokens || 0,
    'Output Tokens': r.outputTokens || 0,
    'Total Tokens': r.totalTokens || 0,
    'Calculated Cost ($USD)': Number((r.provider === 'custom' ? 0 : (r.costUSD ?? 0)).toFixed(5)),
    'Account ID': r.extractedMetadata?.account_id || '',
    'Requested Dates': r.extractedMetadata?.requested_dates || '',
    'Party Size': r.extractedMetadata?.party_size || '',
    'Estimated Value': r.extractedMetadata?.estimated_value || '',
    'Draft Subject Line': r.draftSubject || '',
    'Suggested Response Body': r.draftBody || '',
    'Cost Optimization Tip': r.costTip || '',
    'Business Process Advisory': r.businessAdvisory || ''
  }));

  // Sheet 2: Model Benchmark Summary Aggregation
  const modelStats: Record<
    string,
    {
      runs: number;
      totalDuration: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalTokens: number;
      totalCost: number;
      threats: number;
      humanReviews: number;
      highConfidence: number;
    }
  > = {};

  // Sheet 3: Dataset x Model Benchmark Aggregation
  const datasetModelStats: Record<
    string,
    {
      datasetName: string;
      modelKey: string;
      runs: number;
      totalDuration: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalTokens: number;
      totalCost: number;
      threats: number;
      humanReviews: number;
      highConfidence: number;
    }
  > = {};

  runs.forEach((r) => {
    const modelKey = `${r.provider} - ${r.model}`;
    const dataset = r.datasetName || 'General Queue';
    const comboKey = `${dataset} __ ${modelKey}`;

    // Overall model stats
    if (!modelStats[modelKey]) {
      modelStats[modelKey] = {
        runs: 0,
        totalDuration: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        threats: 0,
        humanReviews: 0,
        highConfidence: 0
      };
    }
    const ms = modelStats[modelKey];
    ms.runs += 1;
    ms.totalDuration += r.durationMs || 0;
    ms.totalInputTokens += r.inputTokens || 0;
    ms.totalOutputTokens += r.outputTokens || 0;
    ms.totalTokens += r.totalTokens || 0;
    ms.totalCost += r.provider === 'custom' ? 0 : (r.costUSD || 0);
    if (!r.isSafe) ms.threats += 1;
    if (r.needsHumanReview) ms.humanReviews += 1;
    if ((r.confidenceScore ?? 0) >= 0.85) ms.highConfidence += 1;

    // Dataset x Model stats
    if (!datasetModelStats[comboKey]) {
      datasetModelStats[comboKey] = {
        datasetName: dataset,
        modelKey,
        runs: 0,
        totalDuration: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        threats: 0,
        humanReviews: 0,
        highConfidence: 0
      };
    }
    const dms = datasetModelStats[comboKey];
    dms.runs += 1;
    dms.totalDuration += r.durationMs || 0;
    dms.totalInputTokens += r.inputTokens || 0;
    dms.totalOutputTokens += r.outputTokens || 0;
    dms.totalTokens += r.totalTokens || 0;
    dms.totalCost += r.provider === 'custom' ? 0 : (r.costUSD || 0);
    if (!r.isSafe) dms.threats += 1;
    if (r.needsHumanReview) dms.humanReviews += 1;
    if ((r.confidenceScore ?? 0) >= 0.85) dms.highConfidence += 1;
  });

  const summaryRows = Object.entries(modelStats).map(([modelKey, s]) => ({
    'Model & Provider': modelKey,
    'Total Test Runs': s.runs,
    'Avg Latency (s)': (s.totalDuration / s.runs / 1000).toFixed(2) + 's',
    'Total Input Tokens': s.totalInputTokens,
    'Total Output Tokens': s.totalOutputTokens,
    'Total Tokens Used': s.totalTokens,
    'Avg Tokens / Run': Math.round(s.totalTokens / s.runs),
    'Cumulative Cost ($USD)': Number(s.totalCost.toFixed(5)),
    'Est. Cost / 1k Emails ($)': Number(((s.totalCost / s.runs) * 1000).toFixed(3)),
    'High Confidence Rate (%)': Math.round((s.highConfidence / s.runs) * 100) + '%',
    'Human Review Rate (%)': Math.round((s.humanReviews / s.runs) * 100) + '%',
    'Security Threats Flagged': s.threats
  }));

  const datasetRows = Object.values(datasetModelStats).map((s) => ({
    'Dataset Name': s.datasetName,
    'Model & Provider': s.modelKey,
    'Emails Processed': s.runs,
    'Avg Latency (s)': (s.totalDuration / s.runs / 1000).toFixed(2) + 's',
    'Total Tokens': s.totalTokens,
    'Avg Tokens / Email': Math.round(s.totalTokens / s.runs),
    'Total Cost ($USD)': Number(s.totalCost.toFixed(5)),
    'Est. Cost / 1k ($)': Number(((s.totalCost / s.runs) * 1000).toFixed(3)),
    'High Confidence Rate (%)': Math.round((s.highConfidence / s.runs) * 100) + '%',
    'Human Review Rate (%)': Math.round((s.humanReviews / s.runs) * 100) + '%',
    'Security Threats': s.threats
  }));

  const wb = XLSX.utils.book_new();

  // Create worksheets
  const wsDetail = XLSX.utils.json_to_sheet(detailRows);
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  const wsDataset = XLSX.utils.json_to_sheet(datasetRows);

  // Set column widths for readability
  wsDetail['!cols'] = [
    { wch: 12 }, // Run ID
    { wch: 20 }, // Timestamp
    { wch: 22 }, // Dataset Name
    { wch: 14 }, // Provider
    { wch: 22 }, // Model
    { wch: 16 }, // Telemetry Agent
    { wch: 12 }, // Latency
    { wch: 24 }, // Sender
    { wch: 30 }, // Subject
    { wch: 14 }, // Safe?
    { wch: 18 }, // Security Flag
    { wch: 14 }, // PII Scrubbed
    { wch: 22 }, // Category
    { wch: 24 }, // Intent
    { wch: 12 }, // Urgency
    { wch: 12 }, // Sentiment
    { wch: 16 }, // Confidence
    { wch: 18 }, // Human Review
    { wch: 24 }, // Queue
    { wch: 14 }, // Priority
    { wch: 22 }, // Notification Channel
    { wch: 14 }, // CRM Action
    { wch: 40 }, // Rationale
    { wch: 22 }, // Draft Status
    { wch: 28 }, // Draft Template
    { wch: 12 }, // Input Tokens
    { wch: 12 }, // Output Tokens
    { wch: 12 }, // Total Tokens
    { wch: 16 }, // Cost
    { wch: 16 }, // Acct ID
    { wch: 16 }, // Dates
    { wch: 14 }, // Party Size
    { wch: 14 }, // Value
    { wch: 32 }, // Draft Subject
    { wch: 50 }, // Draft Body
    { wch: 40 }, // Cost Tip
    { wch: 40 }  // Advisory
  ];

  wsSummary['!cols'] = [
    { wch: 28 }, // Model & Provider
    { wch: 16 }, // Runs
    { wch: 16 }, // Avg Latency
    { wch: 18 }, // Input Tokens
    { wch: 18 }, // Output Tokens
    { wch: 18 }, // Total Tokens
    { wch: 18 }, // Avg Tokens / Run
    { wch: 22 }, // Cumulative Cost
    { wch: 24 }, // Est Cost / 1k
    { wch: 22 }, // High Conf Rate
    { wch: 20 }, // Human Review
    { wch: 22 }  // Security Threats
  ];

  wsDataset['!cols'] = [
    { wch: 26 }, // Dataset Name
    { wch: 28 }, // Model & Provider
    { wch: 16 }, // Emails Processed
    { wch: 16 }, // Avg Latency
    { wch: 16 }, // Total Tokens
    { wch: 18 }, // Avg Tokens / Email
    { wch: 18 }, // Total Cost
    { wch: 18 }, // Est. Cost / 1k
    { wch: 22 }, // High Conf Rate
    { wch: 20 }, // Human Review
    { wch: 18 }  // Security Threats
  ];

  XLSX.utils.book_append_sheet(wb, wsDetail, 'Triage_Run_History');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Model_Benchmark_Summary');
  XLSX.utils.book_append_sheet(wb, wsDataset, 'Dataset_By_Model_Benchmark');

  // Trigger browser download
  XLSX.writeFile(wb, filename);
}
