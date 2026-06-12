// Run with: npm test (uses node --test)
// Covers tier boundaries for each preset cancellation policy.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  computeCustomerRefund,
  getPolicy,
  isValidPolicy,
  listPolicies,
  POLICY_KEYS,
  DEFAULT_POLICY
} from './refund.js';

const NOW = new Date('2026-06-15T12:00:00Z');
const startAt = (hoursBefore) => new Date(NOW.getTime() + hoursBefore * 3600 * 1000);

// ── Policy registry shape ──────────────────────────────────────────────────

test('POLICY_KEYS contains exactly flexible, standard, strict', () => {
  assert.deepEqual([...POLICY_KEYS].sort(), ['flexible', 'standard', 'strict']);
});
test('DEFAULT_POLICY is standard (matches published /refund text)', () => {
  assert.equal(DEFAULT_POLICY, 'standard');
});
test('listPolicies returns label + tagline + tiers for each policy', () => {
  const all = listPolicies();
  assert.equal(all.length, 3);
  for (const p of all) {
    assert.ok(p.key && p.label && p.tagline, `policy ${p.key} missing fields`);
    assert.ok(p.tiers && typeof p.tiers.gt7d === 'number', `policy ${p.key} tiers shape`);
  }
});
test('isValidPolicy: valid keys return true, anything else returns false', () => {
  assert.equal(isValidPolicy('flexible'), true);
  assert.equal(isValidPolicy('standard'), true);
  assert.equal(isValidPolicy('strict'), true);
  assert.equal(isValidPolicy('bogus'), false);
  assert.equal(isValidPolicy(undefined), false);
  assert.equal(isValidPolicy(null), false);
});
test('getPolicy falls back to default for unknown keys', () => {
  const fallback = getPolicy('not-a-real-policy');
  assert.equal(fallback.key, 'standard');
});

// ── Standard policy (default — matches the lawyer-finalized /refund page) ──
// Boundaries: >7d=100%, 48h-7d=50%, <48h=0%

test('standard: 240h before trip → 100% refund', () => {
  const r = computeCustomerRefund(1000, startAt(240), NOW, 'standard');
  assert.equal(r.pct, 100);
  assert.equal(r.amount, 1000);
  assert.equal(r.policyKey, 'standard');
});
test('standard: 169h before trip (just over 7d) → 100% refund', () => {
  const r = computeCustomerRefund(1000, startAt(169), NOW, 'standard');
  assert.equal(r.pct, 100);
  assert.equal(r.amount, 1000);
});
test('standard: 168h before trip (exactly 7d) → 50% refund (boundary is >, not >=)', () => {
  const r = computeCustomerRefund(1000, startAt(168), NOW, 'standard');
  assert.equal(r.pct, 50);
  assert.equal(r.amount, 500);
});
test('standard: 72h before trip → 50% refund', () => {
  const r = computeCustomerRefund(1000, startAt(72), NOW, 'standard');
  assert.equal(r.pct, 50);
  assert.equal(r.amount, 500);
});
test('standard: 49h before trip (just over 48h) → 50% refund', () => {
  const r = computeCustomerRefund(1000, startAt(49), NOW, 'standard');
  assert.equal(r.pct, 50);
});
test('standard: 48h before trip (exactly 48h) → 0% refund', () => {
  const r = computeCustomerRefund(1000, startAt(48), NOW, 'standard');
  assert.equal(r.pct, 0);
  assert.equal(r.amount, 0);
});
test('standard: 47h before trip → 0% refund', () => {
  const r = computeCustomerRefund(1000, startAt(47), NOW, 'standard');
  assert.equal(r.pct, 0);
});
test('standard: trip already started (-1h) → 0% refund', () => {
  const r = computeCustomerRefund(1000, startAt(-1), NOW, 'standard');
  assert.equal(r.pct, 0);
});

// ── Flexible policy (renter-friendly) ──────────────────────────────────────
// Boundaries: >7d=100%, 48h-7d=100%, <48h=50%

test('flexible: 240h before trip → 100% refund', () => {
  const r = computeCustomerRefund(1000, startAt(240), NOW, 'flexible');
  assert.equal(r.pct, 100);
});
test('flexible: 72h before trip → 100% refund (vs 50% under standard)', () => {
  const r = computeCustomerRefund(1000, startAt(72), NOW, 'flexible');
  assert.equal(r.pct, 100);
  assert.equal(r.amount, 1000);
});
test('flexible: 24h before trip → 50% refund (vs 0% under standard)', () => {
  const r = computeCustomerRefund(1000, startAt(24), NOW, 'flexible');
  assert.equal(r.pct, 50);
  assert.equal(r.amount, 500);
});
test('flexible: 1h before trip → 50% refund', () => {
  const r = computeCustomerRefund(1000, startAt(1), NOW, 'flexible');
  assert.equal(r.pct, 50);
});

// ── Strict policy (owner-protective) ───────────────────────────────────────
// Boundaries: >7d=100%, 48h-7d=0%, <48h=0%

test('strict: 240h before trip → 100% refund (one always-on safety tier)', () => {
  const r = computeCustomerRefund(1000, startAt(240), NOW, 'strict');
  assert.equal(r.pct, 100);
});
test('strict: 169h before trip → 100% refund', () => {
  const r = computeCustomerRefund(1000, startAt(169), NOW, 'strict');
  assert.equal(r.pct, 100);
});
test('strict: 72h before trip → 0% refund (vs 50% under standard)', () => {
  const r = computeCustomerRefund(1000, startAt(72), NOW, 'strict');
  assert.equal(r.pct, 0);
  assert.equal(r.amount, 0);
});
test('strict: 24h before trip → 0% refund', () => {
  const r = computeCustomerRefund(1000, startAt(24), NOW, 'strict');
  assert.equal(r.pct, 0);
});

// ── Defaults / safety nets ─────────────────────────────────────────────────

test('missing policy key → defaults to standard', () => {
  const r = computeCustomerRefund(1000, startAt(72), NOW, undefined);
  assert.equal(r.policyKey, 'standard');
  assert.equal(r.pct, 50);
});
test('unknown policy key → defaults to standard', () => {
  const r = computeCustomerRefund(1000, startAt(72), NOW, 'made-up');
  assert.equal(r.policyKey, 'standard');
  assert.equal(r.pct, 50);
});
test('null startDate → 0% refund with informative reason', () => {
  const r = computeCustomerRefund(1000, null, NOW, 'standard');
  assert.equal(r.pct, 0);
  assert.equal(r.amount, 0);
  assert.match(r.reason, /No trip start date/i);
});
test('zero / NaN total → 0% refund', () => {
  const r1 = computeCustomerRefund(0, startAt(240), NOW, 'standard');
  assert.equal(r1.amount, 0);
  const r2 = computeCustomerRefund(NaN, startAt(240), NOW, 'standard');
  assert.equal(r2.amount, 0);
});
test('cents rounding: $999.99 × 50% = $500.00 (banker-friendly)', () => {
  const r = computeCustomerRefund(999.99, startAt(72), NOW, 'standard');
  assert.equal(r.amount, 500.00);
});
test('cents rounding: $33.33 × 50% = $16.67', () => {
  const r = computeCustomerRefund(33.33, startAt(72), NOW, 'standard');
  assert.equal(r.amount, 16.67);
});

// ── Response shape contract (what /cancel-preview and modal depend on) ─────

test('response always includes pct, amount, hoursToStart, reason, policyKey, policyLabel', () => {
  const r = computeCustomerRefund(500, startAt(100), NOW, 'flexible');
  assert.equal(typeof r.pct, 'number');
  assert.equal(typeof r.amount, 'number');
  assert.equal(typeof r.hoursToStart, 'number');
  assert.equal(typeof r.reason, 'string');
  assert.equal(r.policyKey, 'flexible');
  assert.equal(r.policyLabel, 'Flexible');
});
test('reason text always mentions the policy label (so the modal can rely on it)', () => {
  const r1 = computeCustomerRefund(1000, startAt(240), NOW, 'flexible');
  assert.match(r1.reason, /Flexible policy/);
  const r2 = computeCustomerRefund(1000, startAt(72), NOW, 'standard');
  assert.match(r2.reason, /Standard policy/);
  const r3 = computeCustomerRefund(1000, startAt(72), NOW, 'strict');
  assert.match(r3.reason, /Strict policy/);
});
