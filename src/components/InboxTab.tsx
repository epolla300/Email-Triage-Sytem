import React, { useRef } from 'react';
import {
  Inbox,
  PenSquare,
  Play,
  Upload,
  Trash2,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Sparkles,
  ArrowRight,
  CheckCircle2
} from 'lucide-react';
import { EmailItem } from '../types/triage';
import { renderSanitizedText } from '../utils/redaction';

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
  onNavigateToAgents
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedEmail = emails.find((e) => e.id === selectedEmailId) || (emails.length > 0 ? emails[0] : null);

  const pendingCount = emails.filter((e) => e.status === 'Pending').length;
  const processedCount = emails.filter((e) => e.status === 'Processed' || e.status === 'Security_Flagged').length;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onImportFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-4">
      {/* Action Toolbar */}
      <div className="glass-card p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700">
            <Inbox className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>Inbox</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {emails.length} {emails.length === 1 ? 'email' : 'emails'}
              </span>
            </h1>
            <p className="text-xs text-slate-600 font-medium">
              {pendingCount} pending triage · {processedCount} triaged
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpenCompose}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold glass-btn border border-slate-300 hover:border-indigo-400 transition-all cursor-pointer"
          >
            <PenSquare className="w-3.5 h-3.5 text-indigo-600" />
            <span>Write your own email</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold glass-btn border border-slate-300 hover:border-indigo-400 transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-slate-600" />
            <span>Upload Dataset (.json/.csv)</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv"
            multiple
            className="hidden"
            onChange={(e) => onImportFiles(e.target.files)}
          />

          <button
            onClick={onProcessAll}
            disabled={pendingCount === 0 || isProcessing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold glass-btn-primary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Play className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
            <span>{isProcessing ? 'Processing...' : 'Process all'}</span>
          </button>

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

      {/* Drag & Drop banner if empty */}
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
          <p className="text-xs text-slate-600 max-w-md mx-auto mb-5 leading-relaxed font-medium">
            Drag & drop a custom JSON or CSV file here, click to browse files, or click <strong>Write your own email</strong> to compose a message and test the 5-agent pipeline.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenCompose();
              }}
              className="px-4 py-2 text-xs font-bold rounded-full glass-btn-primary cursor-pointer"
            >
              ✎ Write Your First Email
            </button>
            <span className="text-xs text-slate-500 font-medium">or browse files (.json, .csv)</span>
          </div>
        </div>
      ) : (
        /* Two-Pane Layout: Email List + Inspection Viewer */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Email List Column */}
          <div className="lg:col-span-5 space-y-2 max-h-[640px] overflow-y-auto pr-1">
            {emails.map((e) => {
              const isSelected = selectedEmail?.id === e.id;
              const isFlagged = e.status === 'Security_Flagged' || e.slate?.agent1_sanitizer?.is_safe === false;

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
                    <span className="font-bold text-xs text-slate-900 truncate max-w-[200px]">
                      {e.from}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">
                      {new Date(e.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-slate-800 truncate mb-1">
                    {e.subject}
                  </p>

                  <p className="text-[11px] text-slate-600 line-clamp-2 mb-2 font-mono">
                    {e.body}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Status chip */}
                      {e.status === 'Processed' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Processed
                        </span>
                      )}
                      {e.status === 'Processing' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse">
                          Agent {(e.activeStepIndex || 0) + 1}...
                        </span>
                      )}
                      {e.status === 'Pending' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          Pending
                        </span>
                      )}
                      {isFlagged && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-300">
                          <ShieldAlert className="w-2.5 h-2.5" />
                          Security Threat
                        </span>
                      )}

                      {/* Urgency Badge if triaged */}
                      {e.slate?.agent2_classifier?.urgency && (
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                            e.slate.agent2_classifier.urgency >= 4
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          Urgency {e.slate.agent2_classifier.urgency}/5
                        </span>
                      )}
                    </div>

                    <button
                      onClick={(evt) => {
                        evt.stopPropagation();
                        onDeleteSingle(e.id);
                      }}
                      className="p-1 text-slate-400 hover:text-red-600 transition-colors"
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
                {/* Email Header */}
                <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      {selectedEmail.subject}
                    </h2>
                    <div className="flex items-center gap-2 text-xs text-slate-600 mt-1">
                      <span>From: <strong className="text-slate-800">{selectedEmail.from}</strong></span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {new Date(selectedEmail.receivedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onProcessSingle(selectedEmail.id)}
                      disabled={isProcessing}
                      className="flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold glass-btn-primary cursor-pointer"
                    >
                      <Play className="w-3 h-3" />
                      <span>{selectedEmail.slate ? 'Re-Triage' : 'Run Triage'}</span>
                    </button>
                  </div>
                </div>

                {/* Email Raw Body */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Incoming Message Content:
                  </span>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                    {selectedEmail.body}
                  </div>
                </div>

                {/* Slate Inspection Card if triaged */}
                {selectedEmail.slate && (
                  <div className="mt-4 p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        Blackboard Slate Results
                      </span>
                      <button
                        onClick={onNavigateToAgents}
                        className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Inspect in Pipeline</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Agent 1 Security & PII Banner */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-500 block mb-0.5">AGENT 1: SECURITY</span>
                        <div className="flex items-center gap-1.5">
                          {selectedEmail.slate.agent1_sanitizer?.is_safe ? (
                            <span className="text-emerald-700 font-bold flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Payload Safe
                            </span>
                          ) : (
                            <span className="text-red-700 font-bold flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5 text-red-600" /> Flagged: {selectedEmail.slate.agent1_sanitizer?.security_flag}
                            </span>
                          )}
                          {selectedEmail.slate.agent1_sanitizer?.pii_redacted && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-50 text-red-700 border border-red-200 font-medium">
                              PII Scrubbed
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Agent 2 Classification */}
                      <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-500 block mb-0.5">AGENT 2: CLASSIFICATION</span>
                        <div className="font-semibold text-slate-900">
                          {selectedEmail.slate.agent2_classifier?.category} · <span className="text-indigo-700">{selectedEmail.slate.agent2_classifier?.intent}</span>
                        </div>
                      </div>

                      {/* Agent 3 Routing */}
                      <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-500 block mb-0.5">AGENT 3: ROUTING & CRM</span>
                        <div className="font-semibold text-slate-900">
                          {selectedEmail.slate.agent3_router?.target_queue} ({selectedEmail.slate.agent3_router?.crm_action})
                        </div>
                      </div>

                      {/* Agent 4 Reply Status */}
                      <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-500 block mb-0.5">AGENT 4: REPLY STATUS</span>
                        <div className="font-semibold text-slate-900">
                          {selectedEmail.slate.agent4_reply?.draft_status}
                        </div>
                      </div>
                    </div>

                    {/* Sanitized Text snippet with Redactions */}
                    {selectedEmail.slate.agent1_sanitizer?.sanitized_body && (
                      <div className="text-xs space-y-1">
                        <span className="text-[10px] font-semibold text-slate-600">
                          Scrubbed & Redacted Body (Passed to Downstream Agents):
                        </span>
                        <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-[11px] font-mono leading-relaxed max-h-32 overflow-y-auto text-slate-900 shadow-xs">
                          {renderSanitizedText(selectedEmail.slate.agent1_sanitizer.sanitized_body)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="glass-card p-12 text-center text-slate-500 text-xs bg-white/70">
                Select an email from the left list to read or triage it.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
