import React, { useState } from 'react';
import {
  CheckCircle,
  Settings,
  Terminal,
  ShieldAlert,
  Zap,
  AlertCircle
} from 'lucide-react';
import { AGENT_DEFINITIONS, AVAILABLE_PROVIDERS } from '../constants/agents';
import { LLMConfig, EmailItem } from '../types/triage';

interface AgentsTabProps {
  llmConfig: LLMConfig;
  setLLMConfig: (config: LLMConfig) => void;
  selectedEmail: EmailItem | null;
  feedEvents: Array<{ time: string; agent: string; message: string; type: 'info' | 'warn' | 'threat' | 'success' }>;
  onClearFeed: () => void;
  isProcessing: boolean;
  activeAgentIndex: number;
}

export const AgentsTab: React.FC<AgentsTabProps> = ({
  llmConfig,
  setLLMConfig,
  selectedEmail,
  feedEvents,
  onClearFeed,
  isProcessing,
  activeAgentIndex
}) => {
  const [expandedAgentId, setExpandedAgentId] = useState<number | null>(1);
  const [activeSubTab, setActiveSubTab] = useState<'prompt' | 'input' | 'output'>('output');
  const [testResult, setTestResult] = useState<{ testing: boolean; message: string; ok?: boolean } | null>(null);
  const [showKey, setShowKey] = useState(false);

  const slate = selectedEmail?.slate;

  // Handle provider selection switch
  const handleProviderChange = (providerId: LLMConfig['provider']) => {
    const prov = AVAILABLE_PROVIDERS.find((p) => p.id === providerId);
    if (!prov) return;
    setLLMConfig({
      ...llmConfig,
      provider: providerId,
      model: prov.defaultModel,
      endpoint: prov.defaultEndpoint
    });
    setTestResult(null);
  };

  // Test provider connection
  const handleTestConnection = async () => {
    setTestResult({ testing: true, message: 'Validating endpoint...' });
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: llmConfig })
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ testing: false, ok: true, message: data.message });
      } else {
        setTestResult({ testing: false, ok: false, message: data.message || 'Connection failed' });
      }
    } catch (err: any) {
      setTestResult({ testing: false, ok: false, message: err.message || 'Connection error' });
    }
  };

  const getAgentOutput = (id: number) => {
    if (!slate) return null;
    switch (id) {
      case 1:
        return slate.agent1_sanitizer;
      case 2:
        return slate.agent2_classifier;
      case 3:
        return slate.agent3_router;
      case 4:
        return slate.agent4_reply;
      case 5:
        return slate.agent5_telemetry;
      default:
        return null;
    }
  };

  const getAgentInput = (id: number) => {
    if (!slate) return 'No email selected or processed yet.';
    switch (id) {
      case 1:
        return JSON.stringify(slate.raw_input, null, 2);
      case 2:
        return JSON.stringify({
          sanitized_subject: slate.agent1_sanitizer?.sanitized_subject,
          sanitized_body: slate.agent1_sanitizer?.sanitized_body,
          security_flag: slate.agent1_sanitizer?.security_flag
        }, null, 2);
      case 3:
        return JSON.stringify(slate.agent2_classifier, null, 2);
      case 4:
        return JSON.stringify({
          sanitized_body: slate.agent1_sanitizer?.sanitized_body,
          classification: slate.agent2_classifier,
          routing: slate.agent3_router
        }, null, 2);
      case 5:
        return JSON.stringify({
          sanitizer: slate.agent1_sanitizer?.is_safe,
          category: slate.agent2_classifier?.category,
          urgency: slate.agent2_classifier?.urgency,
          queue: slate.agent3_router?.target_queue,
          draft_status: slate.agent4_reply?.draft_status
        }, null, 2);
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-1">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">
          Agent Blackboard Pipeline
        </h2>
        <p className="text-xs text-slate-600 font-medium">
          5-stage sequential slate architecture. Switch model providers live to benchmark performance, accuracy, and token economics.
        </p>
      </div>

      {/* Model Settings Card */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-indigo-700" />
            <h3 className="text-sm font-bold text-slate-900">
              Model Settings & Provider Switching
            </h3>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">
            Multi-LLM Engine Configuration
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Provider Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Provider Engine:
            </label>
            <select
              value={llmConfig.provider}
              onChange={(e) => handleProviderChange(e.target.value as LLMConfig['provider'])}
              className="w-full px-3 py-2 text-xs rounded-xl glass-input font-medium cursor-pointer bg-white text-slate-900 border border-slate-300 shadow-2xs"
            >
              {AVAILABLE_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 font-medium mt-1">
              {AVAILABLE_PROVIDERS.find((p) => p.id === llmConfig.provider)?.note}
            </p>
          </div>

          {/* Model Name */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Model Identifier:
            </label>
            <input
              type="text"
              value={llmConfig.model}
              onChange={(e) => setLLMConfig({ ...llmConfig, model: e.target.value })}
              placeholder="e.g. gemini-3.8-flash, gpt-4o, claude-3-5-sonnet"
              className="w-full px-3 py-2 text-xs rounded-xl glass-input font-mono bg-white text-slate-900 border border-slate-300 shadow-2xs"
            />
            <p className="text-[10px] text-slate-500 font-medium mt-1">
              Passes directly to provider SDK or API request body.
            </p>
          </div>

          {/* API Endpoint */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              API Endpoint URL:
            </label>
            <input
              type="text"
              value={llmConfig.endpoint}
              onChange={(e) => setLLMConfig({ ...llmConfig, endpoint: e.target.value })}
              placeholder="https://..."
              className="w-full px-3 py-2 text-xs rounded-xl glass-input font-mono bg-white text-slate-900 border border-slate-300 shadow-2xs"
            />
            <p className="text-[10px] text-slate-500 font-medium mt-1">
              Supports custom gateway or local Ollama proxy.
            </p>
          </div>
        </div>

        {/* Row 2: API Key + Test Connection */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
          <div className="flex-1 min-w-[280px]">
            <label className="block text-xs font-bold text-slate-800 mb-1">
              API Key (Optional override):
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={llmConfig.apiKey || ''}
                onChange={(e) => setLLMConfig({ ...llmConfig, apiKey: e.target.value })}
                placeholder={
                  llmConfig.provider === 'gemini'
                    ? 'Using server GEMINI_API_KEY (or enter custom key)'
                    : 'Enter API key (e.g. sk-...)'
                }
                className="w-full px-3 py-2 text-xs rounded-xl glass-input pr-16 font-mono bg-white text-slate-900 border border-slate-300 shadow-2xs"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end">
            <button
              onClick={handleTestConnection}
              disabled={testResult?.testing}
              className="px-4 py-2 text-xs font-bold rounded-full glass-btn border border-indigo-300 text-indigo-700 hover:bg-indigo-50 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-indigo-600" />
              <span>{testResult?.testing ? 'Testing...' : 'Test Connection'}</span>
            </button>
          </div>
        </div>

        {/* Connection feedback pill */}
        {testResult && (
          <div
            className={`p-2 rounded-xl text-xs flex items-center gap-2 ${
              testResult.ok
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                : 'bg-red-50 text-red-800 border border-red-300'
            }`}
          >
            {testResult.ok ? <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />}
            <span>{testResult.message}</span>
          </div>
        )}
      </div>

      {/* 5-Agent Interactive Blackboard Pipeline */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span>Pipeline Architecture (Blackboard Slate)</span>
            {selectedEmail && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-normal">
                Inspecting: "{selectedEmail.subject}"
              </span>
            )}
          </h3>
          <span className="text-[11px] text-slate-500 font-medium">Click any agent card to inspect slate JSON</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {AGENT_DEFINITIONS.map((agent, index) => {
            const isCurrent = isProcessing && activeAgentIndex === index;
            const output = getAgentOutput(agent.id);
            const isDone = Boolean(output);
            const isExpanded = expandedAgentId === agent.id;
            const isAgent1Threat = agent.id === 1 && slate?.agent1_sanitizer?.is_safe === false;

            return (
              <div
                key={agent.id}
                onClick={() => setExpandedAgentId(isExpanded ? null : agent.id)}
                className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 border flex flex-col justify-between ${
                  isExpanded
                    ? 'bg-white border-indigo-600 shadow-md ring-2 ring-indigo-500/20'
                    : 'bg-white/80 border-slate-200 hover:border-indigo-400 hover:bg-white shadow-2xs'
                } ${isCurrent ? 'animate-pulse bg-indigo-50 border-indigo-400' : ''}`}
              >
                <div>
                  {/* Status header */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      STEP {agent.id}
                    </span>

                    {isCurrent && (
                      <span className="text-[10px] font-bold text-indigo-700 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" />
                        Running
                      </span>
                    )}
                    {!isCurrent && isDone && !isAgent1Threat && (
                      <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-emerald-600" /> Done
                      </span>
                    )}
                    {isAgent1Threat && (
                      <span className="text-[10px] font-bold text-red-700 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3 text-red-600" /> Flagged
                      </span>
                    )}
                    {!isCurrent && !isDone && (
                      <span className="text-[10px] font-medium text-slate-500">Idle</span>
                    )}
                  </div>

                  <h4 className="text-xs font-bold text-slate-900 mb-1">
                    {agent.name}
                  </h4>
                  <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed font-medium">
                    {agent.description}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                  <span>
                    {slate?.execution_meta?.stepDurationsMs?.[`agent${agent.id}`]
                      ? `${slate.execution_meta.stepDurationsMs[`agent${agent.id}`]}ms`
                      : 'avg ~0.9s'}
                  </span>
                  <span className="text-indigo-700 font-semibold">
                    {isExpanded ? 'Hide ▲' : 'Inspect ▼'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expanded Agent Inspector Panel */}
      {expandedAgentId !== null && (
        <div className="glass-card p-5 rounded-2xl border border-indigo-200/80 shadow-md space-y-4">
          {(() => {
            const currentAgent = AGENT_DEFINITIONS.find((a) => a.id === expandedAgentId);
            if (!currentAgent) return null;
            const output = getAgentOutput(currentAgent.id);
            const input = getAgentInput(currentAgent.id);

            return (
              <>
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-200">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-mono text-xs font-bold">
                        {currentAgent.id}
                      </span>
                      <span>{currentAgent.title}</span>
                    </h3>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      {currentAgent.role}
                    </p>
                  </div>

                  {/* Sub-tabs: Output / Slate Input / System Prompt */}
                  <div className="flex items-center gap-1 p-1 rounded-full bg-slate-100 border border-slate-200 text-xs">
                    <button
                      onClick={() => setActiveSubTab('output')}
                      className={`px-3 py-1 rounded-full font-bold transition-all cursor-pointer ${
                        activeSubTab === 'output'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Strict JSON Output {output ? '✓' : ''}
                    </button>
                    <button
                      onClick={() => setActiveSubTab('input')}
                      className={`px-3 py-1 rounded-full font-bold transition-all cursor-pointer ${
                        activeSubTab === 'input'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Blackboard Slate Input
                    </button>
                    <button
                      onClick={() => setActiveSubTab('prompt')}
                      className={`px-3 py-1 rounded-full font-bold transition-all cursor-pointer ${
                        activeSubTab === 'prompt'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      System Prompt & Rules
                    </button>
                  </div>
                </div>

                {/* SubTab Content */}
                {activeSubTab === 'output' && (
                  <div>
                    {output ? (
                      <div className="relative">
                        <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800 max-h-96 shadow-inner">
                          {JSON.stringify(output, null, 2)}
                        </pre>
                        <button
                          onClick={() => navigator.clipboard.writeText(JSON.stringify(output, null, 2))}
                          className="absolute top-3 right-3 px-2 py-1 text-[10px] font-bold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                        >
                          Copy JSON
                        </button>
                      </div>
                    ) : (
                      <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300 font-medium">
                        No output yet for this agent on the selected email. Select an email in the Inbox and run triage to inspect results.
                      </div>
                    )}
                  </div>
                )}

                {activeSubTab === 'input' && (
                  <div>
                    <pre className="p-4 rounded-xl bg-slate-900 text-emerald-400 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800 max-h-96 shadow-inner">
                      {input}
                    </pre>
                  </div>
                )}

                {activeSubTab === 'prompt' && (
                  <div className="space-y-2">
                    <pre className="p-4 rounded-xl bg-slate-50 font-mono text-xs text-slate-900 whitespace-pre-wrap leading-relaxed border border-slate-200 max-h-96 overflow-y-auto">
                      {currentAgent.promptInstructions}
                    </pre>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Live Processing Feed */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-700" />
            <h3 className="text-sm font-bold text-slate-900">
              Live Processing Feed & Pipeline Events
            </h3>
          </div>
          {feedEvents.length > 0 && (
            <button
              onClick={onClearFeed}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Clear Log
            </button>
          )}
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {feedEvents.length === 0 ? (
            <div className="text-xs text-slate-500 py-4 text-center font-medium">
              Nothing processed yet. Go to Inbox and click <strong>Process all</strong> or <strong>Run Triage</strong>.
            </div>
          ) : (
            feedEvents.map((event, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 text-xs py-1.5 border-b border-slate-100 font-mono"
              >
                <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap mt-0.5">
                  {event.time}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase shrink-0 ${
                    event.type === 'threat'
                      ? 'bg-red-100 text-red-800 border border-red-300'
                      : event.type === 'warn'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : event.type === 'success'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                  }`}
                >
                  {event.agent}
                </span>
                <span className="text-slate-900 font-sans">
                  {event.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
