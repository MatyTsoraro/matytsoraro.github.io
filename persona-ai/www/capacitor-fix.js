document.addEventListener('DOMContentLoaded', () => {
  const isNative = window.Capacitor && window.Capacitor.isNativePlatform();
  if (!isNative) return;
  console.log('Fix v4 - native');
  const { Filesystem, Share } = Capacitor.Plugins;

  window._personaMedia = null;
  window._capturedBlobs = [];
  const origCreateURL = URL.createObjectURL;
  URL.createObjectURL = function(blob) {
    const url = origCreateURL.call(this, blob);
    window._personaMedia = { blob, url, type: blob.type };
    window._lastBlob = blob;
    window._capturedBlobs.push({ blob, url });
    if (window._capturedBlobs.length > 5) window._capturedBlobs.shift();
    console.log('CAPTURED', blob.type, blob.size);
    return url;
  };

  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    });
  };

  const handleMedia = async (blob, ext, action) => {
    const fileName = `PersonaAI-${Date.now()}.${ext}`;
    const base64Data = await blobToBase64(blob);
    if (action === 'share') {
      const result = await Filesystem.writeFile({ path: fileName, data: base64Data, directory: 'CACHE' });
      await Share.share({ url: result.uri, dialogTitle: 'שתפו' });
    } else {
      try {
        await Filesystem.writeFile({ path: fileName, data: base64Data, directory: 'DOCUMENTS' });
        alert('נשמר: ' + fileName);
      } catch (e) {
        await Filesystem.writeFile({ path: fileName, data: base64Data, directory: 'CACHE' });
        alert('נשמר בקאש: ' + fileName);
      }
    }
  };

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const text = btn.textContent || "";
    const isShare = text.includes('שתפו') || text.includes('שיתוף');
    const isSave = text.includes('שמרו') || text.includes('שמירה') || text.includes('הורד');
    if (!isShare && !isSave) return;
    
    let blob = window._lastBlob || window._personaMedia?.blob;
    if (!blob && window.lastVideo && window.lastVideo.blob) blob = window.lastVideo.blob;
    if (!blob && window.lastGif && window.lastGif.blob) blob = window.lastGif.blob;
    
    if (!blob) {
      const videos = document.querySelectorAll('video');
      for (let v of videos) {
        if (v.src) {
          try { const r = await fetch(v.src); blob = await r.blob(); break; } catch (err) {}
        }
      }
    }
    
    if (!blob) {
      console.log('No blob - videos:', document.querySelectorAll('video').length);
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    btn.style.opacity = '0.5';
    try {
      const ext = blob.type.includes('gif') ? 'gif' : 'mp4';
      const action = isShare ? 'share' : 'save';
      await handleMedia(blob, ext, action);
    } catch (err) {
      alert(err.message);
    }
    btn.style.opacity = '1';
  }, true);
});
