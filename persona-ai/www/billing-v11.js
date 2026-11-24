// PersonaAI v11 - Server credits + Pro + Bilingual + Async jobs
(function () {
  'use strict';
  const WORKER_URL = 'https://billowing-shape-1d81.maty-tsoraro.workers.dev';
  const LS_USER = 'persona_user_id_v11';
  const LS_LANG = 'persona_lang_v11';
  function getUserId() {
    try {
      let id = localStorage.getItem(LS_USER);
      if (!id) {
        id = 'user_' + (crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).slice(2, 10));
        localStorage.setItem(LS_USER, id);
      }
      return id;
    } catch (_) { return 'user_fallback_' + Date.now(); }
  }
  function getLang() {
    try {
      const saved = localStorage.getItem(LS_LANG);
      if (saved === 'he' || saved === 'en') return saved;
      const nav = (navigator.language || '').toLowerCase();
      return nav.startsWith('he') ? 'he' : 'en';
    } catch (_) { return 'he'; }
  }
  function setLang(lang) {
    try { localStorage.setItem(LS_LANG, lang === 'en' ? 'en' : 'he'); } catch (_) {}
    try { window.location.reload(); } catch (_) {}
  }
  async function serverCall(action, extra) {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action, userId: getUserId(), lang: getLang() }, extra || {})),
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch (_) { return { error: text, status: res.status }; }
  }
  function syncLocalCredits(serverCredits) {
    try {
      if (typeof serverCredits === 'number' && window.PersonaBilling && window.PersonaBilling.setCredits) {
        window.PersonaBilling.setCredits(serverCredits);
      }
      const el = document.getElementById('creditsCount');
      if (el && typeof serverCredits === 'number') el.textContent = String(serverCredits);
    } catch (_) {}
  }
  async function syncBalance() {
    try {
      const b = await serverCall('get_balance', {});
      if (b && typeof b.credits === 'number') {
        window.PersonaV11.balance = b.credits;
        window.PersonaV11.isPro = !!b.isPro; window.PersonaV11.isProPlus = !!b.isProPlus; try{ localStorage.setItem('persona_is_pro_plus', b.isProPlus ? '1' : '0'); }catch(_){}
        window.PersonaV11.freeClaimed = !!b.freeClaimed;
        syncLocalCredits(b.credits);
        return b;
      }
    } catch (_) {}
    return null;
  }
  async function ensureFree() {
    try {
      const b = await serverCall('get_balance', {});
      if (b && !b.freeClaimed) {
        const c = await serverCall('claim_free', {});
        if (c && typeof c.credits === 'number') { syncLocalCredits(c.credits); window.PersonaV11.balance = c.credits; return c; }
      } else if (b) { syncLocalCredits(b.credits); }
    } catch (_) {}
    return null;
  }
  function localize(reaction) {
    if (!reaction) return reaction;
    const lang = getLang();
    if (lang === 'en') {
      return { emoji: reaction.emoji, label: reaction.enLabel || reaction.label, sub: reaction.enSub || reaction.sub, prompt: reaction.enPrompt || reaction.prompt, id: reaction.id, isPro: !!reaction.isPro };
    }
    return reaction;
  }
  async function createServerJob(templateId, prompt, image) {
    try {
      const payload = { templateId: templateId || 'custom', prompt: prompt || '' };
      if (image) payload.image = image; // v28: optional, Worker v47 ignores it
      const r = await serverCall('create_job', payload);
      if (r && r.status === 'ok' && r.jobId) {
        window._v11JobId = r.jobId;
        window.PersonaV11.balance = r.credits;
        syncLocalCredits(r.credits);
        return { ok: true, jobId: r.jobId, credits: r.credits };
      }
      if (r && r.code === 'PRO_REQUIRED') return { ok: false, code: 'PRO_REQUIRED', message: r.error || 'Pro only' };
      if (r && r.code === 'PRO_PLUS_REQUIRED') return { ok: false, code: 'PRO_PLUS_REQUIRED', message: r.error || 'Pro+ only' };
      if (r && r.code === 'NO_CREDITS') return { ok: false, code: 'NO_CREDITS', message: r.error || 'No credits' };
      return { ok: false, code: r && r.code ? r.code : 'SERVER_ERROR', message: (r && r.error) || 'Server error' };
    } catch (e) { return { ok: false, code: 'OFFLINE', message: 'No connection' }; }
  }
  async function linkJob(jobId, falRequestId) { try { await serverCall('link_job', { jobId, falRequestId }); } catch (_) {} }
  async function failJob(jobId, err) {
    try {
      const r = await serverCall('fail_job', { jobId, error: String(err || '').slice(0, 500) });
      if (r && typeof r.credits === 'number') syncLocalCredits(r.credits);
    } catch (_) {}
  }
  async function verifyPurchase(productId, purchaseToken) {
    const r = await serverCall('verify_purchase', { productId, purchaseToken });
    if (r && typeof r.credits === 'number') { syncLocalCredits(r.credits); window.PersonaV11.isPro = !!r.isPro; window.PersonaV11.isProPlus = !!r.isProPlus; try{ localStorage.setItem('persona_is_pro_plus', r.isProPlus ? '1' : '0'); }catch(_){} }
    return r;
  }
  async function restorePurchases(purchases) {
    const r = await serverCall('restore_purchases', { purchases: purchases || [] });
    if (r && typeof r.credits === 'number') syncLocalCredits(r.credits);
    return r;
  }
  window.PersonaV11 = { getUserId, getLang, setLang, serverCall, syncBalance, ensureFree, createServerJob, linkJob, failJob, verifyPurchase, restorePurchases, localize, balance: null, isPro: false, isProPlus: false, freeClaimed: false, WORKER_URL };
  document.addEventListener('DOMContentLoaded', () => { setTimeout(() => { syncBalance().then(() => ensureFree()).catch(() => {}); }, 300); });
  document.addEventListener('DOMContentLoaded', () => {
    try {
      if (document.getElementById('v11-lang-toggle')) return;
      const btn = document.createElement('button');
      btn.id = 'v11-lang-toggle';
      btn.textContent = getLang() === 'he' ? 'EN | עב' : 'HE | EN';
      btn.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top, 0px) + 54px);left:12px;z-index:9999;padding:6px 10px;border-radius:20px;border:1px solid #ddd;background:#fff;font-size:13px;cursor:pointer;box-shadow:0 1px 6px rgba(0,0,0,0.12);';
      btn.onclick = () => setLang(getLang() === 'he' ? 'en' : 'he');
      document.body.appendChild(btn);
    } catch (_) {}
  });
})();
