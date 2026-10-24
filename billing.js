// PersonaAI Billing v2.2 - local MVP credits with safe refund semantics
(function () {
  'use strict';

  const LS_CREDITS = 'persona_credits';
  const LS_CREDITS_V2 = 'personaai_credits_v2';
  const LS_PRO = 'persona_pro';
  const LS_PRO_OLD = 'pro';
  const LS_TOKENS = 'persona_processed_tokens';
  const DEFAULT_CREDITS = 3;

  function safeInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getCredits() {
    try {
      const primary = localStorage.getItem(LS_CREDITS);
      const legacy = localStorage.getItem(LS_CREDITS_V2);
      if (primary === null && legacy !== null) {
        localStorage.setItem(LS_CREDITS, legacy);
        return Math.max(0, safeInt(legacy, DEFAULT_CREDITS));
      }
      return Math.max(0, safeInt(primary, DEFAULT_CREDITS));
    } catch (_) {
      return DEFAULT_CREDITS;
    }
  }

  function emitCredits(credits) {
    try {
      window.dispatchEvent(new CustomEvent('persona-credits-changed', {
        detail: { credits }
      }));
    } catch (_) {}
  }

  function setCredits(value) {
    const credits = Math.max(0, safeInt(value, 0));
    try {
      localStorage.setItem(LS_CREDITS, String(credits));
      localStorage.setItem(LS_CREDITS_V2, String(credits));
    } catch (_) {}
    emitCredits(credits);
    return credits;
  }

  function isPro() {
    try {
      return localStorage.getItem(LS_PRO) === '1' ||
        localStorage.getItem(LS_PRO_OLD) === '1' ||
        window._persona_google_pro_verified === true;
    } catch (_) {
      return false;
    }
  }

  function spendCreditsOrRefund(cost) {
    const normalizedCost = Math.max(0, safeInt(cost, 1));
    if (normalizedCost === 0 || isPro()) {
      return { success: true, credits: getCredits(), refund() {} };
    }

    const current = getCredits();
    if (current < normalizedCost) {
      return {
        success: false,
        reason: 'no_credits',
        credits: current,
        refund() {}
      };
    }

    setCredits(current - normalizedCost);
    let refunded = false;
    return {
      success: true,
      credits: getCredits(),
      refund() {
        if (refunded) return;
        refunded = true;
        setCredits(getCredits() + normalizedCost);
      }
    };
  }

  function addCredits(amount) {
    return setCredits(getCredits() + safeInt(amount, 0));
  }

  function getProcessedTokens() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LS_TOKENS) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function addProcessedToken(token) {
    if (!token) return false;
    try {
      const tokens = getProcessedTokens();
      if (tokens.includes(token)) return false;
      tokens.push(token);
      if (tokens.length > 100) tokens.splice(0, tokens.length - 100);
      localStorage.setItem(LS_TOKENS, JSON.stringify(tokens));
      return true;
    } catch (_) {
      return false;
    }
  }

  async function consumePurchase(token) {
    if (!addProcessedToken(token)) return false;
    // MVP only. Before paid launch, verify the Google Play token on the server.
    addCredits(10);
    return true;
  }

  const PersonaBilling = {
    version: '2.2-mvp',
    safeInt,
    getCredits,
    setCredits,
    isPro,
    spendCreditsOrRefund,
    addCredits,
    consumePurchase,
    getProcessedTokens,
    get credits() { return getCredits(); },
    set credits(value) { setCredits(value); }
  };

  window.PersonaBilling = PersonaBilling;
  window.isProUserBilling = isPro;
  try {
    window.dispatchEvent(new CustomEvent('persona-billing-ready'));
  } catch (_) {}
})();
