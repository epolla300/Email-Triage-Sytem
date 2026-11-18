import React from 'react';
import { Bot, BarChart3, Inbox, Send } from 'lucide-react';
import { LLMConfig } from '../types/triage';

interface HeaderProps {
  activeTab: 'inbox' | 'agents' | 'forwarding' | 'analytics';
  setActiveTab: (tab: 'inbox' | 'agents' | 'forwarding' | 'analytics') => void;
  llmConfig: LLMConfig;
  onOpenAnalytics: () => void;
  emailCount: number;
  processedCount: number;
  isProcessing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  llmConfig,
  onOpenAnalytics,
  emailCount,
  processedCount,
  isProcessing
}) => {
  return (
    <header className="sticky top-3 z-30 mx-auto mt-3 w-[calc(100%-2rem)] max-w-7xl px-4 md:px-5 py-2 rounded-3xl md:rounded-full bg-white/60 backdrop-blur-xl border border-white/80 shadow-[0_12px_36px_-10px_rgba(79,70,229,0.18),0_2px_6px_rgba(15,23,42,0.04)] transition-colors">
      <div className="w-full grid grid-cols-1 md:grid-cols-3 items-center gap-3">
        {/* Top Left: Model Pill */}
        <div className="pointer-events-auto flex items-center gap-2.5 justify-start">
          <button
            onClick={() => setActiveTab('agents')}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white/70 border border-white/80 text-slate-800 shadow-sm backdrop-blur-xl hover:border-indigo-400 transition-colors cursor-pointer"
            title="Active Model - Click to configure"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="capitalize">{llmConfig.provider}:</span>
            <span className="font-mono text-[11px] text-indigo-700 font-bold">
              {llmConfig.model}
            </span>
          </button>
        </div>

        {/* Center: Floating Navigation Pill */}
        <nav className="pointer-events-auto justify-self-center flex items-center p-1 rounded-full bg-white/70 border border-white/80 backdrop-blur-xl shadow-md shadow-indigo-500/5">
          <button
            onClick={() => setActiveTab('inbox')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs md:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'inbox'
                ? 'bg-white text-indigo-700 shadow-[0_3px_10px_-2px_rgba(79,70,229,0.22),0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-indigo-500/10'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Inbox className="w-4 h-4" />
            <span>Inbox</span>
            {emailCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                {emailCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('agents')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs md:text-sm font-semibold transition-all relative cursor-pointer ${
              activeTab === 'agents'
                ? 'bg-white text-indigo-700 shadow-[0_3px_10px_-2px_rgba(79,70,229,0.22),0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-indigo-500/10'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Agents</span>
            {isProcessing && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping absolute top-1 right-2" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('forwarding')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs md:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'forwarding'
                ? 'bg-white text-indigo-700 shadow-[0_3px_10px_-2px_rgba(79,70,229,0.22),0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-indigo-500/10'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Forwarding</span>
            {processedCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                {processedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs md:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-white text-indigo-700 shadow-[0_3px_10px_-2px_rgba(79,70,229,0.22),0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-indigo-500/10'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analytics</span>
          </button>
        </nav>

        {/* Top Right: AI Email Triage as the ONLY text with a pill background */}
        <div className="pointer-events-auto flex items-center justify-end">
          <span className="bp">
            AI Email Triage
          </span>
        </div>
      </div>
    </header>
  );
};
