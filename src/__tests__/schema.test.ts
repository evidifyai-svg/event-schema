import { describe, it, expect } from 'vitest';
import {
  // Types
  type ClinicalAIEvent,
  type Actor,
  type SessionEnvelope,

  // Factory
  SCHEMA_VERSION,
  ALL_EVENT_TYPES,
  ALL_EVENT_CATEGORIES,
  createEvent,
  getEventCategory,
  deriveConfidenceSignal,
  sessionStarted,
  assessmentLocked,
  aiRecommendationRevealed,
  aiInteraction,
  ephemeralShown,
  confidenceRecorded,
  overrideDocumented,

  // Validation
  validateEvent,
  validatePayload,
  validateSession,
  detectPotentialPHI,

  // Serialization
  canonicalize,
  canonicalizeEvent,
  sha256Sync,
  hashAndChainSync,
  extractHashableFields,

  // Session
  SessionBuilder,
  GENESIS_HASH,
  verifySessionChain,

  // Emitter
  ClinicalEventEmitter,
} from '../index';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

const clinician: Actor = { role: 'clinician', sessionToken: 'test-clinician-001' };
const aiSystem: Actor = { role: 'ai_system', sessionToken: 'test-ai-001' };
const platform: Actor = { role: 'platform', sessionToken: 'system' };

const testContext = {
  sessionId: 'test-session-001',
  caseId: 'case-001',
  studyId: 'STUDY-001',
  domain: 'ct-cardiac',
  condition: 'C4',
};

// ─── Event Factory Tests ────────────────────────────────────────────────────

describe('Event Factory', () => {
  it('should have all event types mapped to categories', () => {
    expect(ALL_EVENT_TYPES.length).toBeGreaterThan(30);
    for (const type of ALL_EVENT_TYPES) {
      const category = getEventCategory(type);
      expect(ALL_EVENT_CATEGORIES).toContain(category);
    }
  });

  it('should create a basic event with all required fields', () => {
    const event = createEvent('SESSION_STARTED', clinician, {}, testContext, 0);

    expect(event.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(event.schemaVersion).toBe(SCHEMA_VERSION);
    expect(event.sequence).toBe(0);
    expect(event.type).toBe('SESSION_STARTED');
    expect(event.category).toBe('session');
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.actor).toEqual(clinician);
    expect(event.sessionId).toBe('test-session-001');
    expect(event.caseId).toBe('case-001');
    expect(event.domain).toBe('ct-cardiac');
  });

  it('should create assessment locked events with contentHash', () => {
    const event = assessmentLocked(clinician, 'abc123hash', testContext, 3, {
      assessmentCode: 'present',
      codeSystem: 'custom',
      category: 'present',
    });

    expect(event.type).toBe('ASSESSMENT_LOCKED');
    expect(event.category).toBe('assessment');
    expect(event.payload.contentHash).toBe('abc123hash');
    expect(event.payload.assessmentCode).toBe('present');
  });

  it('should create AI recommendation revealed events', () => {
    const event = aiRecommendationRevealed(
      aiSystem, 'cleerly-v2.0', 'ai-hash-456', testContext, 5,
      { aiConfidence: 0.87, urgency: 'URGENT' },
    );

    expect(event.type).toBe('AI_RECOMMENDATION_REVEALED');
    expect(event.category).toBe('ai_output');
    expect(event.payload.modelId).toBe('cleerly-v2.0');
    expect(event.payload.aiConfidence).toBe(0.87);
    expect(event.payload.urgency).toBe('URGENT');
  });

  it('should create AI interaction events for all action types', () => {
    for (const action of ['accepted', 'modified', 'rejected', 'ignored'] as const) {
      const event = aiInteraction(clinician, action, 'ai-event-ref', testContext, 6);
      expect(event.payload.action).toBe(action);
      expect(event.category).toBe('ai_interaction');
    }
  });

  it('should create ephemeral suggestion events', () => {
    const event = ephemeralShown(aiSystem, 'sidebar_panel', 'diff-hash', testContext, 7);

    expect(event.type).toBe('EPHEMERAL_SUGGESTION_SHOWN');
    expect(event.category).toBe('ephemeral');
    expect(event.payload.elementType).toBe('sidebar_panel');
    expect(event.payload.wasVisible).toBe(true);
  });

  it('should derive confidence signals correctly', () => {
    expect(deriveConfidenceSignal(0)).toBe('UNDECIDED');
    expect(deriveConfidenceSignal(33)).toBe('UNDECIDED');
    expect(deriveConfidenceSignal(34)).toBe('UNCERTAIN');
    expect(deriveConfidenceSignal(66)).toBe('UNCERTAIN');
    expect(deriveConfidenceSignal(67)).toBe('CONFIDENT');
    expect(deriveConfidenceSignal(100)).toBe('CONFIDENT');
  });

  it('should create confidence events with derived signal', () => {
    const event = confidenceRecorded(clinician, 75, 'assessment', testContext, 4);
    expect(event.payload.value).toBe(75);
    expect(event.payload.signal).toBe('CONFIDENT');
  });

  it('should create override events with structured codes', () => {
    const event = overrideDocumented(
      clinician, 'CCT-OR-03', 'evidify-cardiac', 'clinical', testContext, 8, 'rationale-hash',
    );
    expect(event.payload.reasonCode).toBe('CCT-OR-03');
    expect(event.payload.category).toBe('clinical');
    expect(event.payload.rationaleHash).toBe('rationale-hash');
  });
});

// ─── Validation Tests ───────────────────────────────────────────────────────

describe('Validation', () => {
  it('should validate a correct event', () => {
    const event = createEvent('SESSION_STARTED', clinician, {}, testContext, 0);
    const result = validateEvent(event);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject null input', () => {
    const result = validateEvent(null);
    expect(result.valid).toBe(false);
  });

  it('should reject missing required fields', () => {
    const result = validateEvent({ type: 'SESSION_STARTED' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown event types', () => {
    const event = createEvent('SESSION_STARTED', clinician, {}, testContext, 0);
    (event as any).type = 'FAKE_EVENT_TYPE';
    const result = validateEvent(event);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'type')).toBe(true);
  });

  it('should reject mismatched category', () => {
    const event = createEvent('SESSION_STARTED', clinician, {}, testContext, 0);
    (event as any).category = 'ai_output'; // wrong category
    const result = validateEvent(event);
    expect(result.valid).toBe(false);
  });

  it('should validate assessment payloads', () => {
    const good = validatePayload('ASSESSMENT_LOCKED', { contentHash: 'abc123' });
    expect(good.valid).toBe(true);

    const bad = validatePayload('ASSESSMENT_LOCKED', {});
    expect(bad.valid).toBe(false);
  });

  it('should validate confidence payloads', () => {
    const good = validatePayload('CONFIDENCE_RECORDED', { value: 75, signal: 'CONFIDENT', target: 'assessment' });
    expect(good.valid).toBe(true);

    const bad = validatePayload('CONFIDENCE_RECORDED', { value: 150, signal: 'WRONG' });
    expect(bad.valid).toBe(false);
  });

  it('should detect potential PHI patterns', () => {
    const cleanEvent = createEvent('SESSION_STARTED', clinician, { description: 'Session began' }, testContext, 0);
    expect(detectPotentialPHI(cleanEvent).valid).toBe(true);

    const dirtyEvent = createEvent('SESSION_STARTED', clinician, {
      description: 'Patient SSN: 123-45-6789',
    } as any, testContext, 0);
    expect(detectPotentialPHI(dirtyEvent).valid).toBe(false);
  });
});

// ─── Serialization Tests ────────────────────────────────────────────────────

describe('Serialization', () => {
  it('should produce deterministic canonical JSON', () => {
    const a = { z: 1, a: 2, m: { b: 3, a: 4 } };
    const b = { a: 2, m: { a: 4, b: 3 }, z: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('should sort keys at every depth', () => {
    const result = canonicalize({ z: 1, a: { z: 2, a: 3 } });
    expect(result).toBe('{"a":{"a":3,"z":2},"z":1}');
  });

  it('should handle arrays without reordering', () => {
    const result = canonicalize([3, 1, 2]);
    expect(result).toBe('[3,1,2]');
  });

  it('should omit undefined values', () => {
    const result = canonicalize({ a: 1, b: undefined, c: 3 });
    expect(result).toBe('{"a":1,"c":3}');
  });

  it('should preserve null values', () => {
    const result = canonicalize({ a: null });
    expect(result).toBe('{"a":null}');
  });

  it('should convert NaN and Infinity to null', () => {
    expect(canonicalize({ a: NaN })).toBe('{"a":null}');
    expect(canonicalize({ a: Infinity })).toBe('{"a":null}');
  });

  it('should extract hashable fields excluding chain metadata', () => {
    const event = createEvent('SESSION_STARTED', clinician, {}, testContext, 0);
    event.eventHash = 'should-be-excluded';
    event.previousHash = 'should-be-excluded';
    event.signature = 'should-be-excluded';

    const fields = extractHashableFields(event);
    expect('eventHash' in fields).toBe(false);
    expect('previousHash' in fields).toBe(false);
    expect('signature' in fields).toBe(false);
    expect(fields.id).toBe(event.id);
  });

  it('should produce consistent SHA-256 hashes', () => {
    const hash1 = sha256Sync('hello world');
    const hash2 = sha256Sync('hello world');
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce different hashes for different inputs', () => {
    const hash1 = sha256Sync('hello');
    const hash2 = sha256Sync('world');
    expect(hash1).not.toBe(hash2);
  });

  it('should hash-and-chain events', () => {
    const event = createEvent('SESSION_STARTED', clinician, {}, testContext, 0);
    const hash = hashAndChainSync(event, GENESIS_HASH);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(event.eventHash).toBe(hash);
    expect(event.previousHash).toBe(GENESIS_HASH);
  });
});

// ─── Session Builder Tests ──────────────────────────────────────────────────

describe('SessionBuilder', () => {
  it('should create a session with auto-generated ID', () => {
    const session = new SessionBuilder({ domain: 'ct-cardiac' });
    expect(session.id).toBeTruthy();
    expect(session.id).toContain('ctcardiac');
  });

  it('should emit events with incrementing sequences', () => {
    const session = new SessionBuilder({ domain: 'ct-head', enableChaining: false });
    session.start(clinician);
    session.emit('CASE_STARTED', clinician, {});
    session.emit('ASSESSMENT_LOCKED', clinician, { contentHash: 'hash1' });

    const events = session.getEvents();
    expect(events[0].sequence).toBe(0);
    expect(events[1].sequence).toBe(1);
    expect(events[2].sequence).toBe(2);
  });

  it('should build hash chains when enabled', () => {
    const session = new SessionBuilder({ domain: 'ct-head', enableChaining: true });
    session.start(clinician);
    session.emit('ASSESSMENT_LOCKED', clinician, { contentHash: 'hash1' });
    session.emit('AI_RECOMMENDATION_REVEALED', aiSystem, {
      modelId: 'test', contentHash: 'ai-hash', outputType: 'recommendation',
    });

    const events = session.getEvents();
    expect(events[0].previousHash).toBe(GENESIS_HASH);
    expect(events[0].eventHash).toMatch(/^[a-f0-9]{64}$/);
    expect(events[1].previousHash).toBe(events[0].eventHash);
    expect(events[2].previousHash).toBe(events[1].eventHash);
  });

  it('should verify chain integrity', () => {
    const session = new SessionBuilder({ domain: 'ct-head', enableChaining: true });
    session.start(clinician);
    session.emit('CASE_STARTED', clinician, {});
    session.emit('ASSESSMENT_LOCKED', clinician, { contentHash: 'h' });
    session.end(platform);

    expect(session.verifyChain().valid).toBe(true);
  });

  it('should produce a valid session envelope', () => {
    const session = new SessionBuilder({
      domain: 'ct-cardiac',
      studyId: 'STUDY-1',
      condition: 'C4',
      platform: { name: 'Evidify', version: '1.0.0' },
    });

    session.start(clinician);
    session.setCase('case-1');
    session.emit('ASSESSMENT_LOCKED', clinician, { contentHash: 'h1' });
    session.emit('AI_RECOMMENDATION_REVEALED', aiSystem, {
      modelId: 'test-model', contentHash: 'ai-h1', outputType: 'recommendation',
    });
    session.emit('AI_OUTPUT_ACCEPTED', clinician, {
      aiEventRef: 'ref1', action: 'accepted',
    });
    session.end(platform);

    const envelope = session.toEnvelope();
    expect(envelope.schemaVersion).toBe(SCHEMA_VERSION);
    expect(envelope.sessionId).toBe(session.id);
    expect(envelope.domain).toBe('ct-cardiac');
    expect(envelope.studyId).toBe('STUDY-1');
    expect(envelope.condition).toBe('C4');
    expect(envelope.eventCount).toBe(5);
    expect(envelope.events).toHaveLength(5);
    expect(envelope.platform.name).toBe('Evidify');
    expect(envelope.chainIntegrity).toBe('PASS');
    expect(envelope.rootHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should reject events after sealing', () => {
    const session = new SessionBuilder({ domain: 'test' });
    session.start(clinician);
    session.end(platform);

    expect(() => session.emit('CASE_STARTED', clinician, {})).toThrow('sealed');
  });

  it('should find events by type and case', () => {
    const session = new SessionBuilder({ domain: 'test', enableChaining: false });
    session.start(clinician);
    session.setCase('case-1');
    session.emit('ASSESSMENT_LOCKED', clinician, { contentHash: 'h1' });
    session.setCase('case-2');
    session.emit('ASSESSMENT_LOCKED', clinician, { contentHash: 'h2' });

    expect(session.findByType('ASSESSMENT_LOCKED')).toHaveLength(2);
    expect(session.findByCase('case-1')).toHaveLength(1);
    expect(session.findByCase('case-2')).toHaveLength(1);
  });

  it('should add model provenance', () => {
    const session = new SessionBuilder({ domain: 'test' });
    session.addModel({
      modelId: 'cleerly-v2.0',
      modelVersion: '2.0.1',
      vendor: 'Cleerly Inc.',
      corrigibilityScore: 0.72,
      corrigibilityCitation: 'Lopez et al. arXiv 2026',
    });
    session.start(clinician);
    session.end();

    const envelope = session.toEnvelope();
    expect(envelope.models).toHaveLength(1);
    expect(envelope.models![0].modelId).toBe('cleerly-v2.0');
    expect(envelope.models![0].corrigibilityScore).toBe(0.72);
  });
});

// ─── Session Verification Tests ─────────────────────────────────────────────

describe('Session Verification', () => {
  it('should verify a valid session chain', () => {
    const session = new SessionBuilder({ domain: 'test', enableChaining: true });
    session.start(clinician);
    session.emit('ASSESSMENT_LOCKED', clinician, { contentHash: 'h' });
    session.end();

    const envelope = session.toEnvelope();
    const result = verifySessionChain(envelope);
    expect(result.valid).toBe(true);
  });

  it('should detect a broken chain', () => {
    const session = new SessionBuilder({ domain: 'test', enableChaining: true });
    session.start(clinician);
    session.emit('ASSESSMENT_LOCKED', clinician, { contentHash: 'h' });
    session.end();

    const envelope = session.toEnvelope();
    // Tamper with chain
    envelope.events[1].previousHash = 'tampered-hash-value-that-is-exactly-64-chars-long-xxxxxxxxxxxx';

    const result = verifySessionChain(envelope);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it('should validate a complete session envelope', () => {
    const session = new SessionBuilder({
      domain: 'ct-head',
      platform: { name: 'Test', version: '1.0' },
    });
    session.start(clinician);
    session.end();

    const envelope = session.toEnvelope();
    const result = validateSession(envelope);
    expect(result.valid).toBe(true);
  });
});

// ─── Emitter Tests ──────────────────────────────────────────────────────────

describe('ClinicalEventEmitter', () => {
  it('should emit events and notify listeners', () => {
    const events: ClinicalAIEvent[] = [];
    const emitter = new ClinicalEventEmitter({
      domain: 'rehab-neuromod',
      platform: { name: 'PMP', version: '2.0' },
      flushIntervalMs: 0,
      onEvent: (e) => events.push(e),
    });

    emitter.startSession(clinician);
    emitter.assessmentLocked(clinician, 'hash-1');
    emitter.aiRevealed(aiSystem, 'model-1', 'ai-hash-1');
    emitter.aiAccepted(clinician, 'ref-1', 3500);

    expect(events).toHaveLength(4);
    expect(events[0].type).toBe('SESSION_STARTED');
    expect(events[1].type).toBe('ASSESSMENT_LOCKED');
    expect(events[2].type).toBe('AI_RECOMMENDATION_REVEALED');
    expect(events[3].type).toBe('AI_OUTPUT_ACCEPTED');

    emitter.destroy();
  });

  it('should support type-specific listeners', () => {
    const aiEvents: ClinicalAIEvent[] = [];
    const emitter = new ClinicalEventEmitter({
      domain: 'test',
      flushIntervalMs: 0,
    });

    emitter.onType('AI_RECOMMENDATION_REVEALED', (e) => aiEvents.push(e));
    emitter.startSession(clinician);
    emitter.aiRevealed(aiSystem, 'model', 'hash');
    emitter.emit('CASE_COMPLETED', clinician, {});

    expect(aiEvents).toHaveLength(1);
    expect(aiEvents[0].type).toBe('AI_RECOMMENDATION_REVEALED');

    emitter.destroy();
  });

  it('should flush buffer on session end', async () => {
    const flushed: ClinicalAIEvent[][] = [];
    const emitter = new ClinicalEventEmitter({
      domain: 'test',
      flushIntervalMs: 0,
      onFlush: async (events) => { flushed.push([...events]); },
    });

    emitter.startSession(clinician);
    emitter.emit('CASE_STARTED', clinician, {});
    const envelope = emitter.endSession();

    // Allow async flush to complete
    await new Promise(r => setTimeout(r, 50));

    expect(flushed.length).toBeGreaterThan(0);
    expect(envelope.eventCount).toBe(3);
    expect(envelope.domain).toBe('test');

    emitter.destroy();
  });

  it('should track ephemeral suggestions', () => {
    const events: ClinicalAIEvent[] = [];
    const emitter = new ClinicalEventEmitter({
      domain: 'rehab-neuromod',
      flushIntervalMs: 0,
      onEvent: (e) => events.push(e),
    });

    emitter.startSession(clinician);
    emitter.ephemeralShown(aiSystem, 'sidebar_panel', 'diff-hash');
    emitter.ephemeralDismissed(aiSystem, 'sidebar_panel', 'diff-hash', 3200);

    const shown = events.find(e => e.type === 'EPHEMERAL_SUGGESTION_SHOWN');
    const dismissed = events.find(e => e.type === 'EPHEMERAL_SUGGESTION_DISMISSED');

    expect(shown).toBeTruthy();
    expect(shown!.payload.elementType).toBe('sidebar_panel');
    expect(dismissed).toBeTruthy();
    expect(dismissed!.payload.displayDurationMs).toBe(3200);

    emitter.destroy();
  });

  it('should produce a verifiable session envelope', () => {
    const emitter = new ClinicalEventEmitter({
      domain: 'ct-cardiac',
      studyId: 'CARDIAC-DEMO',
      platform: { name: 'Evidify', version: '1.0' },
      enableChaining: true,
      flushIntervalMs: 0,
    });

    emitter.startSession(clinician);
    emitter.setCase('CCT-001');
    emitter.assessmentLocked(clinician, 'pre-ai-hash');
    emitter.aiRevealed(aiSystem, 'cleerly-v2', 'ai-hash', { aiConfidence: 0.91 });
    emitter.aiAccepted(clinician, 'ref', 4200);
    emitter.overrideDocumented(clinician, 'CCT-OR-01', 'evidify-cardiac', 'clinical');
    const envelope = emitter.endSession();

    expect(envelope.chainIntegrity).toBe('PASS');
    expect(envelope.eventCount).toBe(6);

    const verification = verifySessionChain(envelope);
    expect(verification.valid).toBe(true);

    emitter.destroy();
  });
});

// ─── Domain Agnosticism Tests ───────────────────────────────────────────────

describe('Domain Agnosticism', () => {
  it('should work for radiology', () => {
    const session = new SessionBuilder({ domain: 'ct-head', enableChaining: false });
    session.start(clinician);
    session.emit('ASSESSMENT_LOCKED', clinician, {
      contentHash: 'h', category: 'present', codeSystem: 'custom',
    });
    expect(session.eventCount).toBe(2);
  });

  it('should work for cardiac imaging', () => {
    const session = new SessionBuilder({ domain: 'ct-cardiac', enableChaining: false });
    session.start(clinician);
    session.emit('ASSESSMENT_LOCKED', clinician, {
      contentHash: 'h', assessmentCode: 'stenosis-present', codeSystem: 'custom',
    });
    expect(session.eventCount).toBe(2);
  });

  it('should work for rehabilitation/neuromodulation', () => {
    const session = new SessionBuilder({ domain: 'rehab-neuromod', enableChaining: false });
    session.start(clinician);
    session.emit('AI_DRAFT_GENERATED', aiSystem, {
      modelId: 'pmp-copilot', contentHash: 'draft-h', outputType: 'draft',
    });
    session.emit('AI_DRAFT_EDITED', clinician, {
      originalHash: 'draft-h',
      modifiedHash: 'edited-h',
      diffFormat: 'json-patch',
      diff: [{ op: 'replace', path: '/diagnosis', value: 'updated' }],
      attribution: { aiOriginatedPercent: 60, humanOriginatedPercent: 10, humanEditedPercent: 30 },
    });
    expect(session.eventCount).toBe(3);
  });

  it('should work for mammography', () => {
    const session = new SessionBuilder({ domain: 'mammography', enableChaining: false });
    session.start(clinician);
    session.emit('ASSESSMENT_LOCKED', clinician, {
      contentHash: 'h', assessmentCode: '4', codeSystem: 'BI-RADS',
    });
    expect(session.eventCount).toBe(2);
  });

  it('should work for ambient AI scribes', () => {
    const session = new SessionBuilder({ domain: 'ambient-scribe', enableChaining: false });
    session.start(clinician);
    session.emit('AI_DRAFT_GENERATED', aiSystem, {
      modelId: 'abridge-v3', contentHash: 'note-h', outputType: 'draft',
    });
    session.emit('DOCUMENT_SECTION_ATTRIBUTED', platform, {
      sectionId: 'hpi-paragraph-1',
      author: 'mixed',
      aiPercent: 70,
      contentHash: 'section-h',
    });
    expect(session.eventCount).toBe(3);
  });
});
