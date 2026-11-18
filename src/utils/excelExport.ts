import * as XLSX from 'xlsx';
import { TriageRunRecord, ScoringWeights, AcceptanceThresholds } from '../types/triage';
import {
  DEFAULT_SCORING_WEIGHTS,
  DEFAULT_ACCEPTANCE_THRESHOLDS,
  calculateModelCostUSD
} from '../constants/agents';
import { computeModelScorecards, computeWorkloadBreakdown } from './evaluation';

/**
 * Exports full auditable triage runs, multi-model comparison scorecard (with 100k/1M annual projections),
 * complexity/workload breakdowns, failure mode analysis, and locked weights to a 5-sheet .xlsx workbook.
 */
export function exportRunsToExcel(
  runs: TriageRunRecord[],
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
  thresholds: AcceptanceThresholds = DEFAULT_ACCEPTANCE_THRESHOLDS,
  filename = 'KSU_Capstone_Email_Triage_Evaluation.xlsx'
) {
  if (!runs || runs.length === 0) {
    return;
  }

  // Sheet 1: Auditable Run Log (one row per run with settings, ground truth, score & failure type)
  const detailRows = runs.map((r) => {
    const cost = calculateModelCostUSD(r.provider, r.model, r.inputTokens || 0, r.outputTokens || 0);
    return {
      'Run ID': r.runId || '',
      'Batch ID': r.batchId || '',
      'Repeat #': r.repeatIndex ?? 1,
      'Timestamp': r.dateStr || '',
      'Dataset Name': r.datasetName || 'General Queue',
      'Split': r.groundTruth?.split || '',
      'Complexity': r.groundTruth?.complexity || '',
      'Length Group': r.groundTruth?.length_group || '',
      'Ambiguity': r.groundTruth?.ambiguity || '',
      'Provider': r.provider || '',
      'Model': r.model || '',
      'Access Method': r.accessMethod || 'Cloud API',
      'Classifier Mode': r.classifierMode || 'llm',
      'Temperature': r.temperature ?? 0,
      'Telemetry Agent': r.telemetryEnabled ? 'Active' : 'Bypassed',
      'Format Compliant?': r.formatCompliant !== false ? 'YES' : 'NO',
      'Failure Type': r.failureType || 'NONE',
      'Failure Detail': r.failureDetail || '',
      'Used Fallback?': r.usedFallback ? 'YES' : 'NO',
      'Latency (ms)': r.durationMs || 0,
      'Sender (From)': r.from || '',
      'Subject': r.subject || '',
      'Expected Category': r.groundTruth?.expected_category || '',
      'Predicted Category': r.category || '',
      'Category Match?':
        r.evaluation?.categoryCorrect === null || r.evaluation?.categoryCorrect === undefined
          ? 'N/A'
          : r.evaluation.categoryCorrect
          ? 'PASS'
          : 'FAIL',
      'Expected Queue': r.groundTruth?.expected_queue || '',
      'Predicted Queue': r.targetQueue || '',
      'Queue Match?':
        r.evaluation?.queueCorrect === null || r.evaluation?.queueCorrect === undefined
          ? 'N/A'
          : r.evaluation.queueCorrect
          ? 'PASS'
          : 'FAIL',
      'Expected Human Review':
        r.groundTruth?.expected_human_review === undefined
          ? ''
          : r.groundTruth.expected_human_review
          ? 'YES'
          : 'NO',
      'Predicted Human Review': r.needsHumanReview ? 'YES' : 'NO',
      'Do Not Decide Case?': r.groundTruth?.is_do_not_decide ? 'YES' : 'NO',
      'Do Not Decide Pass?':
        r.evaluation?.doNotDecideCorrect === null || r.evaluation?.doNotDecideCorrect === undefined
          ? 'N/A'
          : r.evaluation.doNotDecideCorrect
          ? 'PASS'
          : 'FAIL',
      'Eval Error Type': r.evaluation?.errorType || 'NONE',
      'Item Score (0-100)': r.evaluation?.overallScore ?? '',
      'Secondary Intent': r.intent || '',
      'Urgency (1-5)': r.urgency ?? 2,
      'Sentiment': r.sentiment || 'Neutral',
      'Confidence Score': `${((r.confidenceScore ?? 0.85) * 100).toFixed(1)}%`,
      'Security Safe?': r.isSafe ? 'YES' : 'NO',
      'Security Flag': r.securityFlag || 'NONE',
      'PII Scrubbed': r.piiRedacted ? 'YES' : 'NO',
      'Priority Tag': r.priorityTag || 'NORMAL',
      'CRM Action': r.crmAction || 'LOG_ONLY',
      'Input Tokens': r.inputTokens || 0,
      'Output Tokens': r.outputTokens || 0,
      'Total Tokens': r.totalTokens || 0,
      'Calculated Cost ($USD)': Number(cost.toFixed(6)),
      'Account ID': r.extractedMetadata?.account_id || '',
      'Requested Dates': r.extractedMetadata?.requested_dates || '',
      'Party Size': r.extractedMetadata?.party_size || '',
      'Estimated Value': r.extractedMetadata?.estimated_value || '',
      'Routing Rationale': r.routingReason || '',
      'Draft Status': r.draftStatus || 'READY_FOR_APPROVAL'
    };
  });

  // Sheet 2: Comparison Scorecard (includes 3x Consistency, Accuracy, Economics @ 100k & 1M/yr)
  const scorecards = computeModelScorecards(runs, weights, thresholds);
  const scorecardRows = scorecards.map((c) => ({
    'Model Engine': `${c.provider} - ${c.model}`,
    'Access Method': c.accessMethod,
    'Weighted Score (0-100)': c.weightedScore,
    'Meets Thresholds?': c.passesThresholds ? 'PASS' : `FAIL (${c.failedThresholds.join('; ')})`,
    'Total Runs': c.totalRuns,
    'Evaluated (w/ Ground Truth)': c.evaluatedRuns,
    'Category Accuracy (%)': c.categoryAccuracyPct ?? 'N/A',
    'Queue Accuracy (%)': c.queueAccuracyPct ?? 'N/A',
    'Whole-Record Accuracy (%)': c.wholeRecordAccuracyPct ?? 'N/A',
    'Do-Not-Decide Accuracy (%)': c.doNotDecideAccuracyPct ?? 'N/A',
    '3-Run Consistency (%)': c.repeatConsistencyPct ?? 'N/A',
    'Format Compliance (%)': c.formatCompliancePct,
    'False Negative Escalations': c.falseNegativeEscalations,
    'False Positive Escalations': c.falsePositiveEscalations,
    'FN Rate (%)': c.falseNegativeRatePct ?? 'N/A',
    'Human Review Rate (%)': c.humanReviewRatePct,
    'Avg Latency (ms)': c.avgLatencyMs,
    'Avg Tokens / Tx': c.avgTokensPerTx,
    'Est. Cost / 1k Tx ($)': c.costPer1kTxUSD,
    'Projected Annual Cost @ 100k ($)': c.projectedAnnual100kUSD,
    'Projected Annual Cost @ 1M ($)': c.projectedAnnual1MUSD
  }));

  // Sheet 3: Dataset Workload & Complexity Breakdown
  const workload = computeWorkloadBreakdown(runs);
  const workloadRows = workload.map((w) => ({
    Dimension: w.dimension,
    Group: w.group,
    Model: w.modelKey,
    Runs: w.runs,
    'Category Accuracy (%)': w.accuracyPct ?? 'N/A',
    'Avg Latency (ms)': w.avgLatencyMs,
    'Human Review Rate (%)': w.humanReviewPct
  }));

  // Sheet 4: Failure Mode Analysis
  const failureRows = scorecards.map((c) => ({
    'Model Engine': `${c.provider} - ${c.model}`,
    'Total Runs': c.totalRuns,
    'Clean / No Error': c.errorBreakdown.NONE,
    'Misrouted Category': c.errorBreakdown.MISROUTED_CATEGORY,
    'Misrouted Queue': c.errorBreakdown.MISROUTED_QUEUE,
    'False Negative Escalation (Missed Risk)': c.errorBreakdown.FALSE_NEGATIVE_ESCALATION,
    'False Positive Escalation (Extra Review)': c.errorBreakdown.FALSE_POSITIVE_ESCALATION,
    'Do-Not-Decide Failures': c.errorBreakdown.DO_NOT_DECIDE_FAILURE,
    'JSON / Schema Format Failures': c.errorBreakdown.FORMAT_FAILURE,
    'API / Timeout Failures': c.errorBreakdown.API_FAILURE
  }));

  // Sheet 5: Predefined Weights & Acceptance Criteria
  const weightsRows = [
    { Parameter: 'Weights Locked?', Value: weights.locked ? `YES (${weights.lockedAt || 'Locked'})` : 'NO (Draft)' },
    { Parameter: 'Weight: Category/Routing Accuracy', Value: `${weights.accuracy}%` },
    { Parameter: 'Weight: 3-Run Repeat Consistency', Value: `${weights.consistency}%` },
    { Parameter: 'Weight: Do-Not-Decide / Refusal Accuracy', Value: `${weights.doNotDecide}%` },
    { Parameter: 'Weight: Strict JSON Format Compliance', Value: `${weights.formatCompliance}%` },
    { Parameter: 'Weight: Cost Efficiency', Value: `${weights.costEfficiency}%` },
    { Parameter: 'Weight: Response Latency', Value: `${weights.latency}%` },
    { Parameter: 'Threshold: Min Category Accuracy', Value: `${thresholds.minCategoryAccuracyPct}%` },
    { Parameter: 'Threshold: Min 3-Run Consistency', Value: `${thresholds.minConsistencyPct}%` },
    { Parameter: 'Threshold: Min Format Compliance', Value: `${thresholds.minFormatCompliancePct}%` },
    { Parameter: 'Threshold: Max False Negative Escalation Rate', Value: `${thresholds.maxFalseNegativeRatePct}%` },
    { Parameter: 'Threshold: Max Avg Latency', Value: `${thresholds.maxLatencyMs} ms` }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'Auditable_Run_Log');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scorecardRows), 'Comparison_Scorecard');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(workloadRows.length > 0 ? workloadRows : [{ Info: 'Upload labeled dataset with Complexity/Ambiguity columns to populate.' }]),
    'Workload_Breakdown'
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(failureRows), 'Failure_Analysis');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weightsRows), 'Weights_And_Thresholds');

  XLSX.writeFile(wb, filename);
}
