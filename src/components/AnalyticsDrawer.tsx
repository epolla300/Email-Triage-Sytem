import React, { useState, useMemo } from 'react';
import {
  X,
  BarChart3,
  Lightbulb,
  Download,
  Trash2,
  Search,
  FileSpreadsheet,
  Eye,
  CheckCircle2,
  ShieldAlert,
  Layers,
  Cpu
} from 'lucide-react';
import { EmailItem, TriageRunRecord } from '../types/triage';
import { formatUSD } from '../utils/redaction';
import { exportRunsToExcel } from '../utils/excelExport';

interface AnalyticsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  emails: EmailItem[];
  runHistory: TriageRunRecord[];
  onClearHistory: () => void;
  activeProvider: string;
  activeModel: string;
}

export const AnalyticsDrawer: React.FC<AnalyticsDrawerProps> = ({
  isOpen,
  onClose,
  emails = [],
  runHistory = [],
  onClearHistory,
  activeProvider = 'gemini',
  activeModel = 'gemini-3.8-flash'
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModelFilter, setSelectedModelFilter] = useState<string>('all');
  const [inspectingRun, setInspectingRun] = useState<TriageRunRecord | null>(null);

  if (!isOpen) return null;

  // Safe run history array
  const safeHistory = Array.isArray(runHistory) ? runHistory.filter(Boolean) : [];

  const processedEmails = Array.isArray(emails)
    ? emails.filter((e) => e && (e.status === 'Processed' || e.status === 'Security_Flagged'))
    : [];

  const statsSource = safeHistory.length > 0 ? safeHistory : processedEmails.map((e, idx) => {
    const s = e.slate;
    const inTok = s?.agent5_telemetry?.telemetry_summary?.total_input_tokens || 480;
    const outTok = s?.agent5_telemetry?.telemetry_summary?.total_output_tokens || 180;
    const cost =
      s?.agent5_telemetry?.telemetry_summary?.total_pipeline_cost_usd ||
      (inTok / 1000) * 0.0005 + (outTok / 1000) * 0.0015;

    return {
      runId: `SES-${idx + 1}`,
      timestamp: e.receivedAt || Date.now(),
      dateStr: new Date(e.receivedAt || Date.now()).toLocaleString(),
      emailId: e.id,
      from: e.from || 'sender@domain.com',
      subject: e.subject || '(no subject)',
      provider: activeProvider,
      model: activeModel,
      durationMs: s?.execution_meta?.totalDurationMs || 920,
      inputTokens: inTok,
      outputTokens: outTok,
      totalTokens: inTok + outTok,
      costUSD: cost,
      isSafe: s?.agent1_sanitizer?.is_safe !== false,
      securityFlag: s?.agent1_sanitizer?.security_flag || 'NONE',
      piiRedacted: Boolean(s?.agent1_sanitizer?.pii_redacted),
      category: s?.agent2_classifier?.category || 'General',
      intent: s?.agent2_classifier?.intent || 'Support',
      urgency: s?.agent2_classifier?.urgency || 2,
      sentiment: s?.agent2_classifier?.sentiment || 'Neutral',
      confidenceScore: s?.agent2_classifier?.confidence_score || 0.9,
      needsHumanReview: Boolean(s?.agent2_classifier?.needs_human_review),
      targetQueue: s?.agent3_router?.target_queue || 'General_Queue',
      priorityTag: s?.agent3_router?.priority_tag || 'NORMAL',
      notificationChannel: s?.agent3_router?.notification_channel || 'NONE',
      crmAction: s?.agent3_router?.crm_action || 'LOG_ONLY',
      routingReason: s?.agent3_router?.routing_reason || '',
      draftStatus: s?.agent4_reply?.draft_status || 'READY_FOR_APPROVAL',
      draftSubject: s?.agent4_reply?.subject_line || '',
      draftBody: s?.agent4_reply?.body_text || '',
      templateUsed: s?.agent4_reply?.template_used || '',
      costTip: s?.agent5_telemetry?.cost_optimization_recommendation || '',
      businessAdvisory: s?.agent5_telemetry?.business_process_advisory || '',
      extractedMetadata: s?.agent2_classifier?.extracted_metadata || {
        account_id: null,
        requested_dates: null,
        party_size: null,
        estimated_value: null
      },
      slate: s!
    } as TriageRunRecord;
  });

  // Calculate cumulative token metrics safely
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUSD = 0;
  let threatsCount = 0;
  let reviewCount = 0;
  let highConfCount = 0;

  const agentTokens = [0, 0, 0, 0, 0];

  statsSource.forEach((r) => {
    const inT = r.inputTokens || 0;
    const outT = r.outputTokens || 0;
    totalInputTokens += inT;
    totalOutputTokens += outT;
    totalCostUSD += r.costUSD || 0;

    if (!r.isSafe) threatsCount++;
    if (r.needsHumanReview) reviewCount++;
    if ((r.confidenceScore || 0) >= 0.85) highConfCount++;

    agentTokens[0] += Math.floor(inT * 0.22);
    agentTokens[1] += Math.floor(inT * 0.28);
    agentTokens[2] += Math.floor(inT * 0.18);
    agentTokens[3] += Math.floor(inT * 0.24);
    agentTokens[4] += Math.floor(inT * 0.08);
  });

  const totalTokens = totalInputTokens + totalOutputTokens;
  const totalRuns = statsSource.length;
  const humanReviewRate = totalRuns > 0 ? Math.round((reviewCount / totalRuns) * 100) : 0;
  const confidenceRate = totalRuns > 0 ? Math.round((highConfCount / totalRuns) * 100) : 94;
  const maxAgentTok = Math.max(...agentTokens, 1);

  // Group by models to calculate dynamic model comparison benchmarks
  const dynamicModelStats = useMemo(() => {
    const map: Record<
      string,
      {
        provider: string;
        model: string;
        runs: number;
        totalDuration: number;
        totalTokens: number;
        totalCost: number;
        highConf: number;
      }
    > = {};

    safeHistory.forEach((r) => {
      const key = r.model || activeModel;
      if (!map[key]) {
        map[key] = {
          provider: r.provider || activeProvider,
          model: key,
          runs: 0,
          totalDuration: 0,
          totalTokens: 0,
          totalCost: 0,
          highConf: 0
        };
      }
      map[key].runs += 1;
      map[key].totalDuration += r.durationMs || 0;
      map[key].totalTokens += r.totalTokens || 0;
      map[key].totalCost += r.costUSD || 0;
      if ((r.confidenceScore || 0) >= 0.85) map[key].highConf += 1;
    });

    return map;
  }, [safeHistory, activeModel, activeProvider]);

  const baselineBenchmarks = [
    {
      name: 'Gemini 3.8 Flash',
      modelId: 'gemini-3.8-flash',
      provider: 'gemini',
      baseLatency: '0.9s',
      baseCostPer1k: '$0.35'
    },
    {
      name: 'Claude 3.5 Sonnet',
      modelId: 'claude-3-5-sonnet',
      provider: 'anthropic',
      baseLatency: '1.8s',
      baseCostPer1k: '$3.00'
    },
    {
      name: 'GPT-4o-mini',
      modelId: 'gpt-4o-mini',
      provider: 'openai',
      baseLatency: '1.4s',
      baseCostPer1k: '$0.60'
    },
    {
      name: 'Local LLM (Ollama)',
      modelId: 'llama3:latest',
      provider: 'ollama',
      baseLatency: '3.8s',
      baseCostPer1k: '$0.00 (Self-Hosted)'
    }
  ];

  // Filtered runs for spreadsheet table
  const filteredRuns = useMemo(() => {
    return safeHistory.filter((r) => {
      const q = searchTerm.trim().toLowerCase();
      const matchSearch =
        q === '' ||
        (r.subject || '').toLowerCase().includes(q) ||
        (r.from || '').toLowerCase().includes(q) ||
        (r.model || '').toLowerCase().includes(q) ||
        (r.category || '').toLowerCase().includes(q) ||
        (r.targetQueue || '').toLowerCase().includes(q) ||
        (r.runId || '').toLowerCase().includes(q);

      const f = selectedModelFilter.toLowerCase();
      const matchModel =
        f === 'all' ||
        (r.model || '').toLowerCase().includes(f) ||
        (r.provider || '').toLowerCase().includes(f);

      return matchSearch && matchModel;
    });
  }, [safeHistory, searchTerm, selectedModelFilter]);

  const uniqueModels = useMemo(() => {
    const set = new Set<string>();
    safeHistory.forEach((r) => {
      if (r.model) set.add(r.model);
    });
    return Array.from(set);
  }, [safeHistory]);

  const latestRun = safeHistory[0];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-6 md:pl-10">
        <aside className="w-screen max-w-4xl bg-white border-l border-slate-200 p-4 md:p-6 shadow-2xl overflow-y-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span>Telemetry & Run Memory</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800">
                    {safeHistory.length} Recorded Tests
                  </span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Real-time multi-agent token accounting and historical test results across models
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={() => exportRunsToExcel(safeHistory)}
                disabled={safeHistory.length === 0}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 shadow-sm transition-all cursor-pointer"
                title="Download all runs as an Excel (.xlsx) file"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export to .xlsx</span>
              </button>

              {safeHistory.length > 0 && (
                <button
                  onClick={onClearHistory}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                  title="Clear past test runs from local memory"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Clear Memory</span>
                </button>
              )}

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Current Real-Time Usage Statistics */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-indigo-600" />
                Live Token Usage & Economic Telemetry
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                Pricing: <span className="font-mono font-bold text-slate-700">$0.0005/1k</span> in · <span className="font-mono font-bold text-slate-700">$0.0015/1k</span> out
              </span>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="glass-card p-4 rounded-xl border border-slate-200 bg-slate-50/80 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Total Tokens
                </span>
                <span className="text-2xl font-black text-slate-900 mt-0.5 block">
                  {totalTokens.toLocaleString()}
                </span>
                <div className="text-[10px] text-slate-600 font-medium flex items-center justify-between pt-1 mt-1 border-t border-slate-200">
                  <span>In: {totalInputTokens.toLocaleString()}</span>
                  <span>Out: {totalOutputTokens.toLocaleString()}</span>
                </div>
              </div>

              <div className="glass-card p-4 rounded-xl border border-slate-200 bg-slate-50/80 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Total Pipeline Cost
                </span>
                <span className="text-2xl font-black text-emerald-700 mt-0.5 block font-mono">
                  {formatUSD(totalCostUSD)}
                </span>
                <div className="text-[10px] text-slate-600 font-medium pt-1 mt-1 border-t border-slate-200">
                  {totalRuns > 0 ? `Avg ${formatUSD(totalCostUSD / totalRuns)} / run` : 'No runs executed'}
                </div>
              </div>

              <div className="glass-card p-4 rounded-xl border border-slate-200 bg-slate-50/80 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Confidence Score
                </span>
                <span className="text-2xl font-black text-indigo-700 mt-0.5 block">
                  {totalRuns > 0 ? `${confidenceRate}%` : '—'}
                </span>
                <div className="text-[10px] text-slate-600 font-medium pt-1 mt-1 border-t border-slate-200">
                  Threshold &gt; 0.85
                </div>
              </div>

              <div className="glass-card p-4 rounded-xl border border-slate-200 bg-slate-50/80 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Human Review Rate
                </span>
                <span className="text-2xl font-black text-amber-700 mt-0.5 block">
                  {totalRuns > 0 ? `${humanReviewRate}%` : '—'}
                </span>
                <div className="text-[10px] text-slate-600 font-medium pt-1 mt-1 border-t border-slate-200">
                  {threatsCount} Security Alerts
                </div>
              </div>
            </div>
          </div>

          {/* Tokens Per Agent Distribution Chart */}
          <div className="glass-card p-5 rounded-2xl border border-slate-200 space-y-3 bg-white shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                Token Volume Per Agent in Pipeline
              </h3>
              <span className="text-[11px] text-slate-500">
                Agent 1 through Agent 5 cumulative load
              </span>
            </div>

            <div className="h-32 flex items-end gap-3 pt-6 pb-2 px-2 border-b border-slate-200">
              {[
                { name: '1. Sanitizer', val: agentTokens[0] },
                { name: '2. Classifier', val: agentTokens[1] },
                { name: '3. Router', val: agentTokens[2] },
                { name: '4. Drafter', val: agentTokens[3] },
                { name: '5. Telemetry', val: agentTokens[4] }
              ].map((agent) => {
                const pct = Math.max(14, Math.round((agent.val / maxAgentTok) * 100));

                return (
                  <div key={agent.name} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-[10px] font-mono text-indigo-700 font-bold">
                      {agent.val > 0 ? agent.val.toLocaleString() : '—'}
                    </span>
                    <div
                      style={{ height: `${pct}%` }}
                      className="w-full rounded-t-lg bg-gradient-to-t from-indigo-600 to-violet-500 transition-all duration-300"
                    />
                    <span className="text-[10px] font-bold text-slate-700 truncate max-w-full text-center">
                      {agent.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Past Run Memory / Spreadsheet Table */}
          <div className="glass-card p-5 rounded-2xl border border-slate-200 space-y-4 bg-white shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  Past Run Memory & Answers (.xlsx Table)
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Review outputs produced by each LLM test run or export directly to an Excel spreadsheet
                </p>
              </div>

              {/* Search & Filter Toolbar */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search runs..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-indigo-500 w-36 sm:w-48"
                  />
                </div>

                {uniqueModels.length > 0 && (
                  <select
                    value={selectedModelFilter}
                    onChange={(e) => setSelectedModelFilter(e.target.value)}
                    className="text-xs py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="all">All Models ({safeHistory.length})</option>
                    {uniqueModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Table Display */}
            {filteredRuns.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-80 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-100/95 backdrop-blur-xs text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Run ID</th>
                      <th className="py-2.5 px-3">Model</th>
                      <th className="py-2.5 px-3">Subject / Sender</th>
                      <th className="py-2.5 px-3">Security</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Queue</th>
                      <th className="py-2.5 px-3 text-right">Tokens (In/Out)</th>
                      <th className="py-2.5 px-3 text-right">Cost</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {filteredRuns.map((r) => (
                      <tr
                        key={r.runId}
                        className="hover:bg-indigo-50/30 transition-colors cursor-pointer group"
                        onClick={() => setInspectingRun(r)}
                      >
                        <td className="py-2.5 px-3 font-mono text-[11px] font-bold text-indigo-700">
                          {r.runId}
                          <span className="block text-[9px] text-slate-400 font-sans font-normal">
                            {r.dateStr}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                            {r.model}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 max-w-[180px]">
                          <span className="font-semibold text-slate-900 block truncate" title={r.subject}>
                            {r.subject}
                          </span>
                          <span className="text-[10px] text-slate-500 block truncate">
                            {r.from}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {r.isSafe ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Clean
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <ShieldAlert className="w-3 h-3" /> {r.securityFlag}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-medium text-slate-800 block text-[11px]">
                            {r.category}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {r.intent}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono text-[10px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                            {r.targetQueue}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-700">
                          <span className="font-bold text-slate-900">{(r.totalTokens || 0).toLocaleString()}</span>
                          <span className="block text-[9px] text-slate-400">
                            {(r.inputTokens || 0).toLocaleString()} / {(r.outputTokens || 0).toLocaleString()}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[11px] font-bold text-emerald-700">
                          {formatUSD(r.costUSD)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectingRun(r);
                            }}
                            className="p-1 rounded text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition-colors inline-flex items-center gap-1 text-[11px] font-bold"
                            title="Inspect Agent 1-5 Answers for this run"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Inspect</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 space-y-2">
                <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto" />
                <h4 className="text-xs font-bold text-slate-700">No test runs recorded in memory yet</h4>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Execute email triage tests in the Inbox or Agents tab using different models. Each run will be logged here and ready for one-click Excel (.xlsx) export.
                </p>
              </div>
            )}
          </div>

          {/* Model Benchmark & Economic Comparison Table */}
          <div className="glass-card p-5 rounded-2xl border border-slate-200 space-y-3 bg-white shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                Model Benchmark & Economic Comparison
              </h3>
              <span className="text-[11px] text-slate-500">
                Active & recorded model comparisons
              </span>
            </div>

            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold">
                    <th className="pb-2">Model Engine</th>
                    <th className="pb-2">Recorded Runs</th>
                    <th className="pb-2">Avg Latency</th>
                    <th className="pb-2">Avg Tokens</th>
                    <th className="pb-2">Est. Cost / 1k msgs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800 font-mono text-[11px]">
                  {baselineBenchmarks.map((base) => {
                    const isCurrent =
                      activeModel.toLowerCase().includes(base.modelId.toLowerCase()) ||
                      activeProvider === base.provider;
                    const stats =
                      dynamicModelStats[base.modelId] ||
                      Object.values(dynamicModelStats).find((s) => s.provider === base.provider);

                    const runsCount = stats ? stats.runs : 0;
                    const avgLatency = stats
                      ? (stats.totalDuration / stats.runs / 1000).toFixed(2) + 's'
                      : base.baseLatency;
                    const avgTokens = stats ? Math.round(stats.totalTokens / stats.runs) : '—';
                    const costPer1k = stats
                      ? formatUSD((stats.totalCost / stats.runs) * 1000)
                      : base.baseCostPer1k;

                    return (
                      <tr
                        key={base.name}
                        className={isCurrent ? 'font-bold text-indigo-800 bg-indigo-50/50' : ''}
                      >
                        <td className="py-2.5 flex items-center gap-1.5 font-sans font-semibold">
                          <span>{base.name}</span>
                          {isCurrent && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800 font-bold">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="py-2.5">
                          {runsCount > 0 ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                              {runsCount} tests
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">Benchmark</span>
                          )}
                        </td>
                        <td className="py-2.5">{avgLatency}</td>
                        <td className="py-2.5">{avgTokens}</td>
                        <td className="py-2.5 font-bold text-emerald-700">{costPer1k}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-500 pt-1 font-medium">
              Switch provider in the Agents tab to benchmark live on the same incoming payload dataset.
            </p>
          </div>

          {/* Latest Executive Process Advisory */}
          {latestRun && (latestRun.businessAdvisory || latestRun.costTip) && (
            <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-2">
              <div className="flex items-center gap-2 text-indigo-800 font-bold text-xs">
                <Lightbulb className="w-4 h-4 text-indigo-700" />
                <span>Agent 5 Executive Process Advisory (Run: {latestRun.runId})</span>
              </div>
              {latestRun.businessAdvisory && (
                <p className="text-xs text-slate-800 font-medium">
                  {latestRun.businessAdvisory}
                </p>
              )}
              {latestRun.costTip && (
                <div className="text-[11px] text-indigo-900 pt-1 border-t border-indigo-200 font-mono">
                  💡 Cost Tip: {latestRun.costTip}
                </div>
              )}
            </div>
          )}

          {/* Modal / Inspector for a Selected Historical Run */}
          {inspectingRun && (
            <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Eye className="w-5 h-5 text-indigo-600" />
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Run Details & Answers: {inspectingRun.runId}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Tested with {inspectingRun.provider} ({inspectingRun.model}) on {inspectingRun.dateStr}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setInspectingRun(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Email Subject & Sender */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                  <div className="font-bold text-slate-900">Subject: {inspectingRun.subject}</div>
                  <div className="text-slate-600">From: {inspectingRun.from}</div>
                </div>

                {/* Agent 1 Answers */}
                <div className="p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>Agent 1: Sanitizer Output</span>
                    <span className={inspectingRun.isSafe ? 'text-emerald-700' : 'text-rose-700'}>
                      Safe: {inspectingRun.isSafe ? 'YES' : 'NO'} ({inspectingRun.securityFlag})
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    PII Scrubbed: {inspectingRun.piiRedacted ? 'Yes' : 'No'}
                  </p>
                  {inspectingRun.slate?.agent1_sanitizer?.sanitized_body && (
                    <div className="p-2 bg-slate-50 rounded border border-slate-200 font-mono text-[11px] whitespace-pre-wrap max-h-24 overflow-y-auto">
                      {inspectingRun.slate.agent1_sanitizer.sanitized_body}
                    </div>
                  )}
                </div>

                {/* Agent 2 Answers */}
                <div className="p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>Agent 2: Classifier Output</span>
                    <span className="text-indigo-700">Urgency: {inspectingRun.urgency}/5</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>Category: <span className="font-semibold text-slate-800">{inspectingRun.category}</span></div>
                    <div>Intent: <span className="font-semibold text-slate-800">{inspectingRun.intent}</span></div>
                    <div>Sentiment: <span className="font-semibold text-slate-800">{inspectingRun.sentiment}</span></div>
                    <div>Confidence: <span className="font-semibold text-slate-800">{((inspectingRun.confidenceScore || 0.85) * 100).toFixed(1)}%</span></div>
                  </div>
                </div>

                {/* Agent 3 Answers */}
                <div className="p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>Agent 3: Router & Action Output</span>
                    <span className="text-purple-700 font-mono">{inspectingRun.priorityTag}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>Target Queue: <span className="font-mono text-slate-800">{inspectingRun.targetQueue}</span></div>
                    <div>CRM Action: <span className="font-mono text-slate-800">{inspectingRun.crmAction}</span></div>
                  </div>
                  <p className="text-slate-600 text-[11px] italic">
                    Reason: {inspectingRun.routingReason}
                  </p>
                </div>

                {/* Agent 4 Answers */}
                <div className="p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>Agent 4: Reply Drafter Output</span>
                    <span className="text-indigo-700 font-mono text-[10px]">{inspectingRun.draftStatus}</span>
                  </div>
                  <div className="font-semibold text-slate-800 text-[11px]">
                    Subject: {inspectingRun.draftSubject}
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200 font-sans text-[11px] whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {inspectingRun.draftBody}
                  </div>
                </div>

                {/* Agent 5 Answers */}
                <div className="p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs bg-slate-50">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>Agent 5: Telemetry Summary</span>
                    <span className="text-emerald-700 font-mono">{formatUSD(inspectingRun.costUSD)}</span>
                  </div>
                  <div className="text-[11px] text-slate-600 font-mono">
                    Tokens: {(inspectingRun.totalTokens || 0).toLocaleString()} (In: {(inspectingRun.inputTokens || 0).toLocaleString()} | Out: {(inspectingRun.outputTokens || 0).toLocaleString()})
                  </div>
                  {inspectingRun.costTip && (
                    <div className="text-[11px] text-slate-700 pt-1 border-t border-slate-200">
                      💡 Tip: {inspectingRun.costTip}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setInspectingRun(null)}
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Close Inspector
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
