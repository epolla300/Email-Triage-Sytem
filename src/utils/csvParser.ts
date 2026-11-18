import * as XLSX from 'xlsx';
import {
  EmailGroundTruth,
  ComplexityGroup,
  LengthGroup,
  AmbiguityGroup,
  DatasetSplit
} from '../types/triage';

export interface ParsedDatasetRow {
  from: string;
  subject: string;
  body: string;
  groundTruth?: EmailGroundTruth;
}

/**
 * RFC-4180 compliant CSV parser handling quoted fields, escaped quotes (""),
 * embedded commas, and multi-line email bodies inside quotes.
 */
export function parseRFC4180CSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Strip UTF-8 BOM if present
  const clean = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function parseBool(val: any): boolean | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const s = String(val).trim().toLowerCase();
  if (['true', 'yes', '1', 'y'].includes(s)) return true;
  if (['false', 'no', '0', 'n'].includes(s)) return false;
  return undefined;
}

function parseNum(val: any): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

function normalizeComplexity(val: any): ComplexityGroup | undefined {
  if (!val) return undefined;
  const s = String(val).trim().toLowerCase();
  if (s.includes('diff') || s.includes('hard')) return 'Difficult';
  if (s.includes('mod') || s.includes('med')) return 'Moderate';
  if (s.includes('simp') || s.includes('easy')) return 'Simple';
  return undefined;
}

function normalizeLengthGroup(val: any, body: string): LengthGroup {
  if (val) {
    const s = String(val).trim().toLowerCase();
    if (s.includes('long')) return 'Long';
    if (s.includes('med')) return 'Medium';
    if (s.includes('short')) return 'Short';
  }
  const len = (body || '').length;
  if (len > 900) return 'Long';
  if (len > 300) return 'Medium';
  return 'Short';
}

function normalizeAmbiguity(val: any): AmbiguityGroup | undefined {
  if (!val) return undefined;
  const s = String(val).trim().toLowerCase();
  if (s.includes('unclear') || s.includes('ambig') || s.includes('high')) return 'Unclear';
  if (s.includes('part')) return 'Partially Clear';
  if (s.includes('clear') || s.includes('low')) return 'Clear';
  return undefined;
}

function normalizeSplit(val: any): DatasetSplit | undefined {
  if (!val) return undefined;
  const s = String(val).trim().toLowerCase();
  if (s.includes('dev')) return 'dev';
  if (s.includes('test') || s.includes('final') || s.includes('blind')) return 'test';
  if (s.includes('manual')) return 'manual';
  return undefined;
}

/**
 * Converts a generic key-value record (from JSON, CSV, or XLSX) into a ParsedDatasetRow
 * preserving any ground truth and workload classification columns.
 */
export function mapRecordToDatasetRow(raw: Record<string, any>): ParsedDatasetRow | null {
  // Normalize keys to lowercase snake_case for flexible column headers
  const norm: Record<string, any> = {};
  Object.entries(raw || {}).forEach(([k, v]) => {
    const nk = k.trim().toLowerCase().replace(/[\s\-]+/g, '_');
    norm[nk] = v;
  });

  const from = String(norm.from ?? norm.sender ?? norm.from_email ?? 'imported@client.com').trim();
  const subject = String(norm.subject ?? norm.subject_line ?? '(Imported Subject)').trim();
  const body = String(norm.body ?? norm.email_body ?? norm.content ?? norm.message ?? '').trim();

  if (!body && !subject) return null;

  const expectedCategory = norm.expected_category ?? norm.category ?? norm.ground_truth_category ?? norm.label;
  const expectedQueue = norm.expected_queue ?? norm.target_queue ?? norm.queue;
  const expectedUrgency = parseNum(norm.expected_urgency ?? norm.urgency);
  const expectedHumanReview = parseBool(norm.expected_human_review ?? norm.needs_human_review ?? norm.human_review);
  const isDoNotDecide = parseBool(norm.is_do_not_decide ?? norm.do_not_decide ?? norm.refusal_case);
  const expectedAccountId = norm.expected_account_id ?? norm.account_id ?? undefined;
  const expectedDates = norm.expected_dates ?? norm.requested_dates ?? undefined;
  const expectedPartySize = norm.expected_party_size ?? norm.party_size ?? undefined;
  const expectedValue = norm.expected_value ?? norm.estimated_value ?? undefined;
  const complexity = normalizeComplexity(norm.complexity ?? norm.difficulty);
  const lengthGroup = normalizeLengthGroup(norm.length_group ?? norm.input_length, body);
  const ambiguity = normalizeAmbiguity(norm.ambiguity);
  const split = normalizeSplit(norm.split ?? norm.dataset_split);
  const notes = norm.notes ? String(norm.notes).trim() : undefined;

  const hasAnyTruth =
    Boolean(expectedCategory) ||
    Boolean(expectedQueue) ||
    expectedUrgency !== undefined ||
    expectedHumanReview !== undefined ||
    isDoNotDecide !== undefined ||
    Boolean(complexity) ||
    Boolean(ambiguity) ||
    Boolean(split);

  const groundTruth: EmailGroundTruth | undefined = hasAnyTruth
    ? {
        expected_category: expectedCategory ? String(expectedCategory).trim() : undefined,
        expected_queue: expectedQueue ? String(expectedQueue).trim() : undefined,
        expected_urgency: expectedUrgency,
        expected_human_review: expectedHumanReview,
        is_do_not_decide: isDoNotDecide,
        expected_account_id: expectedAccountId ? String(expectedAccountId).trim() : undefined,
        expected_dates: expectedDates ? String(expectedDates).trim() : undefined,
        expected_party_size: expectedPartySize ? String(expectedPartySize).trim() : undefined,
        expected_value: expectedValue ? String(expectedValue).trim() : undefined,
        complexity: complexity || 'Moderate',
        length_group: lengthGroup,
        ambiguity: ambiguity || 'Clear',
        split: split || 'test',
        notes
      }
    : undefined;

  return { from, subject, body, groundTruth };
}

export async function parseUploadedDatasetFile(file: File): Promise<ParsedDatasetRow[]> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.json')) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map(mapRecordToDatasetRow).filter((x): x is ParsedDatasetRow => Boolean(x));
  }

  if (lowerName.endsWith('.csv')) {
    const text = await file.text();
    const grid = parseRFC4180CSV(text);
    if (grid.length < 2) return [];
    const headers = grid[0].map((h) => h.trim());
    const results: ParsedDatasetRow[] = [];
    for (let i = 1; i < grid.length; i++) {
      const row = grid[i];
      const obj: Record<string, any> = {};
      headers.forEach((h, idx) => {
        obj[h] = row[idx] ?? '';
      });
      const mapped = mapRecordToDatasetRow(obj);
      if (mapped) results.push(mapped);
    }
    return results;
  }

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) return [];
    const sheet = wb.Sheets[firstSheet];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
    return jsonRows.map(mapRecordToDatasetRow).filter((x): x is ParsedDatasetRow => Boolean(x));
  }

  throw new Error('Unsupported file format. Please upload .json, .csv, or .xlsx.');
}

/**
 * Generates and downloads a clean CSV template matching the KSU Capstone evaluation schema.
 */
export function downloadCapstoneCSVTemplate() {
  const headers = [
    'from',
    'subject',
    'body',
    'expected_category',
    'expected_queue',
    'expected_urgency',
    'expected_human_review',
    'is_do_not_decide',
    'expected_account_id',
    'expected_dates',
    'expected_party_size',
    'expected_value',
    'complexity',
    'ambiguity',
    'split',
    'notes'
  ];

  const sampleRows = [
    [
      'buyer@northstar-logistics.example',
      'Enterprise Quote for 250 Seats',
      'Hello team, we are evaluating your triage platform for 250 seats starting Q4 2026 with a $45,000 budget. Can we schedule a demo next Tuesday?',
      'Sales / High-Value',
      'Sales_Gold_Queue',
      '3',
      'false',
      'false',
      '',
      'Q4 2026',
      '250 seats',
      '$45,000',
      'Simple',
      'Clear',
      'dev',
      'Straightforward single-purpose enterprise quote'
    ],
    [
      'ops@harbor-retail.example',
      'URGENT!! please read asap',
      'Hey idk what happened to the thing we talked about on the call yesterday?? Anyway can u check on that before friday thx',
      'Insufficient Info / Unroutable',
      'Human_Triage_Queue',
      '2',
      'true',
      'true',
      '',
      'friday',
      '',
      '',
      'Difficult',
      'Unclear',
      'test',
      'False urgency + missing context ("do not decide" test case)'
    ]
  ];

  const escapeCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csvContent = [headers.join(','), ...sampleRows.map((r) => r.map(escapeCell).join(','))].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'KSU_Capstone_Email_Dataset_Template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
