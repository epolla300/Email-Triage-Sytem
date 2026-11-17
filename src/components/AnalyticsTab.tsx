import React, { useState, useMemo } from 'react';
import {
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
  Cpu,
  X,
  Sparkles,
  Database,
  Filter,
  Check,
  ZapOff
} from 'lucide-react';
import { EmailItem, TriageRunRecord } from '../types/triage';
import { formatUSD } from '../utils/redaction';
import { exportRunsToExcel } from '../utils/excelExport';

interface AnalyticsTabProps {
  emails: EmailItem[];
  runHistory: TriageRunRecord[];
  onClearHistory: () => void;
  activeProvider: string;
  activeModel: string;
  telemetryEnabled?: boolean;
  onToggleTelemetry?: () => void;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({
  emails = [],
  runHistory = [],
  onClearHistory,
  activeProvider = 'gemini',
  activeModel = 'gemini-3.8-flash',
  telemetryEnabled = true,
  onToggleTelemetry
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModelFilter, setSelectedModelFilter] = useState<string>('all');
  const [selectedDatasetFilter, setSelectedDatasetFilter] = useState<string>('all');
  const [inspectingRun, setInspectingRun] = useState<TriageRunRecord | null>(null);

  // Safe run history array
  const safeHistory = useMemo(() => {
    return Array.isArray(runHistory) ? runHistory.filter(Boolean) : [];
  }, [runHistory]);

  const processedEmails = useMemo(() => {
    return Array.isArray(emails)
      ? emails.filter((e) => e && (e.status === 'Processed' || e.status === 'Security_Flagged'))
      : [];
  }, [emails]);

  // Unique datasets recorded across runs
  const uniqueDatasets = useMemo(() => {
    const set = new Set<string>();
    safeHistory.forEach((r) => {
      if (r.datasetName) set.add(r.datasetName);
    });
    return Array.from(set);
  }, [safeHistory]);

  // Unique models recorded across runs
  const uniqueModels = useMemo(() => {
    const set = new Set<string>();
    safeHistory.forEach((r) => {
      if (r.model) set.add(r.model);
    });
    return Array.from(set);
  }, [safeHistory]);

  // Dataset x Model Breakdown Memory
  const datasetModelBreakdown = useMemo(() => {
    const map: Record<
      string,
      {
        datasetName: string;
        modelKey: string;
        provider: string;
        model: string;
        runs: number;
        totalDuration: number;
        totalTokens: number;
        totalCost: number;
        telemetryBypassedCount: number;
        highConfCount: number;
        humanReviewCount: number;
        threatsCount: number;
      }
    > = {};

    safeHistory.forEach((r) => {
      const ds = r.datasetName || 'General Queue';
      const mKey = `${r.provider} - ${r.model}`;
      const combo = `${ds} ___ ${mKey}`;

      if (!map[combo]) {
        map[combo] = {
          datasetName: ds,
          modelKey: mKey,
          provider: r.provider,
          model: r.model,
          runs: 0,
          totalDuration: 0,
          totalTokens: 0,
          totalCost: 0,
          telemetryBypassedCount: 0,
          highConfCount: 0,
          humanReviewCount: 0,
          threatsCount: 0
        };
      }

      const item = map[combo];
      item.runs += 1;
      item.totalDuration += r.durationMs || 0;
      item.totalTokens += r.totalTokens || 0;
      item.totalCost += r.costUSD || 0;
      if (r.telemetryEnabled === false) item.telemetryBypassedCount += 1;
      if ((r.confidenceScore || 0) >= 0.85) item.highConfCount += 1;
      if (r.needsHumanReview) item.humanReviewCount += 1;
      if (!r.isSafe) item.threatsCount += 1;
    });

    return Object.values(map);
  }, [safeHistory]);

  // Derive stats source from runHistory or active session
  const statsSource = useMemo(() => {
    if (safeHistory.length > 0) return safeHistory;

    return processedEmails.map((e, idx) => {
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
        datasetName: e.datasetName || 'General Queue',
        telemetryEnabled: telemetryEnabled,
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
        category: s?.agent2_classifier?.category || 'Customer Service',
        intent: s?.agent2_classifier?.intent || 'Support Request',
        urgency: s?.agent2_classifier?.urgency || 2,
        sentiment: s?.agent2_classifier?.sentiment || 'Neutral',
        confidenceScore: s?.agent2_classifier?.confidence_score || 0.9,
        needsHumanReview: Boolean(s?.agent2_classifier?.needs_human_review),
        targetQueue: s?.agent3_router?.target_queue || 'Support_Queue',
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
  }, [safeHistory, processedEmails, activeProvider, activeModel, telemetryEnabled]);

  // Aggregate metrics safely
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUSD = 0;
  let threatsCount = 0;
  let reviewCount = 0;
  let highConfCount = 0;
  let bypassedCount = 0;

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
    if (r.telemetryEnabled === false) bypassedCount++;

    // Agents 1 & 2 run deterministically in code (0 LLM tokens)
    agentTokens[0] += 0;
    agentTokens[1] += 0;
    if (r.telemetryEnabled === false) {
      agentTokens[2] += Math.floor(inT * 0.42);
      agentTokens[3] += Math.floor(inT * 0.58);
    } else {
      agentTokens[2] += Math.floor(inT * 0.36);
      agentTokens[3] += Math.floor(inT * 0.48);
      agentTokens[4] += Math.floor(inT * 0.16);
    }
  });

  const totalTokens = totalInputTokens + totalOutputTokens;
  const totalRuns = statsSource.length;
  const humanReviewRate = totalRuns > 0 ? Math.round((reviewCount / totalRuns) * 100) : 0;
  const confidenceRate = totalRuns > 0 ? Math.round((highConfCount / totalRuns) * 100) : 94;
  const maxAgentTok = Math.max(...agentTokens, 1);

  // Search and filter runs safely
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
        (r.datasetName || '').toLowerCase().includes(q) ||
        (r.runId || '').toLowerCase().includes(q);

      const fModel = selectedModelFilter.toLowerCase();
      const matchModel =
        fModel === 'all' ||
        (r.model || '').toLowerCase().includes(fModel) ||
        (r.provider || '').toLowerCase().includes(fModel);

      const matchDataset =
        selectedDatasetFilter === 'all' ||
        (r.datasetName || 'General Queue') === selectedDatasetFilter;

      return matchSearch && matchModel && matchDataset;
    });
  }, [safeHistory, searchTerm, selectedModelFilter, selectedDatasetFilter]);

  const latestRun = safeHistory[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner Card with Telemetry Toggle and Export */}
      <div className="glass-card p-6 rounded-2xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Pipeline Telemetry & Run Memory
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                  {safeHistory.length} Recorded Runs
                </span>
                {uniqueDatasets.length > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-800 flex items-center gap-1">
                    <Database className="w-3 h-3" />
                    {uniqueDatasets.length} {uniqueDatasets.length === 1 ? 'Dataset' : 'Datasets'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5 font-medium">
                Tracks which dataset was processed by each LLM, with live token telemetry and Agent 5 control
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Agent 5 Telemetry Toggle Switch */}
            {onToggleTelemetry && (
              <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-xs font-bold text-slate-800">Agent 5 Telemetry:</span>
                <button
                  type="button"
                  onClick={onToggleTelemetry}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    telemetryEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                  title="Toggle Agent 5 (Telemetry Agent) ON or OFF to save tokens and latency"
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      telemetryEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className={`text-[11px] font-bold ${telemetryEnabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {telemetryEnabled ? 'ON' : 'OFF (Bypassed)'}
                </span>
              </div>
            )}

            <button
              onClick={() => exportRunsToExcel(safeHistory)}
              disabled={safeHistory.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 shadow-md shadow-emerald-600/20 transition-all hover:scale-[1.02] active:scale-100 cursor-pointer"
              title="Download all runs and dataset breakdowns as an Excel (.xlsx) file"
            >
              <Download className="w-4 h-4" />
              <span>Export to .xlsx</span>
            </button>

            {safeHistory.length > 0 && (
              <button
                onClick={onClearHistory}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                title="Clear past test runs from local memory"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Memory</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Real-Time KPIs Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5 rounded-2xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Tokens
            </span>
            <Cpu className="w-4 h-4 text-indigo-500" />
          </div>
          <span className="text-2xl md:text-3xl font-black text-slate-900 mt-2 block tracking-tight">
            {totalTokens.toLocaleString()}
          </span>
          <div className="text-[11px] text-slate-600 font-medium flex items-center justify-between pt-2 mt-2 border-t border-slate-100">
            <span>In: {totalInputTokens.toLocaleString()}</span>
            <span>Out: {totalOutputTokens.toLocaleString()}</span>
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Calculated Cost
            </span>
            <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
              USD
            </span>
          </div>
          <span className="text-2xl md:text-3xl font-black text-emerald-700 mt-2 block font-mono tracking-tight">
            {formatUSD(totalCostUSD)}
          </span>
          <div className="text-[11px] text-slate-600 font-medium pt-2 mt-2 border-t border-slate-100">
            {totalRuns > 0 ? `Avg ${formatUSD(totalCostUSD / totalRuns)} / run` : 'No runs recorded'}
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Confidence Rating
            </span>
            <Sparkles className="w-4 h-4 text-indigo-500" />
          </div>
          <span className="text-2xl md:text-3xl font-black text-indigo-700 mt-2 block tracking-tight">
            {totalRuns > 0 ? `${confidenceRate}%` : '—'}
          </span>
          <div className="text-[11px] text-slate-600 font-medium pt-2 mt-2 border-t border-slate-100">
            High confidence threshold &gt; 0.85
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Human Review Rate
            </span>
            <ShieldAlert className="w-4 h-4 text-amber-500" />
          </div>
          <span className="text-2xl md:text-3xl font-black text-amber-700 mt-2 block tracking-tight">
            {totalRuns > 0 ? `${humanReviewRate}%` : '—'}
          </span>
          <div className="text-[11px] text-slate-600 font-medium pt-2 mt-2 border-t border-slate-100">
            {threatsCount} Security Alerts · {bypassedCount} Telemetry Bypassed
          </div>
        </div>
      </div>

      {/* SECTION 1: DATASET MEMORY MATRIX - Remembers what dataset was processed by each LLM */}
      <div className="glass-card p-6 rounded-2xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-100 text-violet-700">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Dataset Memory & Multi-LLM Benchmark Matrix</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-semibold">
                  Cross-Model Intelligence
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Remembers and compares which LLM processed each dataset, tracking performance, tokens, and cost side-by-side
              </p>
            </div>
          </div>

          {uniqueDatasets.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Filter View:</span>
              <select
                value={selectedDatasetFilter}
                onChange={(e) => setSelectedDatasetFilter(e.target.value)}
                className="py-1.5 px-3 bg-white border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:border-indigo-500 shadow-2xs"
              >
                <option value="all">All Datasets ({uniqueDatasets.length})</option>
                {uniqueDatasets.map((ds) => (
                  <option key={ds} value={ds}>
                    📁 {ds}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {datasetModelBreakdown.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3.5">Dataset Name</th>
                  <th className="py-3 px-3.5">LLM Engine</th>
                  <th className="py-3 px-3.5 text-center">Emails Processed</th>
                  <th className="py-3 px-3.5">Avg Latency</th>
                  <th className="py-3 px-3.5 text-right">Avg Tokens / Email</th>
                  <th className="py-3 px-3.5 text-right">Total Cost</th>
                  <th className="py-3 px-3.5 text-right">Est. Cost / 1k</th>
                  <th className="py-3 px-3.5 text-center">Confidence</th>
                  <th className="py-3 px-3.5 text-center">Threats</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {datasetModelBreakdown
                  .filter(
                    (item) =>
                      selectedDatasetFilter === 'all' || item.datasetName === selectedDatasetFilter
                  )
                  .map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3.5">
                        <span className="inline-flex items-center gap-1.5 font-bold text-slate-900">
                          <Database className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                          <span>{item.datasetName}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3.5">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                          {item.modelKey}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-center font-bold text-slate-800">
                        {item.runs}
                      </td>
                      <td className="py-3 px-3.5 font-mono text-[11px] text-slate-700">
                        {(item.totalDuration / item.runs / 1000).toFixed(2)}s
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono text-[11px] text-slate-700">
                        {Math.round(item.totalTokens / item.runs).toLocaleString()}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono text-[11px] font-bold text-emerald-700">
                        {formatUSD(item.totalCost)}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono text-[11px] font-bold text-emerald-700">
                        {formatUSD((item.totalCost / item.runs) * 1000)}
                      </td>
                      <td className="py-3 px-3.5 text-center font-semibold text-slate-800">
                        {Math.round((item.highConfCount / item.runs) * 100)}%
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        {item.threatsCount > 0 ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            {item.threatsCount} Flagged
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 space-y-2">
            <Database className="w-8 h-8 text-slate-400 mx-auto" />
            <h4 className="text-xs font-bold text-slate-700">No dataset runs recorded yet</h4>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              Run triage on emails from an uploaded CSV/JSON dataset or write test emails with a dataset tag. The answers and metrics from each LLM will be permanently mapped and remembered here.
            </p>
          </div>
        )}
      </div>

      {/* Two Column Section: Agent Volume Distribution & Model Benchmark */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Token Volume Per Agent */}
        <div className="glass-card p-6 rounded-2xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Token Volume Per Agent in Pipeline
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Cumulative computational load
            </span>
          </div>

          <div className="h-40 flex items-end gap-3 pt-8 pb-3 px-2 border-b border-slate-200">
            {[
              { name: '1. Sanitizer', val: agentTokens[0], isCode: true },
              { name: '2. Classifier', val: agentTokens[1], isCode: true },
              { name: '3. Router', val: agentTokens[2], isCode: false },
              { name: '4. Drafter', val: agentTokens[3], isCode: false },
              { name: '5. Telemetry', val: agentTokens[4], isCode: false }
            ].map((agent) => {
              const pct = agent.isCode ? 6 : Math.max(14, Math.round((agent.val / maxAgentTok) * 100));

              return (
                <div key={agent.name} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <span className={`text-[10px] font-mono font-bold ${agent.isCode ? 'text-cyan-700' : 'text-indigo-700'}`}>
                    {agent.isCode ? '0 (Code)' : agent.val > 0 ? agent.val.toLocaleString() : '—'}
                  </span>
                  <div
                    style={{ height: `${pct}%` }}
                    className={`w-full rounded-t-xl transition-all duration-300 shadow-sm ${
                      agent.isCode
                        ? 'bg-cyan-200 border border-dashed border-cyan-400'
                        : 'bg-gradient-to-t from-indigo-600 to-violet-500'
                    }`}
                  />
                  <span className="text-[10px] font-bold text-slate-700 truncate max-w-full text-center">
                    {agent.name}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-500 font-medium">
            Benchmark: $0.0005 per 1,000 input tokens, $0.0015 per 1,000 output tokens.
          </p>
        </div>

        {/* Executive Process Advisory & Telemetry Advice */}
        <div className="glass-card p-6 rounded-2xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Agent 5 Executive Process Advisory
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              {telemetryEnabled ? 'Agent 5 Active' : 'Agent 5 Bypassed'}
            </span>
          </div>

          {latestRun && (latestRun.businessAdvisory || latestRun.costTip) ? (
            <div className="p-4 rounded-xl bg-indigo-50/80 border border-indigo-200/80 space-y-2">
              {latestRun.businessAdvisory && (
                <p className="text-xs text-slate-800 font-medium leading-relaxed">
                  {latestRun.businessAdvisory}
                </p>
              )}
              {latestRun.costTip && (
                <div className="text-[11px] text-indigo-900 pt-2 border-t border-indigo-200 font-mono">
                  💡 Recommendation: {latestRun.costTip}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">Optimization Telemetry Ready</p>
              <p>
                {telemetryEnabled
                  ? 'Run email triage tests to generate live cost reduction insights and executive process advisories.'
                  : 'Telemetry Agent is currently toggled OFF to minimize token usage. Turn on Agent 5 in the header to receive live advisories.'}
              </p>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
            <span>Historical Tests: <strong className="text-slate-800">{safeHistory.length}</strong></span>
            <span>Export format: <strong className="text-emerald-700">Excel (.xlsx)</strong></span>
          </div>
        </div>
      </div>

      {/* Spreadsheet Run Memory Table */}
      <div className="glass-card p-6 rounded-2xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Historical Run Memory & Answers (.xlsx Table)</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Every triage test and multi-agent answer logged across models and datasets
            </p>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search runs, datasets..."
                className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-indigo-500 w-36 sm:w-48"
              />
            </div>

            {uniqueDatasets.length > 0 && (
              <select
                value={selectedDatasetFilter}
                onChange={(e) => setSelectedDatasetFilter(e.target.value)}
                className="text-xs py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Datasets ({uniqueDatasets.length})</option>
                {uniqueDatasets.map((d) => (
                  <option key={d} value={d}>
                    📁 {d}
                  </option>
                ))}
              </select>
            )}

            {uniqueModels.length > 0 && (
              <select
                value={selectedModelFilter}
                onChange={(e) => setSelectedModelFilter(e.target.value)}
                className="text-xs py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Models ({uniqueModels.length})</option>
                {uniqueModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Table View */}
        {filteredRuns.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3.5">Run ID</th>
                  <th className="py-3 px-3.5">Dataset</th>
                  <th className="py-3 px-3.5">Model</th>
                  <th className="py-3 px-3.5">Telemetry</th>
                  <th className="py-3 px-3.5">Subject / Sender</th>
                  <th className="py-3 px-3.5">Security Check</th>
                  <th className="py-3 px-3.5">Category & Intent</th>
                  <th className="py-3 px-3.5">Destination Queue</th>
                  <th className="py-3 px-3.5 text-right">Tokens (In/Out)</th>
                  <th className="py-3 px-3.5 text-right">Cost</th>
                  <th className="py-3 px-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredRuns.map((r) => (
                  <tr
                    key={r.runId}
                    className="hover:bg-indigo-50/40 transition-colors cursor-pointer"
                    onClick={() => setInspectingRun(r)}
                  >
                    <td className="py-3 px-3.5 font-mono text-[11px] font-bold text-indigo-700">
                      {r.runId}
                      <span className="block text-[9px] text-slate-400 font-sans font-normal">
                        {r.dateStr}
                      </span>
                    </td>
                    <td className="py-3 px-3.5">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-800 border border-violet-200 truncate max-w-[120px]">
                        📁 {r.datasetName || 'General Queue'}
                      </span>
                    </td>
                    <td className="py-3 px-3.5">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                        {r.model}
                      </span>
                    </td>
                    <td className="py-3 px-3.5">
                      {r.telemetryEnabled !== false ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          Bypassed
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3.5 max-w-[180px]">
                      <span className="font-semibold text-slate-900 block truncate" title={r.subject}>
                        {r.subject}
                      </span>
                      <span className="text-[10px] text-slate-500 block truncate">
                        {r.from}
                      </span>
                    </td>
                    <td className="py-3 px-3.5">
                      {r.isSafe ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> Clean
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <ShieldAlert className="w-3 h-3" /> {r.securityFlag}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3.5">
                      <span className="font-semibold text-slate-800 block text-[11px]">
                        {r.category}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        {r.intent}
                      </span>
                    </td>
                    <td className="py-3 px-3.5">
                      <span className="font-mono text-[10px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {r.targetQueue}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono text-[11px] text-slate-700">
                      <span className="font-bold text-slate-900">{(r.totalTokens || 0).toLocaleString()}</span>
                      <span className="block text-[9px] text-slate-400">
                        {(r.inputTokens || 0).toLocaleString()} / {(r.outputTokens || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono text-[11px] font-bold text-emerald-700">
                      {formatUSD(r.costUSD)}
                    </td>
                    <td className="py-3 px-3.5 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectingRun(r);
                        }}
                        className="px-2.5 py-1 rounded-lg text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-indigo-200 transition-colors inline-flex items-center gap-1 text-[11px] font-bold cursor-pointer"
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
          <div className="py-14 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 space-y-2.5">
            <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700">No test runs match selected filters</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Execute email triage tests in the Inbox or Agents tab using different models and datasets. Each run will be logged here and ready for one-click Excel (.xlsx) export.
            </p>
          </div>
        )}
      </div>

      {/* Modal Inspector for a Selected Historical Run */}
      {inspectingRun && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Run Details & Agent Answers: {inspectingRun.runId}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Dataset: <strong className="text-slate-800">{inspectingRun.datasetName || 'General Queue'}</strong> · Tested with {inspectingRun.provider} ({inspectingRun.model}) on {inspectingRun.dateStr}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectingRun(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Email Subject, Sender, Dataset, Telemetry */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">Subject: {inspectingRun.subject}</span>
                <span className="px-2 py-0.5 rounded bg-violet-100 text-violet-800 font-semibold text-[10px]">
                  📁 {inspectingRun.datasetName || 'General Queue'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>From: {inspectingRun.from}</span>
                <span className="font-mono text-[10px]">
                  Telemetry Agent: {inspectingRun.telemetryEnabled !== false ? 'Active' : 'Bypassed (Off)'}
                </span>
              </div>
            </div>

            {/* Agent 1 Answers */}
            <div className="p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-800">
                <span>Agent 1: Sanitizer & Security Output</span>
                <span className={inspectingRun.isSafe ? 'text-emerald-700' : 'text-rose-700'}>
                  Safe: {inspectingRun.isSafe ? 'YES' : 'NO'} ({inspectingRun.securityFlag})
                </span>
              </div>
              <p className="text-slate-600 text-[11px]">
                PII Scrubbed: {inspectingRun.piiRedacted ? 'Yes' : 'None detected'}
              </p>
              {inspectingRun.slate?.agent1_sanitizer?.sanitized_body && (
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200 font-mono text-[11px] whitespace-pre-wrap max-h-24 overflow-y-auto">
                  {inspectingRun.slate.agent1_sanitizer.sanitized_body}
                </div>
              )}
            </div>

            {/* Agent 2 Answers */}
            <div className="p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs">
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
            <div className="p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-800">
                <span>Agent 3: Router & Action Output</span>
                <span className="text-purple-700 font-mono font-bold">{inspectingRun.priorityTag}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>Target Queue: <span className="font-mono text-slate-800">{inspectingRun.targetQueue}</span></div>
                <div>CRM Action: <span className="font-mono text-slate-800">{inspectingRun.crmAction}</span></div>
              </div>
              {inspectingRun.routingReason && (
                <p className="text-slate-600 text-[11px] italic">
                  Rationale: {inspectingRun.routingReason}
                </p>
              )}
            </div>

            {/* Agent 4 Answers */}
            <div className="p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-800">
                <span>Agent 4: Reply Drafter Output</span>
                <span className="text-indigo-700 font-mono text-[10px]">{inspectingRun.draftStatus}</span>
              </div>
              <div className="font-semibold text-slate-800 text-[11px]">
                Subject: {inspectingRun.draftSubject}
              </div>
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200 font-sans text-[11px] whitespace-pre-wrap max-h-32 overflow-y-auto">
                {inspectingRun.draftBody}
              </div>
            </div>

            {/* Agent 5 Answers */}
            <div className="p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs bg-slate-50">
              <div className="flex items-center justify-between font-bold text-slate-800">
                <span>Agent 5: Telemetry Summary</span>
                <span className="text-emerald-700 font-mono font-bold">{formatUSD(inspectingRun.costUSD)}</span>
              </div>
              <div className="text-[11px] text-slate-600 font-mono">
                Tokens: {(inspectingRun.totalTokens || 0).toLocaleString()} (In: {(inspectingRun.inputTokens || 0).toLocaleString()} | Out: {(inspectingRun.outputTokens || 0).toLocaleString()})
              </div>
              {inspectingRun.telemetryEnabled === false ? (
                <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                  ℹ️ Telemetry Agent was bypassed during this execution.
                </div>
              ) : inspectingRun.costTip ? (
                <div className="text-[11px] text-slate-700 pt-1 border-t border-slate-200">
                  💡 Tip: {inspectingRun.costTip}
                </div>
              ) : null}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectingRun(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
