import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { InboxTab } from './components/InboxTab';
import { AgentsTab } from './components/AgentsTab';
import { ForwardingTab } from './components/ForwardingTab';
import { AnalyticsDrawer } from './components/AnalyticsDrawer';
import { ComposeModal } from './components/ComposeModal';
import { EmailItem, LLMConfig, BlackboardSlate } from './types/triage';
import { DEFAULT_LLM_CONFIG } from './constants/agents';

export default function App() {
  const [activeTab, setActiveTab] = useState<'inbox' | 'agents' | 'forwarding'>('inbox');
  
  // Emails start empty strictly per prompt constraint:
  // "Do not add unnesscary test data or fill in any for examples, that is for the user to do."
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  const [llmConfig, setLLMConfig] = useState<LLMConfig>(DEFAULT_LLM_CONFIG);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeAgentIndex, setActiveAgentIndex] = useState<number>(0);

  const [feedEvents, setFeedEvents] = useState<
    Array<{ time: string; agent: string; message: string; type: 'info' | 'warn' | 'threat' | 'success' }>
  >([]);

  // Log feed event helper
  const addFeedEvent = (agent: string, message: string, type: 'info' | 'warn' | 'threat' | 'success' = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setFeedEvents((prev) => [{ time, agent, message, type }, ...prev.slice(0, 49)]);
  };

  // Add custom email from compose modal
  const handleAddEmail = (data: { from: string; subject: string; body: string }) => {
    const newEmail: EmailItem = {
      id: Math.random().toString(36).slice(2, 10),
      from: data.from,
      subject: data.subject,
      body: data.body,
      receivedAt: Date.now(),
      status: 'Pending'
    };
    setEmails((prev) => [newEmail, ...prev]);
    setSelectedEmailId(newEmail.id);
    addFeedEvent('System', `New incoming payload queued from ${data.from}: "${data.subject}"`, 'info');
  };

  // Process a single email through the 5-agent pipeline
  const handleProcessSingle = async (emailId: string) => {
    const target = emails.find((e) => e.id === emailId);
    if (!target) return;

    setIsProcessing(true);
    addFeedEvent('Pipeline', `Starting 5-agent triage for: "${target.subject}" using ${llmConfig.provider} (${llmConfig.model})`, 'info');

    // Mark email as processing
    setEmails((prev) =>
      prev.map((e) => (e.id === emailId ? { ...e, status: 'Processing', activeStepIndex: 0 } : e))
    );

    // Simulate animated step transitions for live visual feedback
    const stepDelays = [200, 400, 600, 800];
    for (let i = 0; i < 4; i++) {
      setActiveAgentIndex(i);
      setEmails((prev) =>
        prev.map((e) => (e.id === emailId ? { ...e, activeStepIndex: i } : e))
      );
      await new Promise((r) => setTimeout(r, stepDelays[i]));
    }
    setActiveAgentIndex(4);

    try {
      const response = await fetch('/api/triage/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: {
            from: target.from,
            subject: target.subject,
            body: target.body
          },
          config: llmConfig
        })
      });

      const result = await response.json();

      if (result.success && result.slate) {
        const slate: BlackboardSlate = result.slate;
        const isSafe = slate.agent1_sanitizer?.is_safe !== false;

        // Log agent events to feed
        if (!isSafe) {
          addFeedEvent(
            'Agent 1: Sanitizer',
            `SECURITY ALERT: ${slate.agent1_sanitizer?.security_flag} detected! Payload quarantined.`,
            'threat'
          );
        } else {
          addFeedEvent(
            'Agent 1: Sanitizer',
            `Clean payload. PII scrubbed: ${slate.agent1_sanitizer?.pii_redacted ? 'Yes' : 'None detected'}`,
            'success'
          );
        }

        addFeedEvent(
          'Agent 2: Classifier',
          `Category: "${slate.agent2_classifier?.category}" · Intent: "${slate.agent2_classifier?.intent}" (Urgency ${slate.agent2_classifier?.urgency}/5)`,
          'info'
        );

        addFeedEvent(
          'Agent 3: Router',
          `Dispatched to queue: [${slate.agent3_router?.target_queue}] · Action: ${slate.agent3_router?.crm_action}`,
          'info'
        );

        addFeedEvent(
          'Agent 4: Drafter',
          `Response drafted with status: [${slate.agent4_reply?.draft_status}]`,
          'info'
        );

        addFeedEvent(
          'Agent 5: Telemetry',
          `Consumed ${slate.agent5_telemetry?.telemetry_summary.total_input_tokens} in / ${slate.agent5_telemetry?.telemetry_summary.total_output_tokens} out tokens. Cost: $${slate.agent5_telemetry?.telemetry_summary.total_pipeline_cost_usd}`,
          'success'
        );

        setEmails((prev) =>
          prev.map((e) =>
            e.id === emailId
              ? {
                  ...e,
                  status: isSafe ? 'Processed' : 'Security_Flagged',
                  activeStepIndex: undefined,
                  slate
                }
              : e
          )
        );
      } else {
        throw new Error(result.error || 'Server error processing triage');
      }
    } catch (err: any) {
      addFeedEvent('Error', `Triage failed: ${err.message}`, 'threat');
      setEmails((prev) =>
        prev.map((e) =>
          e.id === emailId ? { ...e, status: 'Error', error: err.message, activeStepIndex: undefined } : e
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Process all pending emails in sequence
  const handleProcessAll = async () => {
    const pending = emails.filter((e) => e.status === 'Pending');
    if (pending.length === 0 || isProcessing) return;

    setActiveTab('agents');
    for (const email of pending) {
      setSelectedEmailId(email.id);
      await handleProcessSingle(email.id);
    }
  };

  // Clear all emails
  const handleClearAll = () => {
    if (window.confirm('Clear all emails from the triage queue?')) {
      setEmails([]);
      setSelectedEmailId(null);
      setFeedEvents([]);
    }
  };

  // Delete single email
  const handleDeleteSingle = (id: string) => {
    setEmails((prev) => prev.filter((e) => e.id !== id));
    if (selectedEmailId === id) {
      const remaining = emails.filter((e) => e.id !== id);
      setSelectedEmailId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  // File import (JSON or CSV)
  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await file.text();
        let imported: Array<{ from?: string; subject?: string; body?: string }> = [];

        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          imported = Array.isArray(parsed) ? parsed : [parsed];
        } else if (file.name.endsWith('.csv')) {
          const lines = text.split('\n').filter((l) => l.trim().length > 0);
          if (lines.length > 1) {
            // Assume header is line 0
            for (let j = 1; j < lines.length; j++) {
              const parts = lines[j].split(',');
              if (parts.length >= 3) {
                imported.push({
                  from: parts[0].replace(/^"|"$/g, '').trim(),
                  subject: parts[1].replace(/^"|"$/g, '').trim(),
                  body: parts.slice(2).join(',').replace(/^"|"$/g, '').trim()
                });
              }
            }
          }
        }

        const newItems: EmailItem[] = imported.map((item) => ({
          id: Math.random().toString(36).slice(2, 10),
          from: item.from || 'imported@client.com',
          subject: item.subject || '(Imported Subject)',
          body: item.body || '',
          receivedAt: Date.now(),
          status: 'Pending'
        }));

        if (newItems.length > 0) {
          setEmails((prev) => [...newItems, ...prev]);
          setSelectedEmailId(newItems[0].id);
          addFeedEvent('Import', `Imported ${newItems.length} records from ${file.name}`, 'success');
        }
      } catch (err: any) {
        alert(`Failed to import ${file.name}: ${err.message}`);
      }
    }
  };

  const selectedEmail = emails.find((e) => e.id === selectedEmailId) || (emails.length > 0 ? emails[0] : null);
  const processedCount = emails.filter((e) => e.status === 'Processed' || e.status === 'Security_Flagged').length;

  return (
    <div className="min-h-screen flex flex-col transition-colors selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        llmConfig={llmConfig}
        onOpenAnalytics={() => setIsAnalyticsOpen(true)}
        emailCount={emails.length}
        processedCount={processedCount}
        isProcessing={isProcessing}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8">
        {activeTab === 'inbox' && (
          <InboxTab
            emails={emails}
            selectedEmailId={selectedEmailId}
            onSelectEmail={(id) => setSelectedEmailId(id)}
            onOpenCompose={() => setIsComposeOpen(true)}
            onProcessAll={handleProcessAll}
            onProcessSingle={handleProcessSingle}
            onClearAll={handleClearAll}
            onDeleteSingle={handleDeleteSingle}
            onImportFiles={handleImportFiles}
            isProcessing={isProcessing}
            onNavigateToAgents={() => setActiveTab('agents')}
          />
        )}

        {activeTab === 'agents' && (
          <AgentsTab
            llmConfig={llmConfig}
            setLLMConfig={setLLMConfig}
            selectedEmail={selectedEmail}
            feedEvents={feedEvents}
            onClearFeed={() => setFeedEvents([])}
            isProcessing={isProcessing}
            activeAgentIndex={activeAgentIndex}
          />
        )}

        {activeTab === 'forwarding' && (
          <ForwardingTab
            emails={emails}
            selectedEmailId={selectedEmailId}
            onSelectEmail={(id) => setSelectedEmailId(id)}
            onRegenerateReply={handleProcessSingle}
          />
        )}
      </main>

      {/* Compose Email Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onSubmit={handleAddEmail}
      />

      {/* Telemetry & Analytics Sliding Drawer */}
      <AnalyticsDrawer
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        emails={emails}
        activeModel={llmConfig.model}
      />
    </div>
  );
}
