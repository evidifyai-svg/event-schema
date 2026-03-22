/**
 * @evidify/event-schema — Canonical Serialization
 *
 * Deterministic JSON serialization for hash chain integrity.
 * Two events with the same content MUST produce the same bytes.
 *
 * Zero dependencies — uses only built-in JSON with sorted keys.
 */

import type { ClinicalAIEvent } from './types';

// ─── Canonical JSON ─────────────────────────────────────────────────────────

/**
 * Produce a canonical JSON string from any value.
 * - Object keys are sorted lexicographically at every depth
 * - No whitespace
 * - undefined values are omitted
 * - null is preserved
 * - NaN and Infinity become null
 *
 * This ensures two objects with the same content always produce
 * the same string, regardless of property insertion order.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

/**
 * Sort object keys recursively.
 */
function sortDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) return null;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();
  for (const key of keys) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) {
      sorted[key] = sortDeep(v);
    }
  }
  return sorted;
}

// ─── Hash-Ready Event ───────────────────────────────────────────────────────

/**
 * Fields included in the hash computation.
 * Excludes: eventHash, previousHash, signature (these are computed FROM the hash).
 */
export interface HashableEventFields {
  id: string;
  schemaVersion: string;
  sequence: number;
  type: string;
  category: string;
  timestamp: string;
  actor: unknown;
  sessionId: string;
  caseId?: string;
  studyId?: string;
  domain?: string;
  condition?: string;
  payload: unknown;
}

/**
 * Extract the hashable fields from an event.
 * The canonical form excludes chain metadata (eventHash, previousHash, signature)
 * because those are computed from the hash itself.
 */
export function extractHashableFields(event: ClinicalAIEvent): HashableEventFields {
  return {
    id: event.id,
    schemaVersion: event.schemaVersion,
    sequence: event.sequence,
    type: event.type,
    category: event.category,
    timestamp: event.timestamp,
    actor: event.actor,
    sessionId: event.sessionId,
    caseId: event.caseId,
    studyId: event.studyId,
    domain: event.domain,
    condition: event.condition,
    payload: event.payload,
  };
}

/**
 * Produce the canonical bytes for hashing an event.
 * This is the input to SHA-256 for the hash chain.
 */
export function canonicalizeEvent(event: ClinicalAIEvent): string {
  return canonicalize(extractHashableFields(event));
}

// ─── Hash Chain Input ───────────────────────────────────────────────────────

/**
 * Produce the input string for a chain hash.
 * chainInput = previousHash + canonicalEvent
 *
 * The consumer computes: SHA-256(chainInput) to get eventHash.
 */
export function chainInput(event: ClinicalAIEvent, previousHash: string): string {
  return previousHash + canonicalizeEvent(event);
}

// ─── Web Crypto Hash (browser/Node 18+) ─────────────────────────────────────

/**
 * Compute SHA-256 hash using Web Crypto API.
 * Works in browsers, Node 18+, Deno, Cloudflare Workers.
 * Returns lowercase hex string.
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error(
    'Web Crypto API not available. Use Node.js 18+ or provide a SHA-256 implementation.'
  );
}

/**
 * Compute the event hash and chain it to the previous event.
 * Mutates the event in place (sets eventHash and previousHash).
 * Returns the computed hash.
 */
export async function hashAndChain(
  event: ClinicalAIEvent,
  previousHash: string,
): Promise<string> {
  event.previousHash = previousHash;
  const input = chainInput(event, previousHash);
  const hash = await sha256(input);
  event.eventHash = hash;
  return hash;
}

// ─── Synchronous Hash (for environments with Node crypto) ───────────────────

/**
 * Synchronous SHA-256 using Node.js crypto module.
 * Only works in Node.js environments.
 */
export function sha256Sync(input: string): string {
  try {
    // Dynamic import to avoid bundler issues in browser contexts
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  } catch {
    throw new Error('Node.js crypto module not available. Use sha256() (async) instead.');
  }
}

/**
 * Synchronous hash-and-chain for Node.js environments.
 */
export function hashAndChainSync(
  event: ClinicalAIEvent,
  previousHash: string,
): string {
  event.previousHash = previousHash;
  const input = chainInput(event, previousHash);
  const hash = sha256Sync(input);
  event.eventHash = hash;
  return hash;
}
