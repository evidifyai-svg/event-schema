/**
 * @evidify/event-schema — Core Type Definitions
 *
 * This module defines the complete event taxonomy for clinical AI
 * decision provenance. Every event represents a discrete, timestamped
 * interaction between a clinician and an AI system during a clinical
 * encounter.
 *
 * Design principles:
 * 1. PHI-free by structure — events contain codes and hashes, never clinical text
 * 2. Append-only — events are immutable once emitted
 * 3. Domain-agnostic — the same schema works for radiology, cardiology, rehab, pathology
 * 4. Verification-ready — events are designed to be chained, hashed, and verified
 * 5. Standards-aligned — maps to FHIR AuditEvent, CDS Hooks feedback, EU AI Act Article 12
 */

// ─── Actor Types ────────────────────────────────────────────────────────────

/**
 * Who performed the action. Never contains names or identifiers —
 * only roles and opaque session-scoped tokens.
 */
export interface Actor {
  /** Role of the actor in this interaction */
  role: ActorRole;
  /** Opaque session-scoped identifier (not a name, not a persistent ID) */
  sessionToken: string;
}

export type ActorRole =
  | 'clinician'      // Human clinician making decisions
  | 'ai_system'      // AI/ML model producing outputs
  | 'platform'       // The hosting platform (system events)
  | 'reviewer'       // Post-hoc reviewer examining the record
  | 'trainee'        // Clinician in training
  | 'supervisor';    // Supervising clinician

// ─── Event Categories ───────────────────────────────────────────────────────

/**
 * Top-level event categories. Each category contains specific event types.
 */
export type EventCategory =
  | 'session'         // Session lifecycle (start, end, pause, resume)
  | 'assessment'      // Clinician assessments and commitments
  | 'ai_output'       // AI recommendations, suggestions, drafts
  | 'ai_interaction'  // Clinician responses to AI output
  | 'comprehension'   // Error rate disclosure, comprehension checks
  | 'documentation'   // Override documentation, reasoning capture
  | 'ephemeral'       // AI suggestions that were shown but not persisted
  | 'viewer'          // Image/document viewer interactions
  | 'quality'         // Quality control and gaming detection flags
  | 'system';         // Platform-level system events

// ─── Event Types ────────────────────────────────────────────────────────────

/**
 * The complete taxonomy of clinical AI interaction events.
 *
 * Naming convention: CATEGORY_ACTION_DETAIL
 * - Past tense for completed actions (ASSESSMENT_SUBMITTED)
 * - Present tense for ongoing states (AI_SUGGESTION_DISPLAYED)
 */
export type EventType =
  // Session lifecycle
  | 'SESSION_STARTED'
  | 'SESSION_ENDED'
  | 'SESSION_PAUSED'
  | 'SESSION_RESUMED'
  | 'CONSENT_GIVEN'
  | 'CASE_STARTED'
  | 'CASE_COMPLETED'

  // Clinician assessments
  | 'ASSESSMENT_SUBMITTED'          // Clinician submitted an assessment
  | 'ASSESSMENT_LOCKED'             // Assessment cryptographically committed (pre-AI gate)
  | 'ASSESSMENT_REVISED'            // Assessment changed after AI reveal
  | 'CONFIDENCE_RECORDED'           // Clinician confidence level captured

  // AI outputs
  | 'AI_RECOMMENDATION_GENERATED'   // AI produced a recommendation (server-side)
  | 'AI_RECOMMENDATION_REVEALED'    // AI output shown to clinician (client-side)
  | 'AI_DRAFT_GENERATED'            // AI generated document text
  | 'AI_DRAFT_REVEALED'             // AI draft shown to clinician
  | 'AI_SCORE_GENERATED'            // AI produced a numeric score (risk, severity, etc.)
  | 'AI_SCORE_REVEALED'             // AI score shown to clinician
  | 'AI_CLASSIFICATION_GENERATED'   // AI produced a classification (ICD code, BI-RADS, etc.)
  | 'AI_CLASSIFICATION_REVEALED'    // AI classification shown to clinician

  // Clinician-AI interaction
  | 'AI_OUTPUT_ACCEPTED'            // Clinician accepted AI output without modification
  | 'AI_OUTPUT_MODIFIED'            // Clinician modified AI output
  | 'AI_OUTPUT_REJECTED'            // Clinician rejected AI output entirely
  | 'AI_OUTPUT_IGNORED'             // AI output was shown but clinician took no action on it
  | 'AI_DRAFT_EDITED'               // Clinician edited AI-generated text (with diff)

  // Comprehension and disclosure
  | 'ERROR_RATE_DISCLOSED'          // FDR/FOR or performance metrics shown to clinician
  | 'COMPREHENSION_CHECK_PRESENTED' // Comprehension question shown
  | 'COMPREHENSION_CHECK_ANSWERED'  // Clinician answered comprehension question
  | 'COMPREHENSION_GATE_PASSED'     // Clinician passed comprehension gate
  | 'COMPREHENSION_GATE_FAILED'     // Clinician failed comprehension gate

  // Documentation
  | 'OVERRIDE_DOCUMENTED'           // Clinician documented reason for disagreeing with AI
  | 'RATIONALE_RECORDED'            // Free-text or structured clinical reasoning captured
  | 'DOCUMENT_SECTION_ATTRIBUTED'   // Section of document attributed to AI, human, or mixed

  // Ephemeral AI influence (shown but not saved to clinical record)
  | 'EPHEMERAL_SUGGESTION_SHOWN'    // AI suggestion displayed (tooltip, sidebar, autocomplete)
  | 'EPHEMERAL_SUGGESTION_ENGAGED'  // Clinician interacted with the suggestion
  | 'EPHEMERAL_SUGGESTION_DISMISSED'// Suggestion dismissed or timed out
  | 'EPHEMERAL_PANEL_SHOWN'         // Differential/recommendation panel displayed
  | 'EPHEMERAL_PANEL_DISMISSED'     // Panel closed or navigated away

  // Viewer interactions (domain-agnostic)
  | 'VIEWER_INTERACTION'            // Scroll, zoom, pan, window preset change, etc.
  | 'VIEWER_MEASUREMENT_TAKEN'      // Clinician took a measurement in the viewer
  | 'VIEWER_ANNOTATION_ADDED'       // Clinician added an annotation

  // Quality signals
  | 'QUALITY_FLAG_RAISED'           // Automated quality concern detected
  | 'GAMING_PATTERN_DETECTED'       // Automated gaming/disengagement pattern detected

  // System events
  | 'SYSTEM_ERROR'                  // Platform error during session
  | 'SYSTEM_ATTESTATION'            // Server-side timestamp attestation
  | 'SYSTEM_EXPORT_GENERATED';      // Evidence export pack created

// ─── Event Payloads ─────────────────────────────────────────────────────────

/**
 * Base payload present on every event.
 * All fields are PHI-free by design.
 */
export interface BaseEventPayload {
  /** Human-readable description of what happened (no PHI) */
  description?: string;
  /** Domain-specific metadata (no PHI) */
  metadata?: Record<string, unknown>;
}

/** Assessment event payload */
export interface AssessmentPayload extends BaseEventPayload {
  /** Standardized code for the assessment (e.g., ICD-10, BI-RADS category, stenosis grade) */
  assessmentCode?: string;
  /** Code system (e.g., 'ICD-10', 'BI-RADS', 'custom') */
  codeSystem?: string;
  /** SHA-256 hash of the full assessment content (content stored separately) */
  contentHash: string;
  /** Assessment category (e.g., 'present', 'absent', 'indeterminate') */
  category?: string;
}

/** Confidence recording payload */
export interface ConfidencePayload extends BaseEventPayload {
  /** Confidence value (0-100) */
  value: number;
  /** Signal derived from value: CONFIDENT (67-100), UNCERTAIN (34-66), UNDECIDED (0-33) */
  signal: 'CONFIDENT' | 'UNCERTAIN' | 'UNDECIDED';
  /** What this confidence refers to */
  target: 'assessment' | 'ai_output' | 'diagnosis' | 'treatment';
}

/** AI output payload */
export interface AIOutputPayload extends BaseEventPayload {
  /** AI model identifier (e.g., 'cleerly-v2.0', 'aidoc-ich-v3') */
  modelId: string;
  /** Model version string */
  modelVersion?: string;
  /** AI confidence/probability score (0.0-1.0) */
  aiConfidence?: number;
  /** SHA-256 hash of the AI output content */
  contentHash: string;
  /** Output type */
  outputType: 'recommendation' | 'draft' | 'score' | 'classification' | 'segmentation';
  /** Urgency level if applicable */
  urgency?: 'STAT' | 'URGENT' | 'ROUTINE' | 'LOW';
}

/** AI interaction payload — clinician responding to AI */
export interface AIInteractionPayload extends BaseEventPayload {
  /** Reference to the AI output event being responded to */
  aiEventRef: string;
  /** What the clinician did */
  action: 'accepted' | 'modified' | 'rejected' | 'ignored';
  /** SHA-256 hash of clinician's version (if modified) */
  resultContentHash?: string;
  /** Time in ms between AI reveal and this action */
  deliberationTimeMs?: number;
  /** Confidence shift from pre-AI to post-AI (signed, percentage points) */
  confidenceShift?: number;
}

/** Text diff payload — for tracking AI draft → human edit */
export interface DiffPayload extends BaseEventPayload {
  /** Hash of the original (AI-generated) content */
  originalHash: string;
  /** Hash of the modified (human-edited) content */
  modifiedHash: string;
  /** Diff format used */
  diffFormat: 'json-patch' | 'quill-delta' | 'prosemirror-steps' | 'unified-diff' | 'myers';
  /** The diff itself (structural, not containing clinical text — only operations) */
  diff: unknown;
  /** Attribution summary */
  attribution: {
    /** Percentage of final content that is AI-originated (0-100) */
    aiOriginatedPercent: number;
    /** Percentage that is human-originated */
    humanOriginatedPercent: number;
    /** Percentage that is human-edited-from-AI */
    humanEditedPercent: number;
  };
}

/** Ephemeral suggestion payload */
export interface EphemeralPayload extends BaseEventPayload {
  /** What type of ephemeral UI element */
  elementType: 'tooltip' | 'sidebar_panel' | 'autocomplete' | 'inline_suggestion' | 'modal' | 'notification';
  /** Hash of the suggestion content */
  contentHash: string;
  /** How long the element was visible (ms) */
  displayDurationMs?: number;
  /** Whether the clinician's viewport included the element (Intersection Observer) */
  wasVisible: boolean;
  /** Percentage of element visible (0-100) */
  visibilityPercent?: number;
}

/** Override documentation payload */
export interface OverridePayload extends BaseEventPayload {
  /** Structured override reason code */
  reasonCode: string;
  /** Code system for override reasons */
  codeSystem: string;
  /** Category of override reason */
  category: 'clinical' | 'process' | 'agreement' | 'escalation' | 'other';
  /** Hash of any free-text rationale (text stored separately) */
  rationaleHash?: string;
}

/** Comprehension check payload */
export interface ComprehensionPayload extends BaseEventPayload {
  /** What was disclosed (e.g., 'FDR', 'FOR', 'sensitivity', 'specificity') */
  metricType: string;
  /** The disclosed value */
  metricValue: number;
  /** Whether the clinician answered correctly */
  answeredCorrectly?: boolean;
  /** Time spent on comprehension display (ms) */
  displayTimeMs?: number;
}

/** Viewer interaction payload */
export interface ViewerPayload extends BaseEventPayload {
  /** Type of viewer interaction */
  interactionType: 'scroll' | 'zoom' | 'pan' | 'window_preset' | 'measurement' | 'annotation' | 'rotate' | 'reset';
  /** Viewer-specific data (slice number, zoom level, window values, etc.) */
  viewerState?: Record<string, unknown>;
}

/** Quality flag payload */
export interface QualityPayload extends BaseEventPayload {
  /** Flag identifier */
  flagCode: string;
  /** Severity */
  severity: 'critical' | 'major' | 'minor' | 'info';
  /** Human-readable explanation */
  explanation: string;
  /** Evidence supporting the flag */
  evidence?: Record<string, unknown>;
}

/** Document section attribution payload */
export interface AttributionPayload extends BaseEventPayload {
  /** Section identifier within the document */
  sectionId: string;
  /** Who authored this section */
  author: 'ai' | 'human' | 'mixed';
  /** If mixed, what percentage is AI-originated */
  aiPercent?: number;
  /** Hash of the section content */
  contentHash: string;
}

/** System attestation payload */
export interface AttestationPayload extends BaseEventPayload {
  /** Server timestamp (trusted clock) */
  serverTimestamp: string;
  /** Hash of the attested content */
  attestedHash: string;
  /** Attestation method */
  method: 'server_clock' | 'rfc3161' | 'blockchain' | 'digistamp';
}

// ─── Payload Type Map ───────────────────────────────────────────────────────

/** Maps event types to their specific payload types */
export interface EventPayloadMap {
  // Session
  SESSION_STARTED: BaseEventPayload;
  SESSION_ENDED: BaseEventPayload;
  SESSION_PAUSED: BaseEventPayload;
  SESSION_RESUMED: BaseEventPayload;
  CONSENT_GIVEN: BaseEventPayload;
  CASE_STARTED: BaseEventPayload;
  CASE_COMPLETED: BaseEventPayload;

  // Assessment
  ASSESSMENT_SUBMITTED: AssessmentPayload;
  ASSESSMENT_LOCKED: AssessmentPayload;
  ASSESSMENT_REVISED: AssessmentPayload;
  CONFIDENCE_RECORDED: ConfidencePayload;

  // AI Output
  AI_RECOMMENDATION_GENERATED: AIOutputPayload;
  AI_RECOMMENDATION_REVEALED: AIOutputPayload;
  AI_DRAFT_GENERATED: AIOutputPayload;
  AI_DRAFT_REVEALED: AIOutputPayload;
  AI_SCORE_GENERATED: AIOutputPayload;
  AI_SCORE_REVEALED: AIOutputPayload;
  AI_CLASSIFICATION_GENERATED: AIOutputPayload;
  AI_CLASSIFICATION_REVEALED: AIOutputPayload;

  // AI Interaction
  AI_OUTPUT_ACCEPTED: AIInteractionPayload;
  AI_OUTPUT_MODIFIED: AIInteractionPayload;
  AI_OUTPUT_REJECTED: AIInteractionPayload;
  AI_OUTPUT_IGNORED: AIInteractionPayload;
  AI_DRAFT_EDITED: DiffPayload;

  // Comprehension
  ERROR_RATE_DISCLOSED: ComprehensionPayload;
  COMPREHENSION_CHECK_PRESENTED: ComprehensionPayload;
  COMPREHENSION_CHECK_ANSWERED: ComprehensionPayload;
  COMPREHENSION_GATE_PASSED: ComprehensionPayload;
  COMPREHENSION_GATE_FAILED: ComprehensionPayload;

  // Documentation
  OVERRIDE_DOCUMENTED: OverridePayload;
  RATIONALE_RECORDED: BaseEventPayload;
  DOCUMENT_SECTION_ATTRIBUTED: AttributionPayload;

  // Ephemeral
  EPHEMERAL_SUGGESTION_SHOWN: EphemeralPayload;
  EPHEMERAL_SUGGESTION_ENGAGED: EphemeralPayload;
  EPHEMERAL_SUGGESTION_DISMISSED: EphemeralPayload;
  EPHEMERAL_PANEL_SHOWN: EphemeralPayload;
  EPHEMERAL_PANEL_DISMISSED: EphemeralPayload;

  // Viewer
  VIEWER_INTERACTION: ViewerPayload;
  VIEWER_MEASUREMENT_TAKEN: ViewerPayload;
  VIEWER_ANNOTATION_ADDED: ViewerPayload;

  // Quality
  QUALITY_FLAG_RAISED: QualityPayload;
  GAMING_PATTERN_DETECTED: QualityPayload;

  // System
  SYSTEM_ERROR: BaseEventPayload;
  SYSTEM_ATTESTATION: AttestationPayload;
  SYSTEM_EXPORT_GENERATED: BaseEventPayload;
}

// ─── The Event ──────────────────────────────────────────────────────────────

/**
 * A single clinical AI interaction event.
 *
 * This is the atomic unit of decision provenance.
 * Events are append-only, immutable, and PHI-free.
 */
export interface ClinicalAIEvent<T extends EventType = EventType> {
  /** Unique event identifier (UUID v4) */
  id: string;
  /** Schema version for forward compatibility */
  schemaVersion: string;
  /** Sequential position in the event stream (0-indexed) */
  sequence: number;
  /** Event type from the taxonomy */
  type: T;
  /** Event category (derived from type) */
  category: EventCategory;
  /** ISO 8601 timestamp with millisecond precision */
  timestamp: string;
  /** Who performed the action */
  actor: Actor;

  // ── Context ──
  /** Session identifier (opaque, not a patient ID) */
  sessionId: string;
  /** Case/encounter identifier within the session (opaque) */
  caseId?: string;
  /** Study identifier (for research contexts) */
  studyId?: string;
  /** Domain identifier (e.g., 'ct-head', 'ct-cardiac', 'mammography', 'rehab-neuromod') */
  domain?: string;
  /** Condition code (for research: C1-C5 etc.) */
  condition?: string;

  // ── Payload ──
  /** Event-specific payload (type-safe via EventPayloadMap) */
  payload: T extends keyof EventPayloadMap ? EventPayloadMap[T] : BaseEventPayload;

  // ── Chain ──
  /** SHA-256 hash of this event's canonical form */
  eventHash?: string;
  /** SHA-256 hash of the previous event (chain link) */
  previousHash?: string;
  /** Digital signature of eventHash (Ed25519) */
  signature?: string;
}

// ─── Session Envelope ───────────────────────────────────────────────────────

/**
 * Wraps a complete sequence of events from one clinical encounter.
 * This is the unit of export/verification.
 */
export interface SessionEnvelope {
  /** Schema version */
  schemaVersion: string;
  /** Unique session identifier */
  sessionId: string;
  /** Study identifier (for research contexts) */
  studyId?: string;
  /** Clinical domain */
  domain: string;
  /** Condition (for research) */
  condition?: string;

  // ── Timing ──
  /** ISO 8601 start timestamp */
  startedAt: string;
  /** ISO 8601 end timestamp */
  endedAt?: string;
  /** Total duration in milliseconds */
  durationMs?: number;

  // ── Content ──
  /** Total event count */
  eventCount: number;
  /** Events in sequential order */
  events: ClinicalAIEvent[];

  // ── Integrity ──
  /** SHA-256 hash of the entire event array (canonical serialization) */
  rootHash?: string;
  /** Chain integrity status */
  chainIntegrity?: 'PASS' | 'FAIL' | 'UNCHECKED';
  /** Server attestation for session boundaries */
  attestation?: {
    startAttestation?: AttestationPayload;
    endAttestation?: AttestationPayload;
  };

  // ── Model Provenance ──
  /** AI model(s) used in this session */
  models?: ModelProvenance[];

  // ── Platform ──
  /** Platform that generated these events */
  platform: {
    name: string;
    version: string;
    buildHash?: string;
  };
}

/**
 * Provenance information about an AI model used in the session.
 * Aligned with EU AI Act Article 12 requirements.
 */
export interface ModelProvenance {
  /** Model identifier */
  modelId: string;
  /** Model version */
  modelVersion: string;
  /** Vendor/developer */
  vendor?: string;
  /** Known corrigibility score (0.0-1.0, from Lopez et al. 2026 or similar) */
  corrigibilityScore?: number;
  /** Citation for corrigibility data */
  corrigibilityCitation?: string;
  /** FDA clearance number if applicable */
  fdaClearanceNumber?: string;
  /** Date this model version was assessed */
  assessedDate?: string;
}

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Configuration for the event emitter.
 * Controls which events are captured and how.
 */
export interface EventSchemaConfig {
  /** Schema version (auto-set) */
  schemaVersion: string;
  /** Clinical domain */
  domain: string;
  /** Study ID (optional, for research contexts) */
  studyId?: string;
  /** Condition (optional, for research) */
  condition?: string;
  /** Whether to compute hash chains (default: true) */
  enableChaining: boolean;
  /** Whether to sign events (requires Ed25519 key) */
  enableSigning: boolean;
  /** Hash algorithm (default: 'SHA-256') */
  hashAlgorithm: 'SHA-256';
  /** Ephemeral tracking configuration */
  ephemeral: {
    /** Track ephemeral AI suggestions (default: true) */
    enabled: boolean;
    /** Minimum display time to count as "viewed" (ms, default: 500) */
    minViewDurationMs: number;
    /** Minimum visibility percent to count as "viewed" (default: 50) */
    minVisibilityPercent: number;
  };
  /** Platform info included in session envelope */
  platform: {
    name: string;
    version: string;
    buildHash?: string;
  };
}
