import React, { useState } from 'react';
import {
  Send,
  CheckCircle,
  AlertTriangle,
  MessageSquare,
  Copy,
  ChevronDown,
  ChevronRight,
  BellRing,
  Database
} from 'lucide-react';
import { EmailItem } from '../types/triage';

interface ForwardingTabProps {
  emails: EmailItem[];
  selectedEmailId: string | null;
  onSelectEmail: (id: string) => void;
  onRegenerateReply?: (emailId: string) => void;
}

const DEPARTMENTS = [
  { id: 'Sales / High-Value', label: 'Sales / High-Value', icon: '💼' },
  { id: 'Customer Service', label: 'Customer Service & Support', icon: '🎧' },
  { id: 'Admin / Operations', label: 'Admin / Operations & Finance', icon: '📋' },
  { id: 'Junk / Low-Priority', label: 'Junk / Low-Priority / Quarantine', icon: '🛡️' }
];

export const ForwardingTab: React.FC<ForwardingTabProps> = ({
  emails,
  selectedEmailId,
  onSelectEmail,
  onRegenerateReply
}) => {
  const [priorityOrder, setPriorityOrder] = useState(true);
  const [openDepts, setOpenDepts] = useState<Record<string, boolean>>({
    'Sales / High-Value': true,
    'Customer Service': true,
    'Admin / Operations': true,
    'Junk / Low-Priority': true
  });
  const [editedBody, setEditedBody] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [sentNotice, setSentNotice] = useState<string | null>(null);

  const processedEmails = emails.filter((e) => e.status === 'Processed' || e.status === 'Security_Flagged');

  const selectedEmail =
    emails.find((e) => e.id === selectedEmailId) || (processedEmails.length > 0 ? processedEmails[0] : null);

  // Sync draft reply into editor
  React.useEffect(() => {
    if (selectedEmail?.slate?.agent4_reply?.body_text) {
      setEditedBody(selectedEmail.slate.agent4_reply.body_text);
    } else {
      setEditedBody('');
    }
    setSentNotice(null);
  }, [selectedEmail?.id, selectedEmail?.slate?.agent4_reply?.body_text]);

  const toggleDept = (deptId: string) => {
    setOpenDepts((prev) => ({ ...prev, [deptId]: !prev[deptId] }));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editedBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApproveSend = () => {
    setSentNotice(`Response successfully dispatched to ${selectedEmail?.from} via ${selectedEmail?.slate?.agent3_router?.assigned_team || 'designated team'}!`);
    setTimeout(() => setSentNotice(null), 4000);
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <div className="glass-card p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700">
            <Send className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>Department Forwarding & Reply Orchestrator</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {processedEmails.length} Triaged
              </span>
            </h1>
            <p className="text-xs text-slate-600 font-medium">
              Router & Action Agent queue dispatch with Reply Drafter sign-off workflow
            </p>
          </div>
        </div>

        {/* Priority Order Switcher */}
        <div className="flex items-center gap-3 text-xs font-semibold text-slate-700">
          <span className={!priorityOrder ? 'text-indigo-700 font-bold' : ''}>
            Received order
          </span>
          <button
            onClick={() => setPriorityOrder(!priorityOrder)}
            className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
              priorityOrder ? 'bg-indigo-600' : 'bg-slate-300'
            }`}
            aria-label="Toggle priority order"
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                priorityOrder ? 'left-6' : 'left-1'
              }`}
            />
          </button>
          <span className={priorityOrder ? 'text-indigo-700 font-bold' : ''}>
            AI priority order
          </span>
        </div>
      </div>

      {processedEmails.length === 0 ? (
        <div className="glass-card p-12 text-center text-slate-600 bg-white/70">
          <p className="text-sm font-bold text-slate-800 mb-2">No processed emails in forwarding queues yet.</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
            Go to the Inbox tab and click <strong>Process all</strong> or write an email to see intelligent departmental routing.
          </p>
        </div>
      ) : (
        /* Two-Pane Layout: Departments List + Forwarding / Reply View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Department Accordions */}
          <div className="lg:col-span-5 space-y-3 max-h-[680px] overflow-y-auto pr-1">
            {DEPARTMENTS.map((dept) => {
              let deptEmails = processedEmails.filter((e) => {
                const cat = e.slate?.agent2_classifier?.category;
                if (dept.id === 'Junk / Low-Priority') {
                  return cat === 'Junk / Low-Priority' || e.slate?.agent1_sanitizer?.is_safe === false;
                }
                return cat === dept.id;
              });

              if (priorityOrder) {
                deptEmails = [...deptEmails].sort(
                  (a, b) => (b.slate?.agent2_classifier?.urgency || 0) - (a.slate?.agent2_classifier?.urgency || 0)
                );
              } else {
                deptEmails = [...deptEmails].sort((a, b) => a.receivedAt - b.receivedAt);
              }

              const isOpen = openDepts[dept.id] ?? true;

              return (
                <div key={dept.id} className="glass-card overflow-hidden border border-slate-200/90 shadow-2xs">
                  <button
                    onClick={() => toggleDept(dept.id)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{dept.icon}</span>
                      <span className="text-xs font-bold text-slate-900">
                        {dept.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {deptEmails.length}
                      </span>
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 divide-y divide-slate-100 bg-white">
                      {deptEmails.length === 0 ? (
                        <div className="p-3 text-[11px] text-slate-500 text-center italic font-medium">
                          No emails assigned to this queue
                        </div>
                      ) : (
                        deptEmails.map((e) => {
                          const isSel = selectedEmail?.id === e.id;
                          const urgency = e.slate?.agent2_classifier?.urgency || 1;
                          const priorityTag = e.slate?.agent3_router?.priority_tag || 'NORMAL';

                          return (
                            <div
                              key={e.id}
                              onClick={() => onSelectEmail(e.id)}
                              className={`p-3 cursor-pointer transition-all ${
                                isSel
                                  ? 'bg-indigo-50 border-l-4 border-indigo-600 font-medium'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-xs font-bold text-slate-900 truncate max-w-[180px]">
                                  {e.subject}
                                </span>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                                    priorityTag === 'URGENT'
                                      ? 'bg-red-100 text-red-800 border border-red-300'
                                      : priorityTag === 'HIGH'
                                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                                  }`}
                                >
                                  {priorityTag}
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-slate-600 font-medium">
                                <span className="truncate max-w-[160px]">{e.from}</span>
                                <span>Urgency: {urgency}/5</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right Column: Forwarding Metadata & Reply Drafter */}
          <div className="lg:col-span-7">
            {selectedEmail ? (
              <div className="glass-card p-5 space-y-4">
                {/* Header */}
                <div className="border-b border-slate-200 pb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Forwarding Transaction State
                    </span>
                    {selectedEmail.slate?.agent2_classifier?.needs_human_review && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        Human Review Flagged
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-bold text-slate-900 mt-1">
                    {selectedEmail.subject}
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5 font-medium">
                    From: <span className="font-semibold text-slate-800">{selectedEmail.from}</span>
                  </p>
                </div>

                {/* Agent 3 Operational Routing Plan Card */}
                {selectedEmail.slate?.agent3_router && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 block">
                      Agent 3: Operational Routing Payload
                    </span>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 font-medium block">Target Queue</span>
                        <span className="font-bold text-slate-900 truncate block">
                          {selectedEmail.slate.agent3_router.target_queue}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-medium block">Assigned Team</span>
                        <span className="font-bold text-slate-900 truncate block">
                          {selectedEmail.slate.agent3_router.assigned_team}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-medium block">Alert Channel</span>
                        <span className="font-bold text-indigo-700 flex items-center gap-1">
                          <BellRing className="w-3 h-3" />
                          {selectedEmail.slate.agent3_router.notification_channel}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-medium block">CRM Action</span>
                        <span className="font-bold text-emerald-700 flex items-center gap-1">
                          <Database className="w-3 h-3" />
                          {selectedEmail.slate.agent3_router.crm_action}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-700 italic pt-1 border-t border-slate-200 font-medium">
                      Rationale: "{selectedEmail.slate.agent3_router.routing_reason}"
                    </p>
                  </div>
                )}

                {/* Extracted Metadata Chips */}
                {selectedEmail.slate?.agent2_classifier?.extracted_metadata && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {selectedEmail.slate.agent2_classifier.extracted_metadata.account_id && (
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 font-mono text-[11px] border border-indigo-200 font-semibold">
                        Acct: {selectedEmail.slate.agent2_classifier.extracted_metadata.account_id}
                      </span>
                    )}
                    {selectedEmail.slate.agent2_classifier.extracted_metadata.requested_dates && (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] border border-emerald-200 font-semibold">
                        Date: {selectedEmail.slate.agent2_classifier.extracted_metadata.requested_dates}
                      </span>
                    )}
                    {selectedEmail.slate.agent2_classifier.extracted_metadata.party_size && (
                      <span className="px-2.5 py-1 rounded-lg bg-violet-50 text-violet-800 text-[11px] border border-violet-200 font-semibold">
                        Party Size: {selectedEmail.slate.agent2_classifier.extracted_metadata.party_size}
                      </span>
                    )}
                    {selectedEmail.slate.agent2_classifier.extracted_metadata.estimated_value && (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 text-[11px] border border-amber-200 font-semibold">
                        Value: {selectedEmail.slate.agent2_classifier.extracted_metadata.estimated_value}
                      </span>
                    )}
                  </div>
                )}

                {/* Agent 4 Reply Drafter Output */}
                {selectedEmail.slate?.agent4_reply ? (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-indigo-700" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                          Suggested Response (Agent 4)
                        </h3>
                      </div>

                      {/* Draft Status badge */}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          selectedEmail.slate.agent4_reply.draft_status === 'AUTO_SEND_ELIGIBLE'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : selectedEmail.slate.agent4_reply.draft_status === 'READY_FOR_APPROVAL'
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-purple-100 text-purple-900 border border-purple-300'
                        }`}
                      >
                        {selectedEmail.slate.agent4_reply.draft_status}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 flex items-center justify-between font-medium">
                      <span>Template: <strong>{selectedEmail.slate.agent4_reply.template_used}</strong></span>
                      <span className="text-amber-700">Review manual placeholders: [Insert ...]</span>
                    </div>

                    <textarea
                      value={editedBody}
                      onChange={(e) => setEditedBody(e.target.value)}
                      rows={7}
                      className="w-full p-3 text-xs rounded-xl glass-input font-mono leading-relaxed resize-y border border-slate-300 bg-white text-slate-900 shadow-2xs focus:ring-2 focus:ring-indigo-100"
                    />

                    {sentNotice && (
                      <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-2 border border-emerald-300">
                        <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                        <span>{sentNotice}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full glass-btn text-slate-700 border-slate-300 hover:text-slate-900 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copied ? 'Copied!' : 'Copy to Clipboard'}</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleApproveSend}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-full glass-btn-primary shadow-xs cursor-pointer"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Approve & Send</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300 font-medium">
                    Run triage to generate automated suggested response.
                  </div>
                )}
              </div>
            ) : (
              <div className="glass-card p-12 text-center text-xs text-slate-500 bg-white/70">
                Select an email from the left department queues to view routing and response draft.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
