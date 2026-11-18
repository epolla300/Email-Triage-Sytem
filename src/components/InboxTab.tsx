import React, { useRef, useState } from 'react';
import {
  Inbox,
  PenSquare,
  Play,
  Upload,
  Trash2,
  ShieldAlert,
  ShieldCheck,
  Clock,
  ArrowRight,
  CheckCircle2,
  Download,
  AlertTriangle,
  XCircle
} from 'lucide-react';
import { EmailItem } from '../types/triage';
import { renderSanitizedText } from '../utils/redaction';
import { downloadCapstoneCSVTemplate } from '../utils/csvParser';
import { evaluateSlateAgainstGroundTruth } from '../utils/evaluation';

interface InboxTabProps {
  emails: EmailItem[];
  selectedEmailId: string | null;
  onSelectEmail: (id: string) => void;
  onOpenCompose: () => void;
  onProcessAll: () => void;
  onProcessSingle: (id: string) => void;
  onClearAll: () => void;
  onDeleteSingle: (id: string) => void;
  onImportFiles: (files: FileList | null) => void;
  isProcessing: boolean;
  onStopProcessing: () => void;
  onNavigateToAgents: () => void;
}

export const InboxTab: React.FC<InboxTabProps> = ({
  emails,
  selectedEmailId,
  onSelectEmail,
  onOpenCompose,
  onProcessAll,
  onProcessSingle,
  onClearAll,
  onDeleteSingle,
  onImportFiles,
  isProcessing,
  onStopProcessing,
  onNavigateToAgents
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [splitFilter, setSplitFilter] = useState<'all' | 'dev' | 'test' | 'dnd'>('all');

  const filteredEmails = emails.filter((e) => {
    if (splitFilter === 'dev') return e.groundTruth?.split === 'dev';
    if (splitFilter === 'test') return e.groundTruth?.split === 'test';
    if (splitFilter === 'dnd') return Boolean(e.groundTruth?.is_do_not_decide);
    return true;
  });

  const selectedEmail =
    filteredEmails.find((e) => e.id === selectedEmailId) ||
    (filteredEmails.length > 0 ? filteredEmails[0] : null);

  const pendingCount = emails.filter((e) => e.status === 'Pending').length;
  const processedCount = emails.filter((e) => e.status === 'Processed' || e.status === 'Security_Flagged').length;
  const labeledCount = emails.filter((e) => Boolean(e.groundTruth?.expected_category)).length;
  const dndCount = emails.filter((e) => Boolean(e.groundTruth?.is_do_not_decide)).length;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onImportFiles(e.dataTransfer.files);
    }
  };

  const selectedEval = selectedEmail?.slate
    ? evaluateSlateAgainstGroundTruth(selectedEmail.slate, selectedEmail.groundTruth)
    : null;

  return (
    <div className="space-y-4">
      {/* Action Toolbar */}
      <div className="glass-card p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <Inbox className="w-4 h-4 text-indigo-700" />
            <h1 className="text-lg font-bold text-slate-900">Inbox &amp; Test Datasets</h1>
          </div>
          <p className="text-xs text-slate-600 font-medium mt-0.5 tabular-nums">
            {emails.length} total · {pendingCount} pending · {processedCount} triaged · {labeledCount} ground-truth labeled · {dndCount} do-not-decide cases
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={downloadCapstoneCSVTemplate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold glass-btn border border-slate-300 hover:border-indigo-400 transition-all cursor-pointer whitespace-nowrap shrink-0"
            title="Download CSV template with ground-truth, complexity, ambiguity, and do-not-decide columns"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>CSV Template</span>
          </button>

          <button
            onClick={onOpenCompose}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold glass-btn border border-slate-300 hover:border-indigo-400 transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <PenSquare className="w-3.5 h-3.5 text-indigo-600" />
            <span>Write Email</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold glass-btn border border-slate-300 hover:border-indigo-400 transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5 text-slate-600" />
            <span>Upload Dataset (.csv/.json/.xlsx)</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv,.xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e) => onImportFiles(e.target.files)}
          />

          {isProcessing ? (
            <button
              onClick={onStopProcessing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-rose-600 text-white hover:bg-rose-500 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Stop Processing</span>
            </button>
          ) : (
            <button
              onClick={onProcessAll}
              disabled={pendingCount === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold glass-btn-primary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Process Pending</span>
            </button>
          )}

          {emails.length > 0 && (
            <button
              onClick={onClearAll}
              className="p-2 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors cursor-pointer"
              title="Clear all emails"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Empty State or Two-Pane Layout */}
      {emails.length === 0 ? (
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="glass-card p-12 text-center border-2 border-dashed border-indigo-200 hover:border-indigo-400 transition-all cursor-pointer group bg-white/70"
        >
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 mx-auto flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
            <Upload className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">
            No emails in triage queue
          </h3>
          <p className="text-xs text-slate-600 max-w-lg mx-auto mb-5 leading-relaxed font-medium">
            Drag and drop a labeled CSV, JSON, or Excel dataset (supporting 50+ dev and 100+ final test items with ground-truth columns), download the Capstone CSV Template, or write an email manually.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenCompose();
              }}
              className="px-4 py-2 text-xs font-bold rounded-full glass-btn-primary cursor-pointer"
            >
              Write Your First Email
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                downloadCapstoneCSVTemplate();
              }}
              className="px-4 py-2 text-xs font-semibold rounded-full glass-btn border border-slate-300 cursor-pointer"
            >
              Download CSV Template
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Dataset Split Filter */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1 p-1 bg-white/80 border border-slate-200 rounded-xl text-xs">
              {(
                [
                  { id: 'all', label: `All (${emails.length})` },
                  { id: 'dev', label: `Dev Split (${emails.filter((e) => e.groundTruth?.split === 'dev').length})` },
                  { id: 'test', label: `Final Test (${emails.filter((e) => e.groundTruth?.split === 'test').length})` },
                  { id: 'dnd', label: `Do-Not-Decide (${dndCount})` }
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSplitFilter(tab.id)}
                  className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    splitFilter === tab.id
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              onClick={onNavigateToAgents}
              className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer"
            >
              <span>Configure Multi-Model 3x Benchmark in Agents</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Email List Column */}
            <div className="lg:col-span-5 space-y-2 max-h-[640px] overflow-y-auto pr-1">
              {filteredEmails.map((e) => {
                const isSelected = selectedEmail?.id === e.id;
                const isFlagged = e.status === 'Security_Flagged' || e.slate?.agent1_sanitizer?.is_safe === false;
                const hasFailure = e.slate?.execution_meta?.failureType && e.slate.execution_meta.failureType !== 'NONE';
                const ev = e.slate ? evaluateSlateAgainstGroundTruth(e.slate, e.groundTruth) : null;

                return (
                  <div
                    key={e.id}
                    onClick={() => onSelectEmail(e.id)}
                    className={`p-3.5 rounded-2xl cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-white border-indigo-500 shadow-md ring-1 ring-indigo-500/20'
                        : 'bg-white/80 border-slate-200 hover:border-indigo-300 hover:bg-white shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-bold text-xs text-slate-900 truncate max-w-[220px]">
                        {e.from}
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap tabular-nums">
                        {e.datasetName || 'Manual'}
                        {e.groundTruth?.split ? ` · ${e.groundTruth.split}` : ''}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-slate-800 truncate mb-1">
                      {e.subject}
                    </p>

                    <p className="text-[11px] text-slate-600 line-clamp-2 mb-2 font-mono">
                      {e.body}
                    </p>

                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[11px]">
                      <div className="flex items-center gap-2 flex-wrap font-medium">
                        {hasFailure ? (
                          <span className="text-red-700 font-bold flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            {e.slate?.execution_meta?.failureType}
                          </span>
                        ) : e.status === 'Processed' ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Triaged
                          </span>
                        ) : e.status === 'Processing' ? (
                          <span className="text-indigo-700 font-semibold">
                            Agent {(e.activeStepIndex || 0) + 1}...
                          </span>
                        ) : (
                          <span className="text-slate-500">Pending</span>
                        )}

                        {isFlagged && (
                          <span className="text-red-700 font-bold">· Security Threat</span>
                        )}

                        {ev?.hasGroundTruth && ev.categoryCorrect !== null && (
                          <span className={ev.categoryCorrect ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                            · {ev.categoryCorrect ? 'Match' : 'Mismatch'}
                          </span>
                        )}

                        {e.groundTruth?.is_do_not_decide && (
                          <span className="text-amber-700 font-semibold">· Do-Not-Decide</span>
                        )}
                      </div>

                      <button
                        onClick={(evt) => {
                          evt.stopPropagation();
                          onDeleteSingle(e.id);
                        }}
                        className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                        title="Delete email"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Email Reader & Blackboard Slate Inspection Column */}
            <div className="lg:col-span-7">
              {selectedEmail ? (
                <div className="glass-card p-5 space-y-4">
                  <div className="flex items-start justify-between border-b border-slate-200 pb-3 gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-slate-900">
                        {selectedEmail.subject}
                      </h2>
                      <div className="flex items-center gap-2 text-xs text-slate-600 mt-1 flex-wrap">
                        <span>From: <strong className="text-slate-800">{selectedEmail.from}</strong></span>
                        <span aria-hidden="true">·</span>
                        <span>{selectedEmail.datasetName || 'General Queue'}</span>
                        {selectedEmail.groundTruth?.complexity && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{selectedEmail.groundTruth.complexity}</span>
                          </>
                        )}
                        {selectedEmail.groundTruth?.ambiguity && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{selectedEmail.groundTruth.ambiguity}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="flex items-center gap-1 tabular-nums">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {new Date(selectedEmail.receivedAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => onProcessSingle(selectedEmail.id)}
                      disabled={isProcessing}
                      className="flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold glass-btn-primary cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Play className="w-3 h-3" />
                      <span>{selectedEmail.slate ? 'Re-Triage' : 'Run Triage'}</span>
                    </button>
                  </div>

                  {/* Frozen Ground Truth Summary if labeled */}
                  {selectedEmail.groundTruth && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                      <div className="font-bold text-slate-800">
                        Frozen Ground Truth Reference
                      </div>
                      <div className="text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                        {selectedEmail.groundTruth.expected_category && (
                          <span>Category: <strong className="text-slate-900">{selectedEmail.groundTruth.expected_category}</strong></span>
                        )}
                        {selectedEmail.groundTruth.expected_queue && (
                          <span>Queue: <strong className="font-mono text-slate-900">{selectedEmail.groundTruth.expected_queue}</strong></span>
                        )}
                        {selectedEmail.groundTruth.expected_urgency !== undefined && (
                          <span>Urgency: <strong className="text-slate-900">{selectedEmail.groundTruth.expected_urgency}/5</strong></span>
                        )}
                        {selectedEmail.groundTruth.expected_human_review !== undefined && (
                          <span>Human Review: <strong className="text-slate-900">{selectedEmail.groundTruth.expected_human_review ? 'Yes' : 'No'}</strong></span>
                        )}
                        {selectedEmail.groundTruth.is_do_not_decide && (
                          <span className="text-amber-700 font-bold">Do-Not-Decide Case</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Email Raw Body */}
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-slate-600 block">
                      Incoming Message Content
                    </span>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed max-h-52 overflow-y-auto">
                      {selectedEmail.body}
                    </div>
                  </div>

                  {/* Slate Inspection Card */}
                  {selectedEmail.slate && (
                    <div className="mt-4 p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-xs font-bold text-indigo-900">
                          Blackboard Slate Output · {selectedEmail.slate.execution_meta?.model || 'LLM'} ({selectedEmail.slate.execution_meta?.classifierMode === 'code' ? 'Code Baseline' : 'LLM Classifier'})
                        </span>
                        <button
                          onClick={onNavigateToAgents}
                          className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>Inspect Pipeline</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>

                      {selectedEmail.slate.execution_meta?.failureType &&
                        selectedEmail.slate.execution_meta.failureType !== 'NONE' && (
                          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-300 text-xs text-rose-800 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                            <div>
                              <span className="font-bold">Model Execution Failure ({selectedEmail.slate.execution_meta.failureType}): </span>
                              <span>{selectedEmail.slate.execution_meta.failureDetail}</span>
                            </div>
                          </div>
                        )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                          <span className="text-[11px] font-semibold text-slate-500 block mb-0.5">Agent 1: Security &amp; PII</span>
                          <div className="flex items-center gap-2">
                            {selectedEmail.slate.agent1_sanitizer?.is_safe ? (
                              <span className="text-emerald-700 font-bold flex items-center gap-1">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Payload Safe
                              </span>
                            ) : (
                              <span className="text-red-700 font-bold flex items-center gap-1">
                                <ShieldAlert className="w-3.5 h-3.5 text-red-600" /> {selectedEmail.slate.agent1_sanitizer?.security_flag}
                              </span>
                            )}
                            {selectedEmail.slate.agent1_sanitizer?.pii_redacted && (
                              <span className="text-rose-700 font-medium">· PII Scrubbed</span>
                            )}
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                          <span className="text-[11px] font-semibold text-slate-500 block mb-0.5">Agent 2: Classification</span>
                          <div className="font-semibold text-slate-900">
                            {selectedEmail.slate.agent2_classifier?.category} ·{' '}
                            <span className="text-indigo-700">{selectedEmail.slate.agent2_classifier?.intent}</span>
                          </div>
                          {selectedEval?.hasGroundTruth && selectedEval.categoryCorrect !== null && (
                            <div className={`text-[11px] font-bold mt-0.5 ${selectedEval.categoryCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {selectedEval.categoryCorrect ? 'Matches Expected Category' : `Expected: ${selectedEmail.groundTruth?.expected_category}`}
                            </div>
                          )}
                        </div>

                        <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                          <span className="text-[11px] font-semibold text-slate-500 block mb-0.5">Agent 3: Routing &amp; CRM</span>
                          <div className="font-semibold text-slate-900 font-mono text-[11px]">
                            {selectedEmail.slate.agent3_router?.target_queue} ({selectedEmail.slate.agent3_router?.crm_action})
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                          <span className="text-[11px] font-semibold text-slate-500 block mb-0.5">Agent 4: Reply &amp; Review</span>
                          <div className="font-semibold text-slate-900">
                            {selectedEmail.slate.agent4_reply?.draft_status} · Human Review:{' '}
                            {selectedEmail.slate.agent2_classifier?.needs_human_review ? 'Yes' : 'No'}
                          </div>
                        </div>
                      </div>

                      {selectedEmail.slate.agent1_sanitizer?.sanitized_body && (
                        <div className="text-xs space-y-1">
                          <span className="text-[11px] font-semibold text-slate-600">
                            Scrubbed &amp; Redacted Body (Passed to Downstream Agents)
                          </span>
                          <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-[11px] font-mono leading-relaxed max-h-32 overflow-y-auto text-slate-900">
                            {renderSanitizedText(selectedEmail.slate.agent1_sanitizer.sanitized_body)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="glass-card p-12 text-center text-slate-500 text-xs bg-white/70">
                  Select an email from the list to inspect or triage it.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
