// PersonaAI Billing v2.1 - synced with v12.12
// Google Play Billing + localStorage credits + PRO
(function(){
  const LS_CREDITS = 'persona_credits';
  const LS_CREDITS_V2 = 'personaai_credits_v2';
  const LS_PRO = 'persona_pro';
  const LS_PRO_OLD = 'pro';
  const LS_TOKENS = 'persona_processed_tokens';

  function safeInt(v, d){
    try{ const n=parseInt(v,10); return isNaN(n)?d:n; }catch{ return d; }
  }

  function getCredits(){
    // migration
    try{
      const v2 = localStorage.getItem(LS_CREDITS_V2);
      if(v2!==null && localStorage.getItem(LS_CREDITS)===null){
        localStorage.setItem(LS_CREDITS, v2);
      }
    }catch{}
    return safeInt(localStorage.getItem(LS_CREDITS), 3);
  }

  function setCredits(n){
    const v = Math.max(0, safeInt(n,0));
    localStorage.setItem(LS_CREDITS, String(v));
    localStorage.setItem(LS_CREDITS_V2, String(v));
    try{ window.dispatchEvent(new CustomEvent('persona-credits-changed', {detail:{credits:v}})); }catch{}
    return v;
  }

  function isPro(){
    try{
      if(localStorage.getItem(LS_PRO)==='1') return true;
      if(localStorage.getItem(LS_PRO_OLD)==='1') return true;
      // Google Play token check - if you store verified pro from Play
      if(window._persona_google_pro_verified) return true;
    }catch{}
    return false;
  }

  function getProcessedTokens(){
    try{ return JSON.parse(localStorage.getItem(LS_TOKENS)||'[]'); }catch{ return []; }
  }
  function addProcessedToken(t){
    try{
      const arr=getProcessedTokens();
      if(arr.includes(t)) return false;
      arr.push(t);
      // keep last 100
      if(arr.length>100) arr.splice(0, arr.length-100);
      localStorage.setItem(LS_TOKENS, JSON.stringify(arr));
      return true;
    }catch{ return false; }
  }

  // The critical function Grok asked for - with refund
  function spendCreditsOrRefund(cost){
    cost = safeInt(cost,1);
    if(cost<=0) return { success:true, refund:function(){} };
    if(isPro()) return { success:true, refund:function(){} }; // PRO = free
    const cur = getCredits();
    if(cur < cost){
      return { success:false, reason:'no_credits', credits:cur, refund:function(){} };
    }
    setCredits(cur - cost);
    let refunded=false;
    return {
      success:true,
      credits: getCredits(),
      refund: function(){
        if(refunded) return;
        refunded=true;
        setCredits(getCredits() + cost);
      }
    };
  }

  function addCredits(n){
    return setCredits(getCredits() + safeInt(n,0));
  }

  // Google Play Billing placeholder - will be overridden by real billing flow
  async function consumePurchase(token){
    if(!token) return false;
    if(!addProcessedToken(token)) return false; // already processed
    // here you would verify with your worker / Google
    // for now grant credits
    addCredits(10);
    return true;
  }

  const PersonaBilling = {
    version: '2.1-grok-synced',
    safeInt,
    getCredits,
    setCredits,
    isPro, // <-- now a FUNCTION, not boolean
    spendCreditsOrRefund, // <-- NEW for Grok fix
    addCredits,
    consumePurchase,
    getProcessedTokens,
    // backwards compat
    get credits(){ return getCredits(); },
    set credits(v){ setCredits(v); }
  };

  window.PersonaBilling = PersonaBilling;
  // legacy globals
  window.isProUserBilling = isPro;
  try{
    window.dispatchEvent(new CustomEvent('persona-billing-ready'));
  }catch{}
})();
