import React from 'react';
import { Bot, BarChart3, Inbox, Send } from 'lucide-react';
import { LLMConfig } from '../types/triage';

interface HeaderProps {
  activeTab: 'inbox' | 'agents' | 'forwarding';
  setActiveTab: (tab: 'inbox' | 'agents' | 'forwarding') => void;
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
    <header className="sticky top-0 z-30 px-4 md:px-8 py-3.5 bg-transparent border-0 pointer-events-none transition-colors">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 items-center gap-3">
        {/* Top Left: Analytics & Model Pill */}
        <div className="pointer-events-auto flex items-center gap-2.5 justify-start">
          <button
            onClick={onOpenAnalytics}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-md shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-100 cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('agents')}
            className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white/70 border border-white/80 text-slate-800 shadow-sm backdrop-blur-xl hover:border-indigo-400 transition-colors cursor-pointer"
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
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs md:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'inbox'
                ? 'bg-white text-indigo-700 shadow-sm'
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
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs md:text-sm font-semibold transition-all relative cursor-pointer ${
              activeTab === 'agents'
                ? 'bg-white text-indigo-700 shadow-sm'
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
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs md:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'forwarding'
                ? 'bg-white text-indigo-700 shadow-sm'
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
        </nav>

        {/* Top Right: Centelli CommsIQ as the ONLY text with a pill background */}
        <div className="pointer-events-auto flex items-center justify-end">
          <span className="bp">
            Centelli CommsIQ
          </span>
        </div>
      </div>
    </header>
  );
};
