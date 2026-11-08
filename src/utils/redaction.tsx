import React from 'react';

/**
 * Parses text containing [REDACTED_*] tags and renders them with highlighted visual pills
 */
export function renderSanitizedText(text: string): React.ReactNode {
  if (!text) return null;

  const parts = text.split(/(\[REDACTED_[A-Z0-9_]+\])/g);

  return (
    <>
      {parts.map((part, index) => {
        if (/^\[REDACTED_[A-Z0-9_]+\]$/.test(part)) {
          return (
            <span
              key={index}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-red-100 text-red-800 border border-red-300 mx-0.5 shadow-2xs"
              title="Personally Identifiable Information Scrubbed by Agent 1"
            >
              🔒 {part}
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

/**
 * Format currency in USD
 */
export function formatUSD(amount: number): string {
  if (amount < 0.0001 && amount > 0) {
    return `$${amount.toFixed(6)}`;
  }
  return `$${amount.toFixed(4)}`;
}
