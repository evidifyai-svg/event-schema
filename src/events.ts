/**
 * @evidify/event-schema — Event Factory
 *
 * Factory functions for creating type-safe clinical AI events.
 * Handles UUID generation, categorization, and timestamp creation.
 */

import type {
  EventType,
  EventCategory,
  EventPayloadMap,
  ClinicalAIEvent,
  Actor,
  BaseEventPayload,
  ConfidencePayload,
} from './types';

// ─── Schema Version ─────────────────────────────────────────────────────────

export const SCHEMA_VERSION = '0.1.0';

// ─── Category Mapping ───────────────────────────────────────────────────────

const EVENT_CATEGORY_MAP: Record<EventType, EventCategory> = {
  // Session
  SESSION_STARTED: 'session',
  SESSION_ENDED: 'session',
  SESSION_PAUSED: 'session',
  SESSION_RESUMED: 'session',
  CONSENT_GIVEN: 'session',
  CASE_STARTED: 'session',
  CASE_COMPLETED: 'session',

  // Assessment
  ASSESSMENT_SUBMITTED: 'assessment',
  ASSESSMENT_LOCKED: 'assessment',
  ASSESSMENT_REVISED: 'assessment',
  CONFIDENCE_RECORDED: 'assessment',

  // AI Output
  AI_RECOMMENDATION_GENERATED: 'ai_output',
  AI_RECOMMENDATION_REVEALED: 'ai_output',
  AI_DRAFT_GENERATED: 'ai_output',
  AI_DRAFT_REVEALED: 'ai_output',
  AI_SCORE_GENERATED: 'ai_output',
  AI_SCORE_REVEALED: 'ai_output',
  AI_CLASSIFICATION_GENERATED: 'ai_output',
  AI_CLASSIFICATION_REVEALED: 'ai_output',

  // AI Interaction
  AI_OUTPUT_ACCEPTED: 'ai_interaction',
  AI_OUTPUT_MODIFIED: 'ai_interaction',
  AI_OUTPUT_REJECTED: 'ai_interaction',
  AI_OUTPUT_IGNORED: 'ai_interaction',
  AI_DRAFT_EDITED: 'ai_interaction',

  // Comprehension
  ERROR_RATE_DISCLOSED: 'comprehension',
  COMPREHENSION_CHECK_PRESENTED: 'comprehension',
  COMPREHENSION_CHECK_ANSWERED: 'comprehension',
  COMPREHENSION_GATE_PASSED: 'comprehension',
  COMPREHENSION_GATE_FAILED: 'comprehension',

  // Documentation
  OVERRIDE_DOCUMENTED: 'documentation',
  RATIONALE_RECORDED: 'documentation',
  DOCUMENT_SECTION_ATTRIBUTED: 'documentation',

  // Ephemeral
  EPHEMERAL_SUGGESTION_SHOWN: 'ephemeral',
  EPHEMERAL_SUGGESTION_ENGAGED: 'ephemeral',
  EPHEMERAL_SUGGESTION_DISMISSED: 'ephemeral',
  EPHEMERAL_PANEL_SHOWN: 'ephemeral',
  EPHEMERAL_PANEL_DISMISSED: 'ephemeral',

  // Viewer
  VIEWER_INTERACTION: 'viewer',
  VIEWER_MEASUREMENT_TAKEN: 'viewer',
  VIEWER_ANNOTATION_ADDED: 'viewer',

  // Quality
  QUALITY_FLAG_RAISED: 'quality',
  GAMING_PATTERN_DETECTED: 'quality',

  // System
  SYSTEM_ERROR: 'system',
  SYSTEM_ATTESTATION: 'system',
  SYSTEM_EXPORT_GENERATED: 'system',
};

// ─── All Event Types (exported for validation) ──────────────────────────────

export const ALL_EVENT_TYPES: EventType[] = Object.keys(EVENT_CATEGORY_MAP) as EventType[];

export const ALL_EVENT_CATEGORIES: EventCategory[] = [
  'session', 'assessment', 'ai_output', 'ai_interaction',
  'comprehension', 'documentation', 'ephemeral', 'viewer',
  'quality', 'system',
];

// ─── UUID Generation ────────────────────────────────────────────────────────

/**
 * Generate a UUID v4. Uses crypto.randomUUID() if available,
 * falls back to manual generation.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Timestamp ──────────────────────────────────────────────────────────────

/**
 * Generate an ISO 8601 timestamp with millisecond precision.
 */
export function timestamp(): string {
  return new Date().toISOString();
}

// ─── Category Lookup ────────────────────────────────────────────────────────

/**
 * Get the category for an event type.
 */
export function getEventCategory(type: EventType): EventCategory {
  return EVENT_CATEGORY_MAP[type];
}

// ─── Confidence Signal Derivation ───────────────────────────────────────────

/**
 * Derive a discrete confidence signal from a numeric value.
 * Maps: 0-33 → UNDECIDED, 34-66 → UNCERTAIN, 67-100 → CONFIDENT
 */
export function deriveConfidenceSignal(value: number): ConfidencePayload['signal'] {
  if (value <= 33) return 'UNDECIDED';
  if (value <= 66) return 'UNCERTAIN';
  return 'CONFIDENT';
}

// ─── Event Factory ──────────────────────────────────────────────────────────

/**
 * Context that persists across events in a session.
 * Set once, applied to all events automatically.
 */
export interface EventContext {
  sessionId: string;
  caseId?: string;
  studyId?: string;
  domain?: string;
  condition?: string;
}

/**
 * Create a typed clinical AI event.
 *
 * @param type - Event type from the taxonomy
 * @param actor - Who performed the action
 * @param payload - Event-specific payload
 * @param context - Session context (sessionId, caseId, etc.)
 * @param sequence - Sequential position in the event stream
 * @returns A fully formed ClinicalAIEvent
 *
 * @example
 * ```typescript
 * const event = createEvent(
 *   'ASSESSMENT_LOCKED',
 *   { role: 'clinician', sessionToken: 'abc123' },
 *   { contentHash: 'sha256...', category: 'present', codeSystem: 'custom' },
 *   { sessionId: 'session-1', caseId: 'case-1', domain: 'ct-head' },
 *   5
 * );
 * ```
 */
export function createEvent<T extends EventType>(
  type: T,
  actor: Actor,
  payload: T extends keyof EventPayloadMap ? EventPayloadMap[T] : BaseEventPayload,
  context: EventContext,
  sequence: number,
): ClinicalAIEvent<T> {
  return {
    id: generateId(),
    schemaVersion: SCHEMA_VERSION,
    sequence,
    type,
    category: getEventCategory(type),
    timestamp: timestamp(),
    actor,
    sessionId: context.sessionId,
    caseId: context.caseId,
    studyId: context.studyId,
    domain: context.domain,
    condition: context.condition,
    payload,
  };
}

// ─── Convenience Factories ──────────────────────────────────────────────────

/**
 * Create a SESSION_STARTED event.
 */
export function sessionStarted(
  actor: Actor,
  context: EventContext,
): ClinicalAIEvent<'SESSION_STARTED'> {
  return createEvent('SESSION_STARTED', actor, {}, context, 0);
}

/**
 * Create an ASSESSMENT_LOCKED event (the pre-AI commitment).
 */
export function assessmentLocked(
  actor: Actor,
  contentHash: string,
  context: EventContext,
  sequence: number,
  options?: { assessmentCode?: string; codeSystem?: string; category?: string },
): ClinicalAIEvent<'ASSESSMENT_LOCKED'> {
  return createEvent(
    'ASSESSMENT_LOCKED',
    actor,
    {
      contentHash,
      assessmentCode: options?.assessmentCode,
      codeSystem: options?.codeSystem,
      category: options?.category,
    },
    context,
    sequence,
  );
}

/**
 * Create an AI_RECOMMENDATION_REVEALED event.
 */
export function aiRecommendationRevealed(
  actor: Actor,
  modelId: string,
  contentHash: string,
  context: EventContext,
  sequence: number,
  options?: { aiConfidence?: number; modelVersion?: string; urgency?: 'STAT' | 'URGENT' | 'ROUTINE' | 'LOW' },
): ClinicalAIEvent<'AI_RECOMMENDATION_REVEALED'> {
  return createEvent(
    'AI_RECOMMENDATION_REVEALED',
    actor,
    {
      modelId,
      contentHash,
      outputType: 'recommendation',
      aiConfidence: options?.aiConfidence,
      modelVersion: options?.modelVersion,
      urgency: options?.urgency,
    },
    context,
    sequence,
  );
}

/**
 * Create an AI_OUTPUT_ACCEPTED/MODIFIED/REJECTED event.
 */
export function aiInteraction(
  actor: Actor,
  action: 'accepted' | 'modified' | 'rejected' | 'ignored',
  aiEventRef: string,
  context: EventContext,
  sequence: number,
  options?: { resultContentHash?: string; deliberationTimeMs?: number; confidenceShift?: number },
): ClinicalAIEvent<'AI_OUTPUT_ACCEPTED' | 'AI_OUTPUT_MODIFIED' | 'AI_OUTPUT_REJECTED' | 'AI_OUTPUT_IGNORED'> {
  const typeMap = {
    accepted: 'AI_OUTPUT_ACCEPTED' as const,
    modified: 'AI_OUTPUT_MODIFIED' as const,
    rejected: 'AI_OUTPUT_REJECTED' as const,
    ignored: 'AI_OUTPUT_IGNORED' as const,
  };
  return createEvent(
    typeMap[action],
    actor,
    {
      aiEventRef,
      action,
      resultContentHash: options?.resultContentHash,
      deliberationTimeMs: options?.deliberationTimeMs,
      confidenceShift: options?.confidenceShift,
    },
    context,
    sequence,
  );
}

/**
 * Create an EPHEMERAL_SUGGESTION_SHOWN event.
 */
export function ephemeralShown(
  actor: Actor,
  elementType: 'tooltip' | 'sidebar_panel' | 'autocomplete' | 'inline_suggestion' | 'modal' | 'notification',
  contentHash: string,
  context: EventContext,
  sequence: number,
): ClinicalAIEvent<'EPHEMERAL_SUGGESTION_SHOWN'> {
  return createEvent(
    'EPHEMERAL_SUGGESTION_SHOWN',
    actor,
    { elementType, contentHash, wasVisible: true },
    context,
    sequence,
  );
}

/**
 * Create a CONFIDENCE_RECORDED event.
 */
export function confidenceRecorded(
  actor: Actor,
  value: number,
  target: ConfidencePayload['target'],
  context: EventContext,
  sequence: number,
): ClinicalAIEvent<'CONFIDENCE_RECORDED'> {
  return createEvent(
    'CONFIDENCE_RECORDED',
    actor,
    { value, signal: deriveConfidenceSignal(value), target },
    context,
    sequence,
  );
}

/**
 * Create an OVERRIDE_DOCUMENTED event.
 */
export function overrideDocumented(
  actor: Actor,
  reasonCode: string,
  codeSystem: string,
  category: 'clinical' | 'process' | 'agreement' | 'escalation' | 'other',
  context: EventContext,
  sequence: number,
  rationaleHash?: string,
): ClinicalAIEvent<'OVERRIDE_DOCUMENTED'> {
  return createEvent(
    'OVERRIDE_DOCUMENTED',
    actor,
    { reasonCode, codeSystem, category, rationaleHash },
    context,
    sequence,
  );
}
