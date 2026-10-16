/* OBA AI Trader — deterministic Shariah decision engine.
 * Policy status: DRAFT / NOT SCHOLAR-APPROVED.
 * This module intentionally fails closed: missing, stale, or untraceable evidence
 * can never be treated as approval. It does not issue a fatwa.
 */
(function (root) {
  "use strict";

  const POLICY_VERSION = "oba-shariah-policy-draft-0.1.0";
  const POLICY_STATUS = "DRAFT_REQUIRES_QUALIFIED_SCHOLAR_REVIEW";

  const SOURCES = {
    quran2275: {
      id: "QURAN_2_275",
      title: "Qur'an 2:275",
      url: "https://quran.com/2/275",
      relevance: "Primary text distinguishing trade from riba; does not by itself resolve every modern instrument or contract."
    },
    quran429: {
      id: "QURAN_4_29",
      title: "Qur'an 4:29",
      url: "https://quran.com/4/29",
      relevance: "Primary text on avoiding wrongful consumption of wealth and trade by mutual consent."
    },
    muslim1513: {
      id: "SAHIH_MUSLIM_1513",
      title: "Sahih Muslim 1513",
      url: "https://sunnah.com/muslim/21/8",
      relevance: "Hadith source concerning the prohibition of gharar transactions; application to a specific product requires qualified interpretation."
    }
  };

  const RULES = [
    { id: "POLICY_AUTHORITY", label: "Approved methodology", category: "governance", explanation: "A named, versioned screening methodology must be reviewed and approved by a qualified Islamic-finance scholar before this engine can mark any trade permitted.", sources: [SOURCES.quran2275, SOURCES.quran429] },
    { id: "BUSINESS_ACTIVITY", label: "Issuer business activity", category: "asset_screening", explanation: "Current, traceable issuer activity screening is required. A ticker appearing on a demo watchlist is not evidence of permissibility.", sources: [SOURCES.quran429] },
    { id: "FINANCIAL_SCREEN", label: "Financial-ratio screening", category: "asset_screening", explanation: "Current financial data and the chosen methodology's ratio thresholds are required; no thresholds are assumed by this prototype.", sources: [SOURCES.quran2275] },
    { id: "CONTRACT_TYPE", label: "Instrument and contract structure", category: "transaction", explanation: "The actual instrument and contract terms must be known; a ticker alone cannot establish the transaction structure.", sources: [SOURCES.quran2275, SOURCES.quran429] },
    { id: "NO_INTEREST_MARGIN", label: "No interest-based margin", category: "riba", explanation: "An interest-bearing margin or financing arrangement triggers rejection under this conservative draft policy.", sources: [SOURCES.quran2275] },
    { id: "NO_SHORT_SELLING", label: "No short selling", category: "ownership", explanation: "Short selling is blocked by this conservative draft policy; instrument-specific scholarly review is still required.", sources: [SOURCES.quran429] },
    { id: "NO_DERIVATIVES", label: "No derivatives", category: "instrument", explanation: "Derivatives are blocked by this conservative draft policy until the exact contract and an approved scholarly policy are available.", sources: [SOURCES.quran2275, SOURCES.muslim1513] },
    { id: "OWNERSHIP_SETTLEMENT", label: "Ownership and settlement", category: "ownership", explanation: "Evidence of the relevant ownership/possession and settlement arrangement is required; it cannot be inferred from a quote.", sources: [SOURCES.quran429] },
    { id: "DATA_EVIDENCE", label: "Evidence completeness and freshness", category: "evidence", explanation: "Every required screening result needs a source, methodology/version, checked timestamp, and a passing status. Missing evidence remains unknown.", sources: [SOURCES.quran429] }
  ];

  function statusOf(value) {
    const s = String(value || "").trim().toUpperCase();
    if (["PASS", "PASSED", "APPROVED"].includes(s)) return "PASS";
    if (["FAIL", "FAILED", "REJECTED", "PROHIBITED"].includes(s)) return "FAIL";
    return "UNKNOWN";
  }

  function validEvidence(record) {
    if (!record || statusOf(record.status) !== "PASS") return false;
    if (!record.sourceUrl || !record.methodologyId || !record.checkedAt) return false;
    const t = Date.parse(record.checkedAt);
    return Number.isFinite(t) && t <= Date.now() && Date.now() - t <= 30 * 86400000;
  }

  function evaluate(input) {
    input = input || {};
    const symbol = String(input.symbol || "").trim().toUpperCase() || "UNKNOWN";
    const tx = input.transaction || {};
    const screening = input.screening || {};
    const policyReview = input.policyReview || {};
    const checks = [];
    const add = (ruleId, status, reason, sources) => {
      const rule = RULES.find(r => r.id === ruleId);
      checks.push({
        ruleId,
        label: rule ? rule.label : ruleId,
        status,
        reason,
        sources: (sources || (rule ? rule.sources : [])).map(s => ({ id: s.id, title: s.title, url: s.url, relevance: s.relevance }))
      });
    };

    const policyApproved = policyReview.status === "approved" &&
      typeof policyReview.methodologyId === "string" && policyReview.methodologyId.trim() &&
      typeof policyReview.reviewer === "string" && policyReview.reviewer.trim() &&
      typeof policyReview.reviewedAt === "string" && Number.isFinite(Date.parse(policyReview.reviewedAt));

    if (policyApproved) add("POLICY_AUTHORITY", "PASS", "A reviewed methodology record was supplied; its authenticity still requires server-side verification.");
    else add("POLICY_AUTHORITY", "UNKNOWN", "No verified scholar-approved methodology is configured. The draft engine cannot declare a trade permitted.");

    const business = screening.businessActivity;
    if (statusOf(business && business.status) === "FAIL") add("BUSINESS_ACTIVITY", "FAIL", business.reason || "Issuer activity screening failed.");
    else if (validEvidence(business)) add("BUSINESS_ACTIVITY", "PASS", "Issuer activity result has a recent timestamp, source, and methodology identifier.");
    else add("BUSINESS_ACTIVITY", "UNKNOWN", "No recent, traceable issuer business-activity screening result is available.");

    const ratios = screening.financialRatios;
    if (statusOf(ratios && ratios.status) === "FAIL") add("FINANCIAL_SCREEN", "FAIL", ratios.reason || "Financial-ratio screening failed.");
    else if (validEvidence(ratios)) add("FINANCIAL_SCREEN", "PASS", "Financial-ratio result has a recent timestamp, source, and methodology identifier.");
    else add("FINANCIAL_SCREEN", "UNKNOWN", "No recent, traceable financial-ratio screening result is available.");

    if (tx.instrumentType === "ordinary_share" && tx.contractTermsVerified === true) {
      add("CONTRACT_TYPE", "PASS", "Instrument is recorded as an ordinary share and its contract terms are marked verified.");
    } else {
      add("CONTRACT_TYPE", "UNKNOWN", "Instrument type or actual contract terms have not been verified.");
    }

    const binaryRule = (key, ruleId, passText, failText) => {
      if (tx[key] === true) add(ruleId, "FAIL", failText);
      else if (tx[key] === false) add(ruleId, "PASS", passText);
      else add(ruleId, "UNKNOWN", "Transaction detail is not verified.");
    };
    binaryRule("interestBearingMargin", "NO_INTEREST_MARGIN", "No interest-bearing margin is declared in the supplied transaction details.", "Interest-bearing margin/financing is declared; reject under the conservative draft policy.");
    binaryRule("shortSelling", "NO_SHORT_SELLING", "No short sale is declared in the supplied transaction details.", "Short selling is declared; reject under the conservative draft policy.");
    binaryRule("derivative", "NO_DERIVATIVES", "No derivative is declared in the supplied transaction details.", "A derivative is declared; reject under the conservative draft policy.");

    if (tx.ownershipAndSettlementVerified === true) add("OWNERSHIP_SETTLEMENT", "PASS", "Ownership/settlement is marked verified; supporting evidence must be checked before any live use.");
    else add("OWNERSHIP_SETTLEMENT", "UNKNOWN", "Ownership/possession and settlement evidence is not verified.");

    const requiredEvidence = [business, ratios];
    if (requiredEvidence.every(validEvidence)) add("DATA_EVIDENCE", "PASS", "Required screening records include source URLs, methodology IDs, and timestamps within 30 days.");
    else add("DATA_EVIDENCE", "UNKNOWN", "One or more screening records are missing, stale, or lack source/methodology metadata.");

    const failed = checks.some(c => c.status === "FAIL");
    const unknown = checks.some(c => c.status === "UNKNOWN");
    const decision = failed ? "REJECTED" : unknown ? "UNABLE_TO_VERIFY" : "PERMITTED_UNDER_POLICY";
    const reasons = checks.filter(c => c.status !== "PASS").map(c => ({ ruleId: c.ruleId, status: c.status, reason: c.reason }));
    return {
      decisionId: "shariah-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      createdAt: new Date().toISOString(),
      symbol,
      policyVersion: POLICY_VERSION,
      policyStatus: POLICY_STATUS,
      decision,
      allowed: decision === "PERMITTED_UNDER_POLICY",
      summary: decision === "REJECTED"
        ? "Rejected: at least one required rule failed."
        : decision === "UNABLE_TO_VERIFY"
          ? "Blocked: required evidence or approved methodology is missing or unverified."
          : "All configured draft-policy checks passed. This is not a fatwa or guarantee of Shariah compliance.",
      checks,
      reasons,
      sourceLibrary: Object.values(SOURCES)
    };
  }

  const api = { POLICY_VERSION, POLICY_STATUS, SOURCES, RULES, evaluate };
  root.OBA_SHARIAH_ENGINE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
