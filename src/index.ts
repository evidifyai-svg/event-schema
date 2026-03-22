/**
 * @evidify/event-schema
 *
 * Open event schema for clinical AI decision provenance.
 * Define, validate, and serialize human-AI interaction events
 * for tamper-evident verification.
 *
 * @packageDocumentation
 */

// ── Types ──
export type {
  // Core event types
  ClinicalAIEvent,
  EventType,
  EventCategory,
  EventPayloadMap,
  Actor,
  ActorRole,

  // Payload types
  BaseEventPayload,
  AssessmentPayload,
  ConfidencePayload,
  AIOutputPayload,
  AIInteractionPayload,
  DiffPayload,
  EphemeralPayload,
  OverridePayload,
  ComprehensionPayload,
  ViewerPayload,
  QualityPayload,
  AttributionPayload,
  AttestationPayload,

  // Session types
  SessionEnvelope,
  ModelProvenance,

  // Config
  EventSchemaConfig,
} from './types';

// ── Event Factory ──
export {
  SCHEMA_VERSION,
  ALL_EVENT_TYPES,
  ALL_EVENT_CATEGORIES,
  generateId,
  timestamp,
  getEventCategory,
  deriveConfidenceSignal,
  createEvent,
  sessionStarted,
  assessmentLocked,
  aiRecommendationRevealed,
  aiInteraction,
  ephemeralShown,
  confidenceRecorded,
  overrideDocumented,
} from './events';
export type { EventContext } from './events';

// ── Validation ──
export {
  validateEvent,
  validatePayload,
  validateSession,
  detectPotentialPHI,
} from './validate';
export type { ValidationResult, ValidationError } from './validate';

// ── Serialization ──
export {
  canonicalize,
  canonicalizeEvent,
  extractHashableFields,
  chainInput,
  sha256,
  sha256Sync,
  hashAndChain,
  hashAndChainSync,
} from './serialize';
export type { HashableEventFields } from './serialize';

// ── Session Builder ──
export {
  SessionBuilder,
  GENESIS_HASH,
  verifySessionChain,
} from './session';

// ── Emitter ──
export {
  ClinicalEventEmitter,
} from './emitter';
export type {
  EventListener,
  TypedEventListener,
  FlushCallback,
  EmitterOptions,
} from './emitter';
