// PersonaAI Billing FIXED - Money Making Version
// Supports: credits_20 ($1.99) + pro_weekly ($3.99) + server verification ready
const BILLING = {
  PRODUCTS: {
    CREDITS_20: 'credits_20',
    PRO_WEEKLY: 'pro_weekly' // Add this in Play Console as subscription
  },
  CREDITS_PER_PURCHASE: 20,
  STORAGE_KEY: 'personaai_credits_v2',
  STORAGE_KEY_PRO: 'personaai_pro_until',
  FREE_CREDITS: 5,
  // For future server verification
  VERIFY_URL: null // Set to your Cloudflare Worker URL later: "https://your-worker.workers.dev/verify"
};

let digitalGoodsService = null;
let productDetails = {};
let isProUser = false;

function getCredits() {
  // Check pro status first
  if (isProActive()) return 999;
  const v = parseInt(localStorage.getItem(BILLING.STORAGE_KEY) || '');
  if (isNaN(v)) {
    localStorage.setItem(BILLING.STORAGE_KEY, String(BILLING.FREE_CREDITS));
    return BILLING.FREE_CREDITS;
  }
  return v;
}

function isProActive() {
  const until = localStorage.getItem(BILLING.STORAGE_KEY_PRO);
  if (!until) return false;
  return new Date(until) > new Date();
}

function setCredits(n) {
  if (isProActive()) return; // Pro has unlimited
  localStorage.setItem(BILLING.STORAGE_KEY, String(Math.max(0, n)));
  updateCreditsUI();
}

function addCredits(n) {
  if (isProActive()) return;
  setCredits(getCredits() + n);
}

function spendCredits(n = 1) {
  if (isProActive()) return true; // Pro = free
  const cur = getCredits();
  if (cur < n) return false;
  setCredits(cur - n);
  return true;
}

// NEW: Spend BEFORE API call, refund on failure
function spendCreditsOrRefund(cost = 1) {
  if (isProActive()) return { success: true, refund: () => {} };
  const cur = getCredits();
  if (cur < cost) return { success: false };
  
  setCredits(cur - cost);
  let refunded = false;
  return {
    success: true,
    refund: () => {
      if (!refunded) {
        refunded = true;
        addCredits(cost);
        console.log('Credits refunded due to failure');
      }
    }
  };
}

function updateCreditsUI() {
  const el = document.getElementById('creditsBadge');
  const pro = isProActive();
  if (el) {
    if (pro) {
      el.textContent = `PRO ♾️`;
      el.style.background = 'linear-gradient(90deg,#00e5ff,#7c4dff)';
      el.style.color = '#fff';
    } else {
      el.textContent = `${getCredits()} credits`;
      el.style.background = '#1e1e38';
      el.style.color = '#fff';
    }
  }
  
  // Update all price displays
  if (productDetails[BILLING.PRODUCTS.CREDITS_20]) {
    const p = productDetails[BILLING.PRODUCTS.CREDITS_20];
    const priceText = p.price ? `${p.price.value} ${p.price.currency}` : '$1.99';
    document.querySelectorAll('#productPrice, #productPrice2').forEach(e => {
      if (e) e.textContent = priceText;
    });
  }
  
  if (productDetails[BILLING.PRODUCTS.PRO_WEEKLY]) {
    const p = productDetails[BILLING.PRODUCTS.PRO_WEEKLY];
    const priceText = p.price ? `${p.price.value} ${p.price.currency} / week` : '$3.99 / week';
    const el2 = document.getElementById('proPrice');
    if (el2) el2.textContent = priceText;
  }
}

// --- Digital Goods API ---
async function initStore() {
  updateCreditsUI();
  
  // Check pro expiry
  if (localStorage.getItem(BILLING.STORAGE_KEY_PRO)) {
    const until = new Date(localStorage.getItem(BILLING.STORAGE_KEY_PRO));
    if (until < new Date()) {
      localStorage.removeItem(BILLING.STORAGE_KEY_PRO);
      isProUser = false;
    } else {
      isProUser = true;
    }
  }

  if ('getDigitalGoodsService' in window) {
    try {
      digitalGoodsService = await window.getDigitalGoodsService('https://play.google.com/billing');
      
      // Get details for ALL products
      const productIds = Object.values(BILLING.PRODUCTS);
      const details = await digitalGoodsService.getDetails(productIds);
      console.log('Product details:', details);
      
      details.forEach(d => {
        productDetails[d.itemId] = d;
      });
      
      updateCreditsUI();
      
      // Check existing purchases - IMPORTANT for restore
      const purchases = await digitalGoodsService.listPurchases();
      for (const p of purchases) {
        await handlePurchase(p, false); // false = don't show toast on restore
      }
      
      if (purchases.length > 0) {
        console.log(`Restored ${purchases.length} purchases`);
      }
    } catch (e) {
      console.warn('Digital Goods API not ready', e);
    }
  } else {
    console.log('Browser testing mode - no Digital Goods API');
    document.querySelectorAll('#productPrice, #productPrice2').forEach(e => {
      if (e) e.textContent = '$1.99 (test)';
    });
  }
}

async function handlePurchase(purchase, showToastFlag = true) {
  try {
    // Future: Send to server for verification
    if (BILLING.VERIFY_URL) {
      try {
        const resp = await fetch(BILLING.VERIFY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: purchase.itemId,
            purchaseToken: purchase.purchaseToken
          })
        });
        const result = await resp.json();
        if (!result.success) {
          console.error('Server verification failed');
          return;
        }
      } catch (err) {
        console.warn('Server verification failed, using local fallback', err);
      }
    }

    // Handle different products
    if (purchase.itemId === BILLING.PRODUCTS.CREDITS_20) {
      addCredits(BILLING.CREDITS_PER_PURCHASE);
      if (showToastFlag) showToast(`+${BILLING.CREDITS_PER_PURCHASE} credits added! 🎉`);
    } else if (purchase.itemId === BILLING.PRODUCTS.PRO_WEEKLY) {
      // Pro weekly = 30 days of pro for now, will be handled by subscription logic
      const until = new Date();
      until.setDate(until.getDate() + 7); // 7 days
      localStorage.setItem(BILLING.STORAGE_KEY_PRO, until.toISOString());
      isProUser = true;
      if (showToastFlag) showToast(`PRO activated! ♾️ Unlimited for 7 days!`);
    }
    
    updateCreditsUI();

    // Consume/acknowledge
    if (digitalGoodsService && purchase.purchaseToken) {
      try {
        if (digitalGoodsService.consume) {
          await digitalGoodsService.consume(purchase.purchaseToken);
        }
      } catch (err) {
        console.log('Consume may have already happened', err);
      }
    }
  } catch (e) {
    console.error('handlePurchase error', e);
  }
}

// Modern purchase flow using Payment Request API (recommended by Google)
async function buyProduct(productId) {
  // Browser fallback
  if (!digitalGoodsService || !window.PaymentRequest) {
    if (confirm(`TEST MODE\n\nBuy ${productId}?\n\nIn Play Store this opens Google Pay.`)) {
      if (productId === BILLING.PRODUCTS.CREDITS_20) {
        addCredits(BILLING.CREDITS_PER_PURCHASE);
        showToast(`Test: +${BILLING.CREDITS_PER_PURCHASE} credits`);
      } else if (productId === BILLING.PRODUCTS.PRO_WEEKLY) {
        const until = new Date();
        until.setDate(until.getDate() + 7);
        localStorage.setItem(BILLING.STORAGE_KEY_PRO, until.toISOString());
        isProUser = true;
        updateCreditsUI();
        showToast(`Test: PRO activated!`);
      }
    }
    return;
  }

  try {
    const methodData = [{
      supportedMethods: 'https://play.google.com/billing',
      data: { sku: productId }
    }];
    
    const details = {
      total: { label: 'Total', amount: { currency: 'USD', value: '1.99' } }
    };
    
    const request = new PaymentRequest(methodData, details);
    const response = await request.show();
    
    const { purchaseToken } = response.details;
    
    // Handle purchase
    await handlePurchase({ itemId: productId, purchaseToken }, true);
    
    await response.complete('success');
    
  } catch (e) {
    console.error('Purchase failed', e);
    if (e && e.message && !e.message.includes('closed')) {
      showToast(e.message, true);
    } else if (!e.message.includes('closed')) {
      showToast('Purchase cancelled', true);
    }
  }
}

async function buy20Credits() {
  return buyProduct(BILLING.PRODUCTS.CREDITS_20);
}

async function buyProWeekly() {
  return buyProduct(BILLING.PRODUCTS.PRO_WEEKLY);
}

function requireCreditsOrBuy(cost = 1) {
  if (isProActive()) return true;
  if (getCredits() >= cost) return true;
  openStoreModal();
  showToast('Not enough credits - get more! 💎', true);
  return false;
}

function openStoreModal() {
  const modal = document.getElementById('storeModal');
  if (modal) {
    modal.hidden = false;
    modal.style.display = 'flex';
  }
  // Track event for future analytics
  console.log('store_opened');
}

function closeStoreModal() {
  const modal = document.getElementById('storeModal');
  if (modal) {
    modal.hidden = true;
    modal.style.display = 'none';
  }
}

// Expose global
window.PersonaBilling = {
  getCredits,
  addCredits,
  spendCredits,
  spendCreditsOrRefund,
  buy20Credits,
  buyProWeekly,
  buyProduct,
  requireCreditsOrBuy,
  initStore,
  openStoreModal,
  closeStoreModal,
  isProActive,
  BILLING
};

// Auto init
document.addEventListener('DOMContentLoaded', () => {
  initStore();
});
