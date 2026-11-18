import {
  BlackboardSlate,
  EmailGroundTruth,
  EvalErrorType,
  RunEvaluationResult,
  TriageRunRecord,
  ScoringWeights,
  AcceptanceThresholds
} from '../types/triage';
import { calculateModelCostUSD } from '../constants/agents';

function normalizeStr(s?: string | null): string {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function categoriesMatch(predicted?: string, expected?: string): boolean {
  if (!expected) return true;
  const p = normalizeStr(predicted);
  const e = normalizeStr(expected);
  if (p === e) return true;
  // Reasonable synonym matching for common labels
  if (e.includes('insufficient') || e.includes('unroutable') || e.includes('do not decide')) {
    return p.includes('insufficient') || p.includes('unroutable');
  }
  if (e.includes('sales')) return p.includes('sales');
  if (e.includes('customer') || e.includes('support')) return p.includes('customer') || p.includes('support');
  if (e.includes('admin') || e.includes('ops') || e.includes('finance')) return p.includes('admin') || p.includes('operations');
  if (e.includes('junk') || e.includes('spam')) return p.includes('junk') || p.includes('low priority');
  return false;
}

function queuesMatch(predicted?: string, expected?: string): boolean {
  if (!expected) return true;
  const p = normalizeStr(predicted);
  const e = normalizeStr(expected);
  return p === e || p.includes(e) || e.includes(p);
}

function metadataFieldMatches(predicted?: string | null, expected?: string | null): boolean {
  if (expected === undefined) return true;
  const expEmpty = expected === null || expected === '';
  const predEmpty = predicted === null || predicted === undefined || predicted === '';
  if (expEmpty && predEmpty) return true;
  if (expEmpty || predEmpty) return false;
  const p = normalizeStr(predicted);
  const e = normalizeStr(expected);
  return p === e || p.includes(e) || e.includes(p);
}

/**
 * Evaluates a single Blackboard Slate output against frozen Ground Truth reference labels.
 */
export function evaluateSlateAgainstGroundTruth(
  slate: BlackboardSlate,
  groundTruth?: EmailGroundTruth
): RunEvaluationResult {
  const meta = slate.execution_meta;
  const failureType = meta?.failureType || 'NONE';

  if (!groundTruth) {
    return {
      hasGroundTruth: false,
      categoryCorrect: null,
      queueCorrect: null,
      urgencyExact: null,
      urgencyWithin1: null,
      humanReviewCorrect: null,
      doNotDecideCorrect: null,
      metadataFieldsCorrect: 0,
      metadataFieldsTotal: 0,
      wholeRecordCorrect: null,
      errorType:
        failureType === 'FORMAT_ERROR' || failureType === 'SCHEMA_ERROR'
          ? 'FORMAT_FAILURE'
          : failureType !== 'NONE'
          ? 'API_FAILURE'
          : 'NONE',
      overallScore: null
    };
  }

  // If the model failed format/API execution without valid output
  if (failureType !== 'NONE' && !meta?.usedFallback) {
    return {
      hasGroundTruth: true,
      categoryCorrect: false,
      queueCorrect: false,
      urgencyExact: false,
      urgencyWithin1: false,
      humanReviewCorrect: false,
      doNotDecideCorrect: groundTruth.is_do_not_decide ? false : null,
      metadataFieldsCorrect: 0,
      metadataFieldsTotal: 4,
      wholeRecordCorrect: false,
      errorType:
        failureType === 'FORMAT_ERROR' || failureType === 'SCHEMA_ERROR'
          ? 'FORMAT_FAILURE'
          : 'API_FAILURE',
      overallScore: 0
    };
  }

  const clf = slate.agent2_classifier;
  const rtr = slate.agent3_router;

  const categoryCorrect = groundTruth.expected_category
    ? categoriesMatch(clf?.category, groundTruth.expected_category)
    : null;

  const queueCorrect = groundTruth.expected_queue
    ? queuesMatch(rtr?.target_queue, groundTruth.expected_queue)
    : null;

  const urgencyExact =
    groundTruth.expected_urgency !== undefined && clf?.urgency !== undefined
      ? clf.urgency === groundTruth.expected_urgency
      : null;

  const urgencyWithin1 =
    groundTruth.expected_urgency !== undefined && clf?.urgency !== undefined
      ? Math.abs(clf.urgency - groundTruth.expected_urgency) <= 1
      : null;

  const humanReviewCorrect =
    groundTruth.expected_human_review !== undefined && clf?.needs_human_review !== undefined
      ? Boolean(clf.needs_human_review) === Boolean(groundTruth.expected_human_review)
      : null;

  // "Do not decide" / refusal / insufficient-info check:
  // Model passes if it classifies as Insufficient Info / Unroutable OR routes to Human_Triage_Queue / flags needs_human_review
  let doNotDecideCorrect: boolean | null = null;
  if (groundTruth.is_do_not_decide) {
    const pickedUnroutable = normalizeStr(clf?.category).includes('insufficient') || normalizeStr(clf?.category).includes('unroutable');
    const flaggedHuman = Boolean(clf?.needs_human_review);
    const routedHuman = normalizeStr(rtr?.target_queue).includes('human');
    doNotDecideCorrect = pickedUnroutable || (flaggedHuman && routedHuman);
  }

  // Field-level metadata evaluation (only for fields specified in groundTruth)
  let metadataFieldsTotal = 0;
  let metadataFieldsCorrect = 0;
  const ext = clf?.extracted_metadata;
  const checks: Array<[string | null | undefined, string | null | undefined]> = [
    [ext?.account_id, groundTruth.expected_account_id],
    [ext?.requested_dates, groundTruth.expected_dates],
    [ext?.party_size, groundTruth.expected_party_size],
    [ext?.estimated_value, groundTruth.expected_value]
  ];
  checks.forEach(([pred, exp]) => {
    if (exp !== undefined) {
      metadataFieldsTotal++;
      if (metadataFieldMatches(pred, exp)) metadataFieldsCorrect++;
    }
  });

  // Determine error classification (separating False Positives vs False Negatives!)
  let errorType: EvalErrorType = 'NONE';
  if (failureType === 'FORMAT_ERROR' || failureType === 'SCHEMA_ERROR') {
    errorType = 'FORMAT_FAILURE';
  } else if (failureType !== 'NONE') {
    errorType = 'API_FAILURE';
  } else if (doNotDecideCorrect === false) {
    errorType = 'DO_NOT_DECIDE_FAILURE';
  } else if (categoryCorrect === false) {
    errorType = 'MISROUTED_CATEGORY';
  } else if (queueCorrect === false) {
    errorType = 'MISROUTED_QUEUE';
  } else if (humanReviewCorrect === false) {
    errorType = clf?.needs_human_review
      ? 'FALSE_POSITIVE_ESCALATION'
      : 'FALSE_NEGATIVE_ESCALATION';
  }

  // Compute composite 0-100 item score across populated criteria
  const points: number[] = [];
  if (categoryCorrect !== null) points.push(categoryCorrect ? 100 : 0);
  if (queueCorrect !== null) points.push(queueCorrect ? 100 : 0);
  if (urgencyWithin1 !== null) points.push(urgencyExact ? 100 : urgencyWithin1 ? 65 : 0);
  if (humanReviewCorrect !== null) points.push(humanReviewCorrect ? 100 : 0);
  if (doNotDecideCorrect !== null) points.push(doNotDecideCorrect ? 100 : 0);
  if (metadataFieldsTotal > 0) points.push((metadataFieldsCorrect / metadataFieldsTotal) * 100);

  const overallScore =
    points.length > 0 ? Math.round(points.reduce((a, b) => a + b, 0) / points.length) : null;

  const wholeRecordCorrect =
    (categoryCorrect === null || categoryCorrect) &&
    (queueCorrect === null || queueCorrect) &&
    (humanReviewCorrect === null || humanReviewCorrect) &&
    (doNotDecideCorrect === null || doNotDecideCorrect) &&
    (metadataFieldsTotal === 0 || metadataFieldsCorrect === metadataFieldsTotal);

  return {
    hasGroundTruth: true,
    categoryCorrect,
    queueCorrect,
    urgencyExact,
    urgencyWithin1,
    humanReviewCorrect,
    doNotDecideCorrect,
    metadataFieldsCorrect,
    metadataFieldsTotal,
    wholeRecordCorrect,
    errorType,
    overallScore
  };
}

export interface ModelScorecard {
  modelKey: string;
  provider: string;
  model: string;
  accessMethod: string;
  totalRuns: number;
  evaluatedRuns: number;
  categoryAccuracyPct: number | null;
  queueAccuracyPct: number | null;
  wholeRecordAccuracyPct: number | null;
  doNotDecideAccuracyPct: number | null;
  formatCompliancePct: number;
  repeatConsistencyPct: number | null; // % of items with >=2 runs where category+queue+review agreed 100%
  repeatGroupsCount: number;
  falsePositiveEscalations: number;
  falseNegativeEscalations: number;
  falseNegativeRatePct: number | null;
  humanReviewRatePct: number;
  avgLatencyMs: number;
  avgTokensPerTx: number;
  costPer1kTxUSD: number;
  projectedAnnual100kUSD: number;
  projectedAnnual1MUSD: number;
  weightedScore: number; // 0-100 using ScoringWeights
  passesThresholds: boolean;
  failedThresholds: string[];
  errorBreakdown: Record<EvalErrorType, number>;
}

export function computeModelScorecards(
  runs: TriageRunRecord[],
  weights: ScoringWeights,
  thresholds: AcceptanceThresholds
): ModelScorecard[] {
  const byModel: Record<string, TriageRunRecord[]> = {};

  runs.forEach((r) => {
    const key = `${r.provider} :: ${r.model}`;
    if (!byModel[key]) byModel[key] = [];
    byModel[key].push(r);
  });

  const rawCards = Object.entries(byModel).map(([modelKey, list]) => {
    const first = list[0];
    const totalRuns = list.length;

    let catTotal = 0;
    let catOk = 0;
    let qTotal = 0;
    let qOk = 0;
    let wholeTotal = 0;
    let wholeOk = 0;
    let dndTotal = 0;
    let dndOk = 0;
    let formatOk = 0;
    let humanReviewCount = 0;
    let fpEscalations = 0;
    let fnEscalations = 0;
    let shouldEscalateTotal = 0;
    let totalDuration = 0;
    let totalTokens = 0;
    let totalCost = 0;

    const errorBreakdown: Record<EvalErrorType, number> = {
      NONE: 0,
      MISROUTED_CATEGORY: 0,
      MISROUTED_QUEUE: 0,
      FALSE_POSITIVE_ESCALATION: 0,
      FALSE_NEGATIVE_ESCALATION: 0,
      DO_NOT_DECIDE_FAILURE: 0,
      FORMAT_FAILURE: 0,
      API_FAILURE: 0
    };

    // Group by email identity (emailId or subject+from) for repeat consistency check
    const repeatBuckets: Record<string, TriageRunRecord[]> = {};

    list.forEach((r) => {
      if (r.formatCompliant !== false && r.failureType === 'NONE') formatOk++;
      if (r.needsHumanReview) humanReviewCount++;
      totalDuration += r.durationMs || 0;
      totalTokens += r.totalTokens || 0;
      totalCost += calculateModelCostUSD(r.provider, r.model, r.inputTokens || 0, r.outputTokens || 0);

      const ev = r.evaluation;
      if (ev?.hasGroundTruth) {
        if (ev.categoryCorrect !== null) {
          catTotal++;
          if (ev.categoryCorrect) catOk++;
        }
        if (ev.queueCorrect !== null) {
          qTotal++;
          if (ev.queueCorrect) qOk++;
        }
        if (ev.wholeRecordCorrect !== null) {
          wholeTotal++;
          if (ev.wholeRecordCorrect) wholeOk++;
        }
        if (ev.doNotDecideCorrect !== null) {
          dndTotal++;
          if (ev.doNotDecideCorrect) dndOk++;
        }
        if (r.groundTruth?.expected_human_review === true) {
          shouldEscalateTotal++;
          if (!r.needsHumanReview) fnEscalations++;
        }
        if (r.groundTruth?.expected_human_review === false && r.needsHumanReview) {
          fpEscalations++;
        }
        errorBreakdown[ev.errorType] = (errorBreakdown[ev.errorType] || 0) + 1;
      } else {
        const errT: EvalErrorType =
          r.failureType === 'FORMAT_ERROR' || r.failureType === 'SCHEMA_ERROR'
            ? 'FORMAT_FAILURE'
            : r.failureType !== 'NONE'
            ? 'API_FAILURE'
            : 'NONE';
        errorBreakdown[errT]++;
      }

      const itemKey = `${r.datasetName || ''}::${r.subject}::${r.from}`;
      if (!repeatBuckets[itemKey]) repeatBuckets[itemKey] = [];
      repeatBuckets[itemKey].push(r);
    });

    // Compute multi-run consistency (% of items tested >=2 times where all runs gave identical category+queue+review)
    let repeatGroupsCount = 0;
    let consistentGroups = 0;
    Object.values(repeatBuckets).forEach((group) => {
      if (group.length >= 2) {
        repeatGroupsCount++;
        const sigs = new Set(
          group.map((g) => `${g.category}|${g.targetQueue}|${g.needsHumanReview ? '1' : '0'}|${g.failureType}`)
        );
        if (sigs.size === 1) consistentGroups++;
      }
    });

    const categoryAccuracyPct = catTotal > 0 ? Math.round((catOk / catTotal) * 1000) / 10 : null;
    const queueAccuracyPct = qTotal > 0 ? Math.round((qOk / qTotal) * 1000) / 10 : null;
    const wholeRecordAccuracyPct = wholeTotal > 0 ? Math.round((wholeOk / wholeTotal) * 1000) / 10 : null;
    const doNotDecideAccuracyPct = dndTotal > 0 ? Math.round((dndOk / dndTotal) * 1000) / 10 : null;
    const formatCompliancePct = totalRuns > 0 ? Math.round((formatOk / totalRuns) * 1000) / 10 : 100;
    const repeatConsistencyPct =
      repeatGroupsCount > 0 ? Math.round((consistentGroups / repeatGroupsCount) * 1000) / 10 : null;
    const falseNegativeRatePct =
      shouldEscalateTotal > 0 ? Math.round((fnEscalations / shouldEscalateTotal) * 1000) / 10 : null;

    const avgLatencyMs = totalRuns > 0 ? Math.round(totalDuration / totalRuns) : 0;
    const avgTokensPerTx = totalRuns > 0 ? Math.round(totalTokens / totalRuns) : 0;
    const avgCostPerTx = totalRuns > 0 ? totalCost / totalRuns : 0;
    const costPer1kTxUSD = Number((avgCostPerTx * 1000).toFixed(4));
    const projectedAnnual100kUSD = Number((avgCostPerTx * 100000).toFixed(2));
    const projectedAnnual1MUSD = Number((avgCostPerTx * 1000000).toFixed(2));

    // Check minimum acceptance thresholds
    const failedThresholds: string[] = [];
    if (categoryAccuracyPct !== null && categoryAccuracyPct < thresholds.minCategoryAccuracyPct) {
      failedThresholds.push(`Accuracy ${categoryAccuracyPct}% < ${thresholds.minCategoryAccuracyPct}%`);
    }
    if (repeatConsistencyPct !== null && repeatConsistencyPct < thresholds.minConsistencyPct) {
      failedThresholds.push(`3x Consistency ${repeatConsistencyPct}% < ${thresholds.minConsistencyPct}%`);
    }
    if (formatCompliancePct < thresholds.minFormatCompliancePct) {
      failedThresholds.push(`Format ${formatCompliancePct}% < ${thresholds.minFormatCompliancePct}%`);
    }
    if (falseNegativeRatePct !== null && falseNegativeRatePct > thresholds.maxFalseNegativeRatePct) {
      failedThresholds.push(`FN Escalation ${falseNegativeRatePct}% > ${thresholds.maxFalseNegativeRatePct}%`);
    }
    if (avgLatencyMs > thresholds.maxLatencyMs) {
      failedThresholds.push(`Latency ${(avgLatencyMs / 1000).toFixed(2)}s > ${(thresholds.maxLatencyMs / 1000).toFixed(1)}s`);
    }

    return {
      modelKey,
      provider: first.provider,
      model: first.model,
      accessMethod: first.accessMethod || 'Cloud API',
      totalRuns,
      evaluatedRuns: Math.max(catTotal, qTotal, wholeTotal),
      categoryAccuracyPct,
      queueAccuracyPct,
      wholeRecordAccuracyPct,
      doNotDecideAccuracyPct,
      formatCompliancePct,
      repeatConsistencyPct,
      repeatGroupsCount,
      falsePositiveEscalations: fpEscalations,
      falseNegativeEscalations: fnEscalations,
      falseNegativeRatePct,
      humanReviewRatePct: totalRuns > 0 ? Math.round((humanReviewCount / totalRuns) * 1000) / 10 : 0,
      avgLatencyMs,
      avgTokensPerTx,
      costPer1kTxUSD,
      projectedAnnual100kUSD,
      projectedAnnual1MUSD,
      weightedScore: 0,
      passesThresholds: failedThresholds.length === 0,
      failedThresholds,
      errorBreakdown
    };
  });

  // Normalize Cost Efficiency & Latency across tested models, then compute weighted score
  const maxCost1k = Math.max(...rawCards.map((c) => c.costPer1kTxUSD), 0.0001);
  const maxLatency = Math.max(...rawCards.map((c) => c.avgLatencyMs), 100);
  const weightSum =
    weights.accuracy +
    weights.consistency +
    weights.doNotDecide +
    weights.formatCompliance +
    weights.costEfficiency +
    weights.latency || 100;

  return rawCards
    .map((c) => {
      const accScore = c.categoryAccuracyPct ?? c.formatCompliancePct;
      const consScore = c.repeatConsistencyPct ?? 100;
      const dndScore = c.doNotDecideAccuracyPct ?? accScore;
      const fmtScore = c.formatCompliancePct;
      const costScore = c.costPer1kTxUSD === 0 ? 100 : Math.max(0, 100 - (c.costPer1kTxUSD / maxCost1k) * 80);
      const latScore = Math.max(0, 100 - (c.avgLatencyMs / maxLatency) * 75);

      const weighted =
        (accScore * weights.accuracy +
          consScore * weights.consistency +
          dndScore * weights.doNotDecide +
          fmtScore * weights.formatCompliance +
          costScore * weights.costEfficiency +
          latScore * weights.latency) /
        weightSum;

      return {
        ...c,
        weightedScore: Number(weighted.toFixed(1))
      };
    })
    .sort((a, b) => b.weightedScore - a.weightedScore);
}

export interface WorkloadBreakdownRow {
  dimension: 'Complexity' | 'Length' | 'Ambiguity';
  group: string;
  modelKey: string;
  runs: number;
  accuracyPct: number | null;
  avgLatencyMs: number;
  humanReviewPct: number;
}

export function computeWorkloadBreakdown(runs: TriageRunRecord[]): WorkloadBreakdownRow[] {
  const map: Record<
    string,
    {
      dimension: 'Complexity' | 'Length' | 'Ambiguity';
      group: string;
      modelKey: string;
      runs: number;
      catTotal: number;
      catOk: number;
      totalMs: number;
      reviewCount: number;
    }
  > = {};

  runs.forEach((r) => {
    const modelKey = `${r.provider} :: ${r.model}`;
    const gt = r.groundTruth;
    const dims: Array<['Complexity' | 'Length' | 'Ambiguity', string]> = [
      ['Complexity', gt?.complexity || 'Unlabeled'],
      ['Length', gt?.length_group || ((r.subject?.length || 0) > 80 ? 'Medium' : 'Short')],
      ['Ambiguity', gt?.ambiguity || 'Unlabeled']
    ];

    dims.forEach(([dimension, group]) => {
      if (group === 'Unlabeled') return;
      const k = `${dimension}::${group}::${modelKey}`;
      if (!map[k]) {
        map[k] = {
          dimension,
          group,
          modelKey,
          runs: 0,
          catTotal: 0,
          catOk: 0,
          totalMs: 0,
          reviewCount: 0
        };
      }
      const entry = map[k];
      entry.runs++;
      entry.totalMs += r.durationMs || 0;
      if (r.needsHumanReview) entry.reviewCount++;
      if (r.evaluation?.categoryCorrect !== null && r.evaluation?.categoryCorrect !== undefined) {
        entry.catTotal++;
        if (r.evaluation.categoryCorrect) entry.catOk++;
      }
    });
  });

  return Object.values(map).map((m) => ({
    dimension: m.dimension,
    group: m.group,
    modelKey: m.modelKey,
    runs: m.runs,
    accuracyPct: m.catTotal > 0 ? Math.round((m.catOk / m.catTotal) * 1000) / 10 : null,
    avgLatencyMs: Math.round(m.totalMs / m.runs),
    humanReviewPct: Math.round((m.reviewCount / m.runs) * 1000) / 10
  }));
}
