const assert = require("node:assert/strict");
const engine = require("../shariah-decision-engine.js");

function evidence(status = "PASS", checkedAt = new Date().toISOString()) {
  return {
    status,
    sourceUrl: "https://example.org/auditable-screening-record",
    methodologyId: "fixture-methodology-v1",
    checkedAt
  };
}

const defaultDecision = engine.evaluate({
  symbol: "AAPL",
  transaction: {},
  screening: {},
  policyReview: {}
});
assert.equal(defaultDecision.decision, "UNABLE_TO_VERIFY");
assert.equal(defaultDecision.allowed, false);
assert.equal(defaultDecision.checks.length, 9);
assert.ok(defaultDecision.checks.some(check => check.ruleId === "BUSINESS_ACTIVITY" && check.status === "UNKNOWN"));

const marginDecision = engine.evaluate({
  symbol: "AAPL",
  transaction: { interestBearingMargin: true },
  screening: {},
  policyReview: {}
});
assert.equal(marginDecision.decision, "REJECTED");
assert.equal(marginDecision.checks.find(check => check.ruleId === "NO_INTEREST_MARGIN").status, "FAIL");

const stale = evidence("PASS", new Date(Date.now() - 31 * 86400000).toISOString());
const staleDecision = engine.evaluate({
  symbol: "MSFT",
  transaction: {},
  screening: { businessActivity: stale, financialRatios: evidence() },
  policyReview: {}
});
assert.equal(staleDecision.decision, "UNABLE_TO_VERIFY");
assert.equal(staleDecision.checks.find(check => check.ruleId === "BUSINESS_ACTIVITY").status, "UNKNOWN");

const now = new Date().toISOString();
const validDecision = engine.evaluate({
  symbol: "TEST",
  policyReview: {
    status: "approved",
    methodologyId: "scholar-reviewed-method-v1",
    reviewer: "Test reviewer fixture",
    methodologyUrl: "https://example.org/methodology",
    reviewEvidenceUrl: "https://example.org/review-record",
    reviewedAt: now
  },
  screening: { businessActivity: evidence(), financialRatios: evidence() },
  transaction: {
    instrumentType: "ordinary_share",
    contractEvidence: evidence(),
    termsEvidence: evidence(),
    interestBearingMargin: false,
    shortSelling: false,
    derivative: false,
    ownershipSettlementEvidence: evidence()
  }
});
assert.equal(validDecision.decision, "PERMITTED_UNDER_POLICY");
assert.equal(validDecision.allowed, true);

console.log("Shariah decision engine tests passed: unknown blocks, prohibited financing rejects, stale evidence blocks, complete fixture evaluates.");
