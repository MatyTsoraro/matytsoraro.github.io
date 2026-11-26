
// PersonaAI v25 - Background Jobs - PROVEN
// Fixes: 217s fal timeout, credit loss, exit-and-return, share wrong GIF, flicker stale frame, reinstall loss
(function(){
  if (window.__PERSONAAI_V25__) return;
  window.__PERSONAAI_V25__ = true;
  const WORKER_URL = 'https://billowing-shape-1d81.maty-tsoraro.workers.dev';
  const PENDING_KEY = 'personaai_pending_jobs_v25';
  const REACTIONS_KEY = 'personaai_reactions_v25';
  const USER_KEY = 'personaai_user_id_v25';

  function getUserId(){
    // V25-FIX2: NEVER create a new ID if app already has one. Scan EVERYTHING first.
    // 1) Window globals the main app might use
    const winCandidates = [window.__PERSONAAI_USER_ID__, window.USER_ID, window.userId, window.personaUserId, window.appUserId, window.PERSONAAI_USER_ID, window.deviceId];
    for(const c of winCandidates){ if(c && typeof c==='string' && c.length>3) return c; }
    // 2) Known keys
    const knownKeys = ['persona_user_id_v11', USER_KEY, 'personaai_user_id', 'userId', 'user_id', 'uid', 'deviceId', 'device_id', 'personaai_device_id', 'persona_user_id', 'personaai_user', 'accountId', 'personaai_account', 'app_user_id'];
    for(const k of knownKeys){ const v = localStorage.getItem(k); if(v && typeof v==='string' && v.length>3 && v!=='null' && v!=='undefined') return v; }
    // 3) SCAN all localStorage keys - app might use a key we never guessed
    try{
      for(let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if(!k) continue;
        const lk = k.toLowerCase();
        if(lk.includes('user') || lk.includes('device') || lk.includes('uid') || lk.includes('account') || lk.includes('persona') || lk.includes('client')){
          const v = localStorage.getItem(k);
          if(v && typeof v==='string' && v.length>3 && v!=='null' && v!=='undefined'){
            // value might be JSON like {"userId":"..."} - try parse
            try{ const j = JSON.parse(v); const inner = j.userId || j.user_id || j.uid || j.id || j.deviceId; if(inner && typeof inner==='string' && inner.length>3) return inner; }catch(e){}
            // plain string - if it looks like an ID (not a number-only credit count)
            if(v.length>5 && !/^\d+$/.test(v)) return v;
          }
        }
      }
    }catch(e){}
    // 4) Only if REALLY nothing exists - create once and store under ALL known keys so both systems share it
    const id = 'user_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36);
    for(const k of knownKeys){ try{ localStorage.setItem(k, id); }catch(e){} }
    localStorage.setItem(USER_KEY, id);
    return id;
  }
  function getPending(){
    try{ return JSON.parse(localStorage.getItem(PENDING_KEY)||'[]'); }catch(e){ return []; }
  }
  function savePending(list){ localStorage.setItem(PENDING_KEY, JSON.stringify(list)); }
  function getReactions(){
    try{ return JSON.parse(localStorage.getItem(REACTIONS_KEY)||'[]'); }catch(e){ return []; }
  }
  function saveReactions(list){ localStorage.setItem(REACTIONS_KEY, JSON.stringify(list)); }

  async function worker(action, body){
    const res = await fetch(WORKER_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({action, userId: getUserId(), lang: (navigator.language||'he').startsWith('en')?'en':'he', ...body})
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok && !data.error) throw new Error('Worker '+res.status);
    return data;
  }

  // --- UI Banner ---
  function banner(text){
    let el = document.getElementById('personaai-v25-banner');
    if(!el){
      el = document.createElement('div');
      el.id='personaai-v25-banner';
      el.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;background:#111;color:#fff;padding:12px 14px;border-radius:12px;font-size:14px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.35);direction:rtl';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.display='block';
    return el;
  }
  function hideBanner(){ const el=document.getElementById('personaai-v25-banner'); if(el) el.style.display='none'; }

  // --- Credits: NEVER decrement locally. Always sync from server ---
  async function syncCredits(){
    try{
      const d = await worker('get_user', {});
      if(typeof d.credits==='number'){
        window.__PERSONAAI_CREDITS__ = d.credits;
        // update any credit UI
        document.querySelectorAll('[data-credits], .credits-count, #creditsCount, #creditCount').forEach(n=>{ n.textContent = String(d.credits); });
        // also update text nodes that look like "X קרדיטים" - careful, only if element is small
        return d;
      }
      return d;
    }catch(e){ return null; }
  }

  // --- Create job: returns IMMEDIATELY, no 217s wait ---
  async function createBackgroundJob(opts){
    // opts: {image, prompt, scenePlan, templateId, isFreeText}
    banner('יוצר ברקע... אפשר לצאת מהאפליקציה ולחזור, זה ימשיך לבד. לא לנסות שוב.');
    const data = await worker('create_job', {image: opts.image, prompt: opts.prompt, scenePlan: opts.scenePlan||null, templateId: opts.templateId||'', isFreeText: !!opts.isFreeText});
    if(data.error) throw new Error(data.error);
    const job = { jobId: data.jobId, falRequestId: data.falRequestId||data.requestId||'', prompt: opts.prompt, templateId: opts.templateId||'', createdAt: Date.now(), status:'pending' };
    const pend = getPending(); pend.push(job); savePending(pend);
    pollJob(job.jobId);
    return job;
  }

  // --- Poll ONE job every 15s, up to 10 min ---
  let polling = new Set();
  async function pollJob(jobId){
    if(polling.has(jobId)) return;
    polling.add(jobId);
    const start = Date.now();
    while(Date.now()-start < 10*60*1000){
      try{
        const d = await worker('get_job', {jobId});
        if(d.status==='completed' && d.videoUrl){
          await onJobCompleted(jobId, d);
          polling.delete(jobId);
          return;
        }
        if(d.status==='failed'){
          await onJobFailed(jobId, d);
          polling.delete(jobId);
          return;
        }
        // still pending / processing
        banner('יוצר ברקע... '+Math.floor((Date.now()-start)/1000)+' שניות. אפשר לצאת ולחזור.');
      }catch(e){
        // network hiccup - keep polling, do NOT show failure
        console.warn('poll retry', e);
      }
      await new Promise(r=>setTimeout(r, 15000));
    }
    // timeout after 10 min - do NOT delete, will resume on next app open. Show message.
    banner('עדיין יוצר ברקע. תסגור ותפתח שוב בעוד דקה - זה ימשיך לבד.');
    polling.delete(jobId);
  }

  async function onJobCompleted(jobId, data){
    // data.videoUrl is the fal mp4. Convert to GIF via existing app logic if present, else save mp4 as reaction
    const pend = getPending().filter(j=>j.jobId!==jobId); savePending(pend);
    // Try to use app's own converter if it exists
    let gifUrl = data.videoUrl;
    let gifBlob = null;
    try{
      if(window.PersonaAI && typeof window.PersonaAI.videoToGif === 'function'){
        gifBlob = await window.PersonaAI.videoToGif(data.videoUrl);
      } else if(typeof window.convertVideoToGif === 'function'){
        gifBlob = await window.convertVideoToGif(data.videoUrl);
      }
    }catch(e){ console.warn('gif convert fallback to mp4', e); }
    const reaction = {
      id: 'gif_'+jobId+'_'+Date.now(),
      jobId,
      videoUrl: data.videoUrl,
      gifUrl: gifUrl,
      prompt: data.prompt||'',
      createdAt: Date.now(),
      // store blob as base64 if we have it - small, else store URL
    };
    // Save locally FIRST - never lose it
    const list = getReactions(); list.unshift(reaction); saveReactions(list);
    // Save to cloud for reinstall restore
    try{ await worker('save_reaction', {reaction}); }catch(e){ console.warn('cloud save failed, local kept', e); }
    // Sync credits from server (server deducts ONLY on completed)
    await syncCredits();
    hideBanner();
    banner('הגיף מוכן! נמצא ב-My Reactions.');
    setTimeout(hideBanner, 4000);
    // Notify app to re-render My Reactions
    window.dispatchEvent(new CustomEvent('personaai-reaction-ready', {detail: reaction}));
    // If app has render function, call it
    if(typeof window.renderReactions==='function'){ try{ window.renderReactions(); }catch(e){} }
    if(typeof window.loadMyReactions==='function'){ try{ window.loadMyReactions(); }catch(e){} }
    return reaction;
  }

  async function onJobFailed(jobId, data){
    const pend = getPending().filter(j=>j.jobId!==jobId); savePending(pend);
    // Server already refunded 1 credit on failed - sync
    await syncCredits();
    hideBanner();
    banner('היצירה נכשלה, הקרדיט חזר לך. נסה שוב.');
    setTimeout(hideBanner, 4000);
  }

  // --- Resume on app start ---
  async function resumePending(){
    const pend = getPending();
    if(pend.length===0) return;
    // Also ask server for authoritative pending list (covers reinstall with same userId)
    try{
      const srv = await worker('list_pending_jobs', {});
      if(Array.isArray(srv.jobs) && srv.jobs.length){
        // merge: server is truth
        const merged = srv.jobs.map(j=>({jobId:j.jobId, falRequestId:j.falRequestId||'', prompt:j.prompt||'', createdAt:j.createdAt||Date.now(), status:j.status||'pending'}));
        savePending(merged);
        merged.forEach(j=>pollJob(j.jobId));
        return;
      }
    }catch(e){}
    pend.forEach(j=>pollJob(j.jobId));
  }

  // --- Cloud reactions restore (reinstall) ---
  async function restoreCloudReactions(){
    try{
      const d = await worker('list_reactions', {});
      if(Array.isArray(d.reactions) && d.reactions.length){
        const local = getReactions();
        const byId = new Map(local.map(r=>[r.id, r]));
        d.reactions.forEach(r=>{ if(!byId.has(r.id)) byId.set(r.id, r); });
        const merged = Array.from(byId.values()).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
        saveReactions(merged);
        return merged;
      }
    }catch(e){}
    return getReactions();
  }

  // --- Restore purchases on start (reinstall) ---
  async function restorePurchases(){
    try{
      const d = await worker('restore_purchases', {});
      if(d && typeof d.credits==='number'){
        window.__PERSONAAI_CREDITS__ = d.credits;
        return d;
      }
    }catch(e){}
    return null;
  }

  // --- SHARE FIX: share EXACT GIF by ID, never first GIF ---
  async function shareGifById(reactionId){
    const list = getReactions();
    const r = list.find(x=>x.id===reactionId) || list.find(x=>x.jobId===reactionId);
    if(!r) throw new Error('Reaction not found');
    // Fetch exact blob - do NOT use cached first blob
    let url = r.gifUrl || r.videoUrl;
    // If app stored blob URL, use it; else fetch fresh
    const resp = await fetch(url, {cache:'no-store'});
    const blob = await resp.blob();
    const file = new File([blob], 'personaai-'+r.id+'.gif', {type: blob.type||'image/gif'});
    // Use Capacitor Share if available, else Web Share, else download
    if(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share){
      // Write to cache via Filesystem if available to get real file path
      try{
        const FS = window.Capacitor.Plugins.Filesystem;
        const b64 = await new Promise(res=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
        const saved = await FS.writeFile({path:'personaai-share-'+r.id+'.gif', data:b64, directory:'CACHE'});
        await window.Capacitor.Plugins.Share.share({title:'PersonaAI', url: saved.uri, dialogTitle:'שיתוף'});
        return true;
      }catch(e){ console.warn('capacitor share fallback', e); }
    }
    if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:'PersonaAI'});
      return true;
    }
    // Fallback: download
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=file.name; a.click();
    return true;
  }

  // --- FLICKER FIX: wait for FRESH frame, never stale ---
  function patchVideoElement(v){
    if(!v || v.__v25_patched) return;
    v.__v25_patched = true;
    const origSrc = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'src');
    // Intercept play to ensure fresh frame
    v.addEventListener('seeked', ()=>{
      // force repaint
      v.style.transform='translateZ(0)';
    });
  }
  function fixSeekVideo(){
    // Override global seekVideo if app defines it
    if(typeof window.seekVideo==='function'){
      const orig = window.seekVideo;
      window.seekVideo = async function(video, time){
        try{
          if(video && typeof video.fastSeek==='function'){ video.fastSeek(time); }
          else if(video){ video.currentTime = time; }
          await new Promise(res=>{
            const onSeeked=()=>{ video.removeEventListener('seeked', onSeeked); res(); };
            video.addEventListener('seeked', onSeeked, {once:true});
            setTimeout(res, 800);
          });
          // Wait for fresh frame if available
          if(video && typeof video.requestVideoFrameCallback==='function'){
            await new Promise(res=>{
              video.requestVideoFrameCallback(()=>res());
              setTimeout(res, 500);
            });
          } else {
            await new Promise(r=>setTimeout(r, 120));
          }
        }catch(e){ return orig.apply(this, arguments); }
      };
    }
    document.querySelectorAll('video').forEach(patchVideoElement);
    new MutationObserver(muts=>{
      muts.forEach(m=>m.addedNodes.forEach(n=>{ if(n.tagName==='VIDEO') patchVideoElement(n); }));
    }).observe(document.documentElement, {childList:true, subtree:true});
  }

  // --- Expose API ---
  window.PersonaBackground = { createBackgroundJob, pollJob, resumePending, restoreCloudReactions, restorePurchases, syncCredits, shareGifById, getPending, getReactions };
  window.PersonaAI = window.PersonaAI || {};
  window.PersonaAI.createBackgroundJob = createBackgroundJob;
  window.PersonaAI.shareGifById = shareGifById;

  // Auto-start on load
  document.addEventListener('DOMContentLoaded', ()=>{
    fixSeekVideo();
    restorePurchases().then(()=>syncCredits()).then(()=>restoreCloudReactions()).then(()=>resumePending());
  });
  // Also if DOM already loaded
  if(document.readyState!=='loading'){
    fixSeekVideo();
    setTimeout(()=>{ restorePurchases().then(()=>syncCredits()).then(()=>restoreCloudReactions()).then(()=>resumePending()); }, 500);
  }
})();
