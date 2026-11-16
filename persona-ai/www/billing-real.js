// billing-real.js - Real 【entity-Google Play¦canonical_name=Google Play】 purchase via @capgo/native-purchases
(function() {
  async function getPlugin() {
    const cap = window.Capacitor;
    if (!cap) throw new Error('Capacitor not available');
    const p = cap.Plugins && cap.Plugins.NativePurchases;
    if (!p) throw new Error('NativePurchases plugin not found');
    return p;
  }
  async function buyRealPack() {
    const NativePurchases = await getPlugin();
    const result = await NativePurchases.purchaseProduct({ productIdentifier: 'credits_20' });
    const tx = result.transaction || result;
    const token = tx.purchaseToken || tx.transactionId || tx.id || tx.purchase_token;
    if (window.PersonaBilling && window.PersonaBilling.addCredits) {
      window.PersonaBilling.addCredits(20, { source: 'google_play', productId: 'credits_20', purchaseToken: token });
    }
    if (token) {
      try { await NativePurchases.consumePurchase({ purchaseToken: token }); } catch(e) { console.warn('consume failed', e); }
    }
    return true;
  }
  window.buyRealPack = buyRealPack;
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('buyPackBtn');
    if (!btn) return;
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener('click', async () => {
      clone.disabled = true;
      const origText = clone.textContent;
      clone.textContent = 'טוען...';
      try {
        await buyRealPack();
        if (window.toast) window.toast('נרכש! +20 קרדיטים נוספו', false);
        else alert('נרכש! +20 קרדיטים נוספו');
      } catch(e) {
        if (window.toast) window.toast('הקנייה נכשלה: ' + (e.message || e), true);
        else alert('הקנייה נכשלה: ' + (e.message || e));
      } finally {
        clone.disabled = false;
        clone.textContent = origText;
      }
    });
  });
})();
