// PersonaAI Billing v2.3
// Local MVP credits with safe, single-use refund semantics.
// IMPORTANT: Before enabling real paid purchases, verify every
// Google Play purchase token on a secure server.

(function () {
  'use strict';

  const VERSION = '3.0-product';

  const STORAGE = Object.freeze({
    CREDITS: 'persona_credits',
    LEGACY_CREDITS: 'personaai_credits_v2',
    PRO: 'persona_pro',
    LEGACY_PRO: 'pro',
    PROCESSED_TOKENS: 'persona_processed_tokens',
    PENDING_TRANSACTIONS: 'persona_pending_transactions',
    QUALITY_REFUNDS: 'persona_quality_refunds_v3'
  });

  const DEFAULT_CREDITS = 3;
  const MAX_SAVED_TOKENS = 100;
  const MAX_SAVED_TRANSACTIONS = 50;

  function safeInt(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function createId(prefix = 'transaction') {
    try {
      if (crypto && typeof crypto.randomUUID === 'function') {
        return `${prefix}_${crypto.randomUUID()}`;
      }
    } catch (_) {}

    return `${prefix}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 12)}`;
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);

      if (!raw) {
        return fallback;
      }

      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function emitCredits(credits) {
    try {
      window.dispatchEvent(
        new CustomEvent('persona-credits-changed', {
          detail: {
            credits,
            isPro: isPro(),
            version: VERSION
          }
        })
      );
    } catch (_) {}
  }

  function emitTransaction(type, transaction) {
    try {
      window.dispatchEvent(
        new CustomEvent('persona-transaction', {
          detail: {
            type,
            transaction,
            credits: getCredits()
          }
        })
      );
    } catch (_) {}
  }

  function migrateLegacyCredits() {
    try {
      const current = localStorage.getItem(STORAGE.CREDITS);

      if (current !== null) {
        return;
      }

      const legacy = localStorage.getItem(STORAGE.LEGACY_CREDITS);

      if (legacy !== null) {
        const migratedCredits = Math.max(
          0,
          safeInt(legacy, DEFAULT_CREDITS)
        );

        localStorage.setItem(
          STORAGE.CREDITS,
          String(migratedCredits)
        );
      }
    } catch (_) {}
  }

  function getCredits() {
    migrateLegacyCredits();

    try {
      const raw = localStorage.getItem(STORAGE.CREDITS);

      if (raw === null) {
        return DEFAULT_CREDITS;
      }

      return Math.max(0, safeInt(raw, DEFAULT_CREDITS));
    } catch (_) {
      return DEFAULT_CREDITS;
    }
  }

  function setCredits(value) {
    const credits = Math.max(0, safeInt(value, 0));

    try {
      localStorage.setItem(STORAGE.CREDITS, String(credits));

      // Keep the old key synchronized so existing installations
      // remain compatible during the V34 transition.
      localStorage.setItem(
        STORAGE.LEGACY_CREDITS,
        String(credits)
      );
    } catch (_) {}

    emitCredits(credits);
    return credits;
  }

  function addCredits(amount) {
    const normalizedAmount = safeInt(amount, 0);

    if (normalizedAmount <= 0) {
      return getCredits();
    }

    return setCredits(getCredits() + normalizedAmount);
  }

  function isPro() {
    try {
      return (
        localStorage.getItem(STORAGE.PRO) === '1' ||
        localStorage.getItem(STORAGE.LEGACY_PRO) === '1' ||
        window._persona_google_pro_verified === true
      );
    } catch (_) {
      return false;
    }
  }

  function setLocalPro(value) {
    try {
      if (value) {
        localStorage.setItem(STORAGE.PRO, '1');
        localStorage.setItem(STORAGE.LEGACY_PRO, '1');
      } else {
        localStorage.removeItem(STORAGE.PRO);
        localStorage.removeItem(STORAGE.LEGACY_PRO);
      }
    } catch (_) {}

    emitCredits(getCredits());
    return isPro();
  }

  function getPendingTransactions() {
    const transactions = readJson(
      STORAGE.PENDING_TRANSACTIONS,
      []
    );

    return Array.isArray(transactions) ? transactions : [];
  }

  function savePendingTransactions(transactions) {
    const safeTransactions = Array.isArray(transactions)
      ? transactions.slice(-MAX_SAVED_TRANSACTIONS)
      : [];

    writeJson(
      STORAGE.PENDING_TRANSACTIONS,
      safeTransactions
    );
  }

  function saveTransaction(transaction) {
    const transactions = getPendingTransactions();

    const existingIndex = transactions.findIndex(
      item => item.id === transaction.id
    );

    if (existingIndex >= 0) {
      transactions[existingIndex] = transaction;
    } else {
      transactions.push(transaction);
    }

    savePendingTransactions(transactions);
    return transaction;
  }

  function updateTransaction(id, changes) {
    const transactions = getPendingTransactions();
    const index = transactions.findIndex(item => item.id === id);

    if (index < 0) {
      return null;
    }

    transactions[index] = {
      ...transactions[index],
      ...changes,
      updatedAt: Date.now()
    };

    savePendingTransactions(transactions);
    return transactions[index];
  }

  function getTransaction(id) {
    return (
      getPendingTransactions().find(item => item.id === id) ||
      null
    );
  }

  function spendCreditsOrRefund(cost = 1, metadata = {}) {
    const normalizedCost = Math.max(0, safeInt(cost, 1));
    const transactionId = createId('creation');

    if (normalizedCost === 0 || isPro()) {
      const freeTransaction = {
        id: transactionId,
        cost: 0,
        status: 'completed',
        refunded: false,
        pro: isPro(),
        metadata,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      saveTransaction(freeTransaction);
      emitTransaction('completed', freeTransaction);

      return {
        success: true,
        id: transactionId,
        credits: getCredits(),
        cost: 0,
        complete() {},
        refund() {}
      };
    }

    const currentCredits = getCredits();

    if (currentCredits < normalizedCost) {
      return {
        success: false,
        id: transactionId,
        reason: 'no_credits',
        credits: currentCredits,
        cost: normalizedCost,
        complete() {},
        refund() {}
      };
    }

    setCredits(currentCredits - normalizedCost);

    const transaction = {
      id: transactionId,
      cost: normalizedCost,
      status: 'pending',
      refunded: false,
      pro: false,
      metadata,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    saveTransaction(transaction);
    emitTransaction('charged', transaction);

    let finished = false;

    function complete(resultMetadata = {}) {
      if (finished) {
        return false;
      }

      const stored = getTransaction(transactionId);

      if (
        !stored ||
        stored.status === 'refunded' ||
        stored.status === 'completed'
      ) {
        finished = true;
        return false;
      }

      finished = true;

      const completed = updateTransaction(transactionId, {
        status: 'completed',
        completedAt: Date.now(),
        metadata: {
          ...stored.metadata,
          ...resultMetadata
        }
      });

      if (completed) {
        emitTransaction('completed', completed);
      }

      return true;
    }

    function refund(reason = 'creation_failed') {
      if (finished) {
        return false;
      }

      const stored = getTransaction(transactionId);

      if (
        !stored ||
        stored.refunded === true ||
        stored.status === 'refunded' ||
        stored.status === 'completed'
      ) {
        finished = true;
        return false;
      }

      finished = true;

      setCredits(getCredits() + normalizedCost);

      const refunded = updateTransaction(transactionId, {
        status: 'refunded',
        refunded: true,
        refundedAt: Date.now(),
        refundReason: String(reason || 'creation_failed').slice(
          0,
          160
        )
      });

      if (refunded) {
        emitTransaction('refunded', refunded);
      }

      return true;
    }

    return {
      success: true,
      id: transactionId,
      credits: getCredits(),
      cost: normalizedCost,
      complete,
      refund
    };
  }

  function getProcessedTokens() {
    const tokens = readJson(STORAGE.PROCESSED_TOKENS, []);
    return Array.isArray(tokens) ? tokens : [];
  }

  function hasProcessedToken(token) {
    if (!token) {
      return false;
    }

    return getProcessedTokens().includes(String(token));
  }

  function addProcessedToken(token) {
    const normalizedToken = String(token || '').trim();

    if (!normalizedToken) {
      return false;
    }

    const tokens = getProcessedTokens();

    if (tokens.includes(normalizedToken)) {
      return false;
    }

    tokens.push(normalizedToken);

    if (tokens.length > MAX_SAVED_TOKENS) {
      tokens.splice(0, tokens.length - MAX_SAVED_TOKENS);
    }

    return writeJson(STORAGE.PROCESSED_TOKENS, tokens);
  }

  async function consumePurchase(token, options = {}) {
    const normalizedToken = String(token || '').trim();

    if (!normalizedToken) {
      throw new Error('Missing Google Play purchase token');
    }

    if (hasProcessedToken(normalizedToken)) {
      return {
        success: false,
        reason: 'already_processed',
        credits: getCredits()
      };
    }

    /*
     * MVP MODE ONLY
     *
     * This local method must not be trusted for real paid purchases.
     * Before enabling real payments:
     *
     * 1. Send the purchase token to a secure backend.
     * 2. Verify it with Google Play Developer API.
     * 3. Verify package name, product ID and purchase state.
     * 4. Store the token on the server to prevent reuse.
     * 5. Add credits on the server.
     * 6. Return the verified server balance to the app.
     */

    const creditsToAdd = Math.max(
      0,
      safeInt(options.credits, 10)
    );

    if (creditsToAdd <= 0) {
      return {
        success: false,
        reason: 'invalid_credit_amount',
        credits: getCredits()
      };
    }

    if (!addProcessedToken(normalizedToken)) {
      return {
        success: false,
        reason: 'token_storage_failed',
        credits: getCredits()
      };
    }

    const updatedCredits = addCredits(creditsToAdd);

    return {
      success: true,
      added: creditsToAdd,
      credits: updatedCredits
    };
  }

  function grantQualityRetry(transactionId, reason = 'poor_result') {
    const id = String(transactionId || '').trim();
    if (!id) return { success: false, reason: 'missing_transaction', credits: getCredits() };
    const transaction = getTransaction(id);
    if (!transaction || transaction.status !== 'completed' || transaction.cost <= 0) {
      return { success: false, reason: 'ineligible_transaction', credits: getCredits() };
    }
    const refundedIds = readJson(STORAGE.QUALITY_REFUNDS, []);
    const list = Array.isArray(refundedIds) ? refundedIds : [];
    if (list.includes(id)) return { success: false, reason: 'already_granted', credits: getCredits() };
    list.push(id);
    writeJson(STORAGE.QUALITY_REFUNDS, list.slice(-100));
    const credits = addCredits(1);
    const updated = updateTransaction(id, {
      qualityRetryGranted: true,
      qualityRetryReason: String(reason).slice(0, 120),
      qualityRetryAt: Date.now()
    });
    if (updated) emitTransaction('quality_retry', updated);
    return { success: true, added: 1, credits };
  }
  function activateStarterPackForTesting() {
    return addCredits(12);
  }
  function cleanOldTransactions(maxAgeDays = 30) {
    const maxAgeMilliseconds =
      Math.max(1, safeInt(maxAgeDays, 30)) *
      24 *
      60 *
      60 *
      1000;

    const cutoff = Date.now() - maxAgeMilliseconds;

    const remaining = getPendingTransactions().filter(
      transaction =>
        transaction.status === 'pending' ||
        Number(transaction.updatedAt || transaction.createdAt) >=
          cutoff
    );

    savePendingTransactions(remaining);
    return remaining.length;
  }

  function resetLocalBillingForTesting() {
    try {
      Object.values(STORAGE).forEach(key => {
        localStorage.removeItem(key);
      });
    } catch (_) {}

    emitCredits(DEFAULT_CREDITS);
    return DEFAULT_CREDITS;
  }

  const PersonaBilling = Object.freeze({
    version: VERSION,
    safeInt,
    getCredits,
    setCredits,
    addCredits,
    isPro,
    setLocalPro,
    spendCreditsOrRefund,
    consumePurchase,
    hasProcessedToken,
    getProcessedTokens,
    getPendingTransactions,
    getTransaction,
    grantQualityRetry,
    activateStarterPackForTesting,
    cleanOldTransactions,

    get credits() {
      return getCredits();
    },

    set credits(value) {
      setCredits(value);
    },

    // Intended only for local development and testing.
    resetLocalBillingForTesting
  });

  window.PersonaBilling = PersonaBilling;
  window.isProUserBilling = isPro;

  migrateLegacyCredits();
  cleanOldTransactions();

  try {
    window.dispatchEvent(
      new CustomEvent('persona-billing-ready', {
        detail: {
          version: VERSION,
          credits: getCredits(),
          isPro: isPro()
        }
      })
    );
  } catch (_) {}
})();
