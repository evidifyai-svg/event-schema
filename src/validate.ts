/**
 * @evidify/event-schema — Validation
 *
 * Validate clinical AI events against the schema.
 * No dependencies — pure TypeScript validation.
 */

import type { ClinicalAIEvent, EventType, SessionEnvelope } from './types';
import { ALL_EVENT_TYPES, ALL_EVENT_CATEGORIES, getEventCategory, SCHEMA_VERSION } from './events';

// ─── Validation Result ──────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

// ─── UUID Regex ─────────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const SHA256_REGEX = /^[a-f0-9]{64}$/i;

// ─── Event Validation ───────────────────────────────────────────────────────

/**
 * Validate a single clinical AI event.
 */
export function validateEvent(event: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!event || typeof event !== 'object') {
    return { valid: false, errors: [{ field: 'event', message: 'Event must be a non-null object' }] };
  }

  const e = event as Record<string, unknown>;

  // Required string fields
  validateRequiredString(e, 'id', errors);
  validateRequiredString(e, 'schemaVersion', errors);
  validateRequiredString(e, 'type', errors);
  validateRequiredString(e, 'category', errors);
  validateRequiredString(e, 'timestamp', errors);
  validateRequiredString(e, 'sessionId', errors);

  // UUID format
  if (typeof e.id === 'string' && !UUID_REGEX.test(e.id)) {
    errors.push({ field: 'id', message: 'Must be a valid UUID v4', value: e.id });
  }

  // Timestamp format
  if (typeof e.timestamp === 'string' && !ISO_8601_REGEX.test(e.timestamp)) {
    errors.push({ field: 'timestamp', message: 'Must be ISO 8601 format', value: e.timestamp });
  }

  // Event type
  if (typeof e.type === 'string' && !ALL_EVENT_TYPES.includes(e.type as EventType)) {
    errors.push({ field: 'type', message: `Unknown event type: ${e.type}`, value: e.type });
  }

  // Category matches type
  if (typeof e.type === 'string' && typeof e.category === 'string') {
    const expectedCategory = getEventCategory(e.type as EventType);
    if (expectedCategory && e.category !== expectedCategory) {
      errors.push({
        field: 'category',
        message: `Category '${e.category}' does not match expected '${expectedCategory}' for type '${e.type}'`,
        value: e.category,
      });
    }
  }

  // Category validity
  if (typeof e.category === 'string' && !ALL_EVENT_CATEGORIES.includes(e.category as any)) {
    errors.push({ field: 'category', message: `Unknown category: ${e.category}`, value: e.category });
  }

  // Sequence
  if (typeof e.sequence !== 'number' || e.sequence < 0 || !Number.isInteger(e.sequence)) {
    errors.push({ field: 'sequence', message: 'Must be a non-negative integer', value: e.sequence });
  }

  // Actor
  if (!e.actor || typeof e.actor !== 'object') {
    errors.push({ field: 'actor', message: 'Actor is required and must be an object' });
  } else {
    const actor = e.actor as Record<string, unknown>;
    if (!actor.role || typeof actor.role !== 'string') {
      errors.push({ field: 'actor.role', message: 'Actor role is required' });
    }
    if (!actor.sessionToken || typeof actor.sessionToken !== 'string') {
      errors.push({ field: 'actor.sessionToken', message: 'Actor sessionToken is required' });
    }
  }

  // Payload
  if (!e.payload || typeof e.payload !== 'object') {
    errors.push({ field: 'payload', message: 'Payload is required and must be an object' });
  }

  // Hash chain fields (optional but if present, must be valid)
  if (e.eventHash !== undefined && typeof e.eventHash === 'string' && !SHA256_REGEX.test(e.eventHash)) {
    errors.push({ field: 'eventHash', message: 'Must be a valid SHA-256 hex string', value: e.eventHash });
  }
  if (e.previousHash !== undefined && typeof e.previousHash === 'string' && !SHA256_REGEX.test(e.previousHash)) {
    errors.push({ field: 'previousHash', message: 'Must be a valid SHA-256 hex string', value: e.previousHash });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate payload-specific fields based on event type.
 */
export function validatePayload(type: EventType, payload: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: [{ field: 'payload', message: 'Payload must be a non-null object' }] };
  }

  const p = payload as Record<string, unknown>;

  // Assessment events require contentHash
  if (['ASSESSMENT_SUBMITTED', 'ASSESSMENT_LOCKED', 'ASSESSMENT_REVISED'].includes(type)) {
    if (!p.contentHash || typeof p.contentHash !== 'string') {
      errors.push({ field: 'payload.contentHash', message: 'Assessment events require a contentHash' });
    }
  }

  // Confidence events require value and signal
  if (type === 'CONFIDENCE_RECORDED') {
    if (typeof p.value !== 'number' || p.value < 0 || p.value > 100) {
      errors.push({ field: 'payload.value', message: 'Confidence value must be 0-100', value: p.value });
    }
    if (!['CONFIDENT', 'UNCERTAIN', 'UNDECIDED'].includes(p.signal as string)) {
      errors.push({ field: 'payload.signal', message: 'Signal must be CONFIDENT, UNCERTAIN, or UNDECIDED', value: p.signal });
    }
  }

  // AI output events require modelId and contentHash
  if (type.startsWith('AI_RECOMMENDATION_') || type.startsWith('AI_DRAFT_') ||
      type.startsWith('AI_SCORE_') || type.startsWith('AI_CLASSIFICATION_')) {
    if (!p.modelId || typeof p.modelId !== 'string') {
      errors.push({ field: 'payload.modelId', message: 'AI output events require a modelId' });
    }
    if (!p.contentHash || typeof p.contentHash !== 'string') {
      errors.push({ field: 'payload.contentHash', message: 'AI output events require a contentHash' });
    }
  }

  // AI interaction events require aiEventRef and action
  if (['AI_OUTPUT_ACCEPTED', 'AI_OUTPUT_MODIFIED', 'AI_OUTPUT_REJECTED', 'AI_OUTPUT_IGNORED'].includes(type)) {
    if (!p.aiEventRef || typeof p.aiEventRef !== 'string') {
      errors.push({ field: 'payload.aiEventRef', message: 'AI interaction events require an aiEventRef' });
    }
    if (!['accepted', 'modified', 'rejected', 'ignored'].includes(p.action as string)) {
      errors.push({ field: 'payload.action', message: 'Action must be accepted, modified, rejected, or ignored' });
    }
  }

  // Override events require reasonCode and category
  if (type === 'OVERRIDE_DOCUMENTED') {
    if (!p.reasonCode || typeof p.reasonCode !== 'string') {
      errors.push({ field: 'payload.reasonCode', message: 'Override events require a reasonCode' });
    }
    if (!['clinical', 'process', 'agreement', 'escalation', 'other'].includes(p.category as string)) {
      errors.push({ field: 'payload.category', message: 'Override category must be clinical, process, agreement, escalation, or other' });
    }
  }

  // Ephemeral events require elementType and contentHash
  if (type.startsWith('EPHEMERAL_')) {
    if (!p.contentHash || typeof p.contentHash !== 'string') {
      errors.push({ field: 'payload.contentHash', message: 'Ephemeral events require a contentHash' });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a complete session envelope.
 */
export function validateSession(session: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!session || typeof session !== 'object') {
    return { valid: false, errors: [{ field: 'session', message: 'Session must be a non-null object' }] };
  }

  const s = session as Record<string, unknown>;

  validateRequiredString(s, 'schemaVersion', errors);
  validateRequiredString(s, 'sessionId', errors);
  validateRequiredString(s, 'domain', errors);
  validateRequiredString(s, 'startedAt', errors);

  if (typeof s.eventCount !== 'number' || s.eventCount < 0) {
    errors.push({ field: 'eventCount', message: 'Must be a non-negative number', value: s.eventCount });
  }

  if (!Array.isArray(s.events)) {
    errors.push({ field: 'events', message: 'Events must be an array' });
  } else {
    // Validate event count matches
    if (s.eventCount !== (s.events as unknown[]).length) {
      errors.push({
        field: 'eventCount',
        message: `eventCount (${s.eventCount}) does not match events array length (${(s.events as unknown[]).length})`,
      });
    }

    // Validate sequence ordering
    const events = s.events as ClinicalAIEvent[];
    for (let i = 0; i < events.length; i++) {
      if (events[i].sequence !== i) {
        errors.push({
          field: `events[${i}].sequence`,
          message: `Expected sequence ${i}, got ${events[i].sequence}`,
        });
      }

      // Validate each event
      const eventResult = validateEvent(events[i]);
      errors.push(...eventResult.errors.map(e => ({
        ...e,
        field: `events[${i}].${e.field}`,
      })));
    }

    // Validate chain integrity if hashes present
    for (let i = 1; i < events.length; i++) {
      if (events[i].previousHash && events[i - 1].eventHash) {
        if (events[i].previousHash !== events[i - 1].eventHash) {
          errors.push({
            field: `events[${i}].previousHash`,
            message: `Chain broken: previousHash does not match event[${i - 1}].eventHash`,
          });
        }
      }
    }
  }

  // Platform info
  if (!s.platform || typeof s.platform !== 'object') {
    errors.push({ field: 'platform', message: 'Platform info is required' });
  }

  return { valid: errors.length === 0, errors };
}

// ─── PHI Detection ──────────────────────────────────────────────────────────

/**
 * Basic PHI detection heuristics.
 * Scans event payloads for patterns that might indicate PHI leakage.
 * NOT a substitute for proper de-identification — this is a safety net.
 */
export function detectPotentialPHI(event: ClinicalAIEvent): ValidationResult {
  const errors: ValidationError[] = [];
  const payloadStr = JSON.stringify(event.payload);

  // Check for common PHI patterns
  const patterns: Array<{ name: string; regex: RegExp }> = [
    { name: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/ },
    { name: 'Phone', regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/ },
    { name: 'Email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/ },
    { name: 'MRN pattern', regex: /\bMRN[:\s]*\d+/i },
    { name: 'DOB pattern', regex: /\b(DOB|date of birth)[:\s]/i },
    { name: 'Name pattern', regex: /\b(patient name|pt name)[:\s]/i },
  ];

  for (const { name, regex } of patterns) {
    if (regex.test(payloadStr)) {
      errors.push({
        field: 'payload',
        message: `Potential PHI detected: ${name} pattern found in payload`,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function validateRequiredString(
  obj: Record<string, unknown>,
  field: string,
  errors: ValidationError[],
): void {
  if (!obj[field] || typeof obj[field] !== 'string') {
    errors.push({ field, message: `${field} is required and must be a string`, value: obj[field] });
  }
}
