// PersonaAI Billing - production version
// Google Play products:
// credits_20 = one-time consumable, 20 credits
// pro_weekly = weekly subscription, grants 100 credits per active billing week

(() => {
  'use strict';

  const BILLING = {
    PRODUCTS: {
      CREDITS_20: 'credits_20',
      PRO_WEEKLY: 'pro_weekly'
    },
    CREDITS_PER_PURCHASE: 20,
    PRO_WEEKLY_CREDITS: 100,
    FREE_CREDITS: 5,
    STORAGE_KEY: 'persona_credits',
    LEGACY_STORAGE_KEY: 'personaai_credits_v2',
    PRO_UNTIL_KEY: 'personaai_pro_until',
    PRO_LAST_GRANT_KEY: 'personaai_pro_last_grant',
    PRO_TOKEN_KEY: 'personaai_pro_token',
    PROCESSED_TOKENS_KEY: 'personaai_processed_tokens_v1'
  };

  let digitalGoodsService = null;
  let productDetails = {};
  let initialized = false;

  const byId = id => document.getElementById(id);

  function safeInt(value, fallback = 0) {
    const number = parseInt(value, 10);
    return Number.isFinite(number) ? number : fallback;
  }

  function migrateLegacyCredits() {
    const current = localStorage.getItem(BILLING.STORAGE_KEY);
    const legacy = localStorage.getItem(BILLING.LEGACY_STORAGE_KEY);
    if (current === null && legacy !== null) {
      localStorage.setItem(BILLING.STORAGE_KEY, String(Math.max(0, safeInt(legacy, BILLING.FREE_CREDITS))));
    }
  }

  function getCredits() {
    migrateLegacyCredits();
    const stored = localStorage.getItem(BILLING.STORAGE_KEY);
    if (stored === null) {
      localStorage.setItem(BILLING.STORAGE_KEY, String(BILLING.FREE_CREDITS));
      return BILLING.FREE_CREDITS;
    }
    return Math.max(0, safeInt(stored));
  }

  function notifyCreditsChanged() {
    const credits = getCredits();
    const button = byId('creditsBtn');
    if (button) button.textContent = `${credits} 💎`;
    const badge = byId('creditsBadge');
    if (badge) badge.textContent = `${credits} credits`;
    window.dispatchEvent(new CustomEvent('persona-credits-changed', { detail: { credits } }));
  }

  function setCredits(value) {
    localStorage.setItem(BILLING.STORAGE_KEY, String(Math.max(0, safeInt(value))));
    notifyCreditsChanged();
  }

  function addCredits(value) {
    setCredits(getCredits() + Math.max(0, safeInt(value)));
  }

  function spendCredits(value = 1) {
    const cost = Math.max(1, safeInt(value, 1));
    const current = getCredits();
    if (current < cost) return false;
    setCredits(current - cost);
    return true;
  }

  function spendCreditsOrRefund(value = 1) {
    const cost = Math.max(1, safeInt(value, 1));
    if (!spendCredits(cost)) return { success: false, refund: () => {} };
    let refunded = false;
    return {
      success: true,
      refund() {
        if (refunded) return;
        refunded = true;
        addCredits(cost);
      }
    };
  }

  function getProcessedTokens() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BILLING.PROCESSED_TOKENS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function tokenWasProcessed(token) {
    return Boolean(token) && getProcessedTokens().includes(token);
  }

  function markTokenProcessed(token) {
    if (!token) return;
    const tokens = getProcessedTokens();
    if (!tokens.includes(token)) tokens.push(token);
    localStorage.setItem(BILLING.PROCESSED_TOKENS_KEY, JSON.stringify(tokens.slice(-100)));
  }

  function detailFor(productId) {
    return productDetails[productId] || null;
  }

  function formattedPrice(productId, fallback) {
    const detail = detailFor(productId);
    if (!detail) return fallback;
    if (detail.price?.formatted) return detail.price.formatted;
    if (detail.price?.value && detail.price?.currency) return `${detail.price.value} ${detail.price.currency}`;
    return fallback;
  }

  function updatePriceUI() {
    const creditsPrice = formattedPrice(BILLING.PRODUCTS.CREDITS_20, '₪6.10');
    const proPrice = formattedPrice(BILLING.PRODUCTS.PRO_WEEKLY, '₪12.00');
    const creditsEl = byId('creditsProductPrice');
    const proEl = byId('proProductPrice');
    if (creditsEl) creditsEl.textContent = creditsPrice;
    if (proEl) proEl.textContent = `${proPrice} לשבוע`;
  }

  function toast(message, isError = false) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, isError);
      return;
    }
    alert(message);
  }

  function openStoreModal() {
    const modal = byId('storeModal');
    if (!modal) {
      toast('חלון הרכישה אינו זמין כרגע.', true);
      return;
    }
    updatePriceUI();
    modal.classList.add('open');
  }

  function closeStoreModal() {
    byId('storeModal')?.classList.remove('open');
  }

  function isBillingAvailable() {
    return Boolean(digitalGoodsService && window.PaymentRequest);
  }

  async function consumeCreditsPurchase(purchase) {
    if (!digitalGoodsService || !purchase.purchaseToken) return;
    if (typeof digitalGoodsService.consume === 'function') {
      await digitalGoodsService.consume(purchase.purchaseToken);
    }
  }

  function grantWeeklyCreditsIfDue(purchase, force = false) {
    const now = Date.now();
    const lastGrant = Date.parse(localStorage.getItem(BILLING.PRO_LAST_GRANT_KEY) || '') || 0;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const storedToken = localStorage.getItem(BILLING.PRO_TOKEN_KEY) || '';
    const tokenChanged = Boolean(purchase.purchaseToken && storedToken !== purchase.purchaseToken);

    if (force || tokenChanged || now - lastGrant >= sevenDays) {
      addCredits(BILLING.PRO_WEEKLY_CREDITS);
      localStorage.setItem(BILLING.PRO_LAST_GRANT_KEY, new Date(now).toISOString());
      localStorage.setItem(BILLING.PRO_UNTIL_KEY, new Date(now + sevenDays).toISOString());
      if (purchase.purchaseToken) localStorage.setItem(BILLING.PRO_TOKEN_KEY, purchase.purchaseToken);
      return true;
    }
    return false;
  }

  async function handlePurchase(purchase, showMessage = true, newPurchase = false) {
    if (!purchase?.itemId) throw new Error('Missing purchase item id');

    if (purchase.itemId === BILLING.PRODUCTS.CREDITS_20) {
      if (tokenWasProcessed(purchase.purchaseToken)) return;
      addCredits(BILLING.CREDITS_PER_PURCHASE);
      markTokenProcessed(purchase.purchaseToken);
      try {
        await consumeCreditsPurchase(purchase);
      } catch (error) {
        console.warn('The credits purchase was granted but could not be consumed yet.', error);
      }
      if (showMessage) toast(`נוספו ${BILLING.CREDITS_PER_PURCHASE} קרדיטים 🎉`);
      return;
    }

    if (purchase.itemId === BILLING.PRODUCTS.PRO_WEEKLY) {
      const granted = grantWeeklyCreditsIfDue(purchase, newPurchase);
      if (showMessage) {
        toast(granted ? `נוספו ${BILLING.PRO_WEEKLY_CREDITS} קרדיטים של PRO 🎉` : 'מינוי PRO כבר פעיל.');
      }
      // Do not consume subscriptions.
    }
  }

  async function buyProduct(productId) {
    if (!isBillingAvailable()) {
      toast('רכישות זמינות רק באפליקציה שהותקנה דרך Google Play.', true);
      return;
    }

    const fallback = productId === BILLING.PRODUCTS.PRO_WEEKLY
      ? { currency: 'USD', value: '3.99' }
      : { currency: 'USD', value: '1.99' };
    const detail = detailFor(productId);
    const amount = {
      currency: detail?.price?.currency || fallback.currency,
      value: String(detail?.price?.value || fallback.value)
    };

    const request = new PaymentRequest([
      {
        supportedMethods: 'https://play.google.com/billing',
        data: { sku: productId }
      }
    ], {
      total: { label: productId === BILLING.PRODUCTS.PRO_WEEKLY ? 'PersonaAI PRO Weekly' : 'PersonaAI Credits Pack 20', amount }
    });

    let response;
    try {
      response = await request.show();
      const purchaseToken = response.details?.purchaseToken;
      if (!purchaseToken) throw new Error('Google Play did not return a purchase token');
      await handlePurchase({ itemId: productId, purchaseToken }, true, true);
      await response.complete('success');
      closeStoreModal();
    } catch (error) {
      if (response) {
        try { await response.complete('fail'); } catch {}
      }
      const message = String(error?.message || '');
      if (!/closed|cancel/i.test(message)) toast('הרכישה לא הושלמה. נסה שוב.', true);
      console.error('Purchase failed', error);
    }
  }

  async function initStore() {
    if (initialized) return;
    initialized = true;
    notifyCreditsChanged();

    if (!('getDigitalGoodsService' in window)) {
      console.log('Google Play billing is unavailable in this browser context.');
      updatePriceUI();
      return;
    }

    try {
      digitalGoodsService = await window.getDigitalGoodsService('https://play.google.com/billing');
      const ids = Object.values(BILLING.PRODUCTS);
      const details = await digitalGoodsService.getDetails(ids);
      productDetails = {};
      for (const detail of details || []) productDetails[detail.itemId] = detail;
      updatePriceUI();

      const purchases = await digitalGoodsService.listPurchases();
      for (const purchase of purchases || []) {
        await handlePurchase(purchase, false, false);
      }
      notifyCreditsChanged();
    } catch (error) {
      console.warn('Google Play billing initialization failed.', error);
      updatePriceUI();
    }
  }

  window.PersonaBilling = {
    BILLING,
    getCredits,
    setCredits,
    addCredits,
    spendCredits,
    spendCreditsOrRefund,
    openStoreModal,
    closeStoreModal,
    buy20Credits: () => buyProduct(BILLING.PRODUCTS.CREDITS_20),
    buyProWeekly: () => buyProduct(BILLING.PRODUCTS.PRO_WEEKLY),
    buyProduct,
    initStore,
    isBillingAvailable
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStore, { once: true });
  } else {
    initStore();
  }
})();
