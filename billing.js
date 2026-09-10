// PersonaAI Billing - credits_20 - $1.99 - 173 countries active
// Put this file next to index.html and manifest.json
const BILLING = {
  PRODUCT_ID: 'credits_20',
  CREDITS_PER_PURCHASE: 20,
  STORAGE_KEY: 'personaai_credits',
  FREE_CREDITS: 5
};

let digitalGoodsService = null;
let productPrice = '$1.99';

function getCredits() {
  const v = parseInt(localStorage.getItem(BILLING.STORAGE_KEY) || '');
  if (isNaN(v)) {
    localStorage.setItem(BILLING.STORAGE_KEY, String(BILLING.FREE_CREDITS));
    return BILLING.FREE_CREDITS;
  }
  return v;
}

function setCredits(n) {
  localStorage.setItem(BILLING.STORAGE_KEY, String(Math.max(0, n)));
  updateCreditsUI();
}

function addCredits(n) {
  setCredits(getCredits() + n);
}

function spendCredits(n = 1) {
  const cur = getCredits();
  if (cur < n) return false;
  setCredits(cur - n);
  return true;
}

function updateCreditsUI() {
  const el = document.getElementById('creditsBadge');
  if (el) el.textContent = `${getCredits()} credits`;
  const btns = document.querySelectorAll('[data-requires-credits]');
  const has = getCredits() > 0;
  btns.forEach(b => {
    if (!has) {
      b.style.opacity = '0.6';
    } else {
      b.style.opacity = '1';
    }
  });
}

// --- Digital Goods API (for TWA / PWA in Play) ---
async function initStore() {
  updateCreditsUI();
  if ('getDigitalGoodsService' in window) {
    try {
      // @ts-ignore
      digitalGoodsService = await window.getDigitalGoodsService('https://play.google.com/billing');
      const details = await digitalGoodsService.getDetails([BILLING.PRODUCT_ID]);
      console.log('Product details:', details);
      if (details && details[0]) {
        const d = details[0];
        // d.price is like {currency, value}
        productPrice = d.price ? `${d.price.value} ${d.price.currency}` : productPrice;
        const priceEl = document.getElementById('productPrice');
        if (priceEl) priceEl.textContent = productPrice;
      }
      // Check existing purchases
      const purchases = await digitalGoodsService.listPurchases();
      for (const p of purchases) {
        if (p.itemId === BILLING.PRODUCT_ID) {
          await handlePurchase(p);
        }
      }
    } catch (e) {
      console.warn('Digital Goods API not ready, using browser fallback', e);
    }
  } else {
    console.log('Digital Goods API not available - browser testing mode');
    const priceEl = document.getElementById('productPrice');
    if (priceEl) priceEl.textContent = productPrice + ' (test)';
  }
}

async function handlePurchase(purchase) {
  // For one-time consumable we consume after adding credits
  try {
    addCredits(BILLING.CREDITS_PER_PURCHASE);
    showToast(`+${BILLING.CREDITS_PER_PURCHASE} credits added!`);
    if (digitalGoodsService && purchase.purchaseToken) {
      // Acknowledge / consume - Digital Goods API: consume is implicit via acknowledge
      try {
        // New API uses consume
        if (digitalGoodsService.consume) {
          await digitalGoodsService.consume(purchase.purchaseToken);
        }
      } catch (err) {
        console.log('consume error (may be already consumed)', err);
      }
    }
  } catch (e) {
    console.error(e);
  }
}

async function buy20Credits() {
  // Browser fallback for testing outside Play
  if (!digitalGoodsService) {
    if (confirm(`TEST MODE\n\nBuy ${BILLING.CREDITS_PER_PURCHASE} credits for ${productPrice}?\n\nIn real Play Store this will open Google Pay.`)) {
      addCredits(BILLING.CREDITS_PER_PURCHASE);
      showToast(`Test: +${BILLING.CREDITS_PER_PURCHASE} credits`);
    }
    return;
  }
  try {
    const result = await digitalGoodsService.purchase({
      sku: BILLING.PRODUCT_ID,
      // itemId for older spec
      itemId: BILLING.PRODUCT_ID
    });
    console.log('purchase result', result);
    if (result && result.itemId === BILLING.PRODUCT_ID) {
      await handlePurchase(result);
    }
  } catch (e) {
    console.error('Purchase failed', e);
    if (e && e.message) showToast(e.message, true);
    else showToast('Purchase cancelled or failed', true);
  }
}

// Hook into your existing generation functions
function requireCreditsOrBuy(cost = 1) {
  if (getCredits() >= cost) return true;
  // No credits -> open store
  openStoreModal();
  showToast('Not enough credits - buy more', true);
  return false;
}

function openStoreModal() {
  const modal = document.getElementById('storeModal');
  if (modal) modal.hidden = false;
}
function closeStoreModal() {
  const modal = document.getElementById('storeModal');
  if (modal) modal.hidden = true;
}

// Expose global
window.PersonaBilling = {
  getCredits,
  addCredits,
  spendCredits,
  buy20Credits,
  requireCreditsOrBuy,
  initStore,
  openStoreModal,
  closeStoreModal
};

// Auto init
document.addEventListener('DOMContentLoaded', () => {
  initStore();
});
