(function () {
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
      reader.onload = () => {
        const res = String(reader.result || '');
        const idx = res.indexOf(',');
        resolve(idx >= 0 ? res.slice(idx + 1) : res);
      };
      reader.readAsDataURL(blob);
    });
  }

  function getPlugins() {
    const cap = window.Capacitor;
    const plugins = (cap && cap.Plugins) || window.CapacitorPlugins || {};
    return {
      Filesystem: plugins.Filesystem || null,
      Share: plugins.Share || null,
    };
  }

  window.PersonaNativeShare = {
    async shareBlob(blob, id, ext) {
      if (!blob) throw new Error('Missing media blob');
      const safeId = String(id || 'item').replace(/[^a-zA-Z0-9_-]/g, '');
      const extension = ext || (blob.type && blob.type.includes('gif') ? 'gif' : 'mp4');
      const mimeType = blob.type || (extension === 'gif' ? 'image/gif' : 'video/mp4');
      const fileName = `PersonaAI-${safeId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${extension}`;

      const { Filesystem, Share } = getPlugins();
      if (Filesystem && Share) {
        const base64Data = await blobToBase64(blob);
        const result = await Filesystem.writeFile({ path: fileName, data: base64Data, directory: 'CACHE' });
        await Share.share({ url: result.uri, dialogTitle: 'שתפו' });
        return;
      }

      const file = new File([blob], fileName, { type: mimeType });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: 'PersonaAI', text: 'יצרתי תגובת AI אישית ב-PersonaAI', files: [file] });
        return;
      }
      throw new Error('Share plugin unavailable');
    },

    async saveBlob(blob, id, ext) {
      if (!blob) throw new Error('Missing media blob');
      const safeId = String(id || 'item').replace(/[^a-zA-Z0-9_-]/g, '');
      const extension = ext || (blob.type && blob.type.includes('gif') ? 'gif' : 'mp4');
      const fileName = `PersonaAI-${safeId}-${Date.now()}.${extension}`;

      const { Filesystem } = getPlugins();
      if (Filesystem) {
        const base64Data = await blobToBase64(blob);
        try {
          await Filesystem.writeFile({ path: fileName, data: base64Data, directory: 'DOCUMENTS' });
          if (window.toast) window.toast('נשמר: ' + fileName); else alert('נשמר: ' + fileName);
          return;
        } catch (e) {
          await Filesystem.writeFile({ path: fileName, data: base64Data, directory: 'CACHE' });
          if (window.toast) window.toast('נשמר בקאש: ' + fileName); else alert('נשמר בקאש: ' + fileName);
          return;
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    },
  };
})();

// v25 - Share by ID fix - never share first GIF
if(window.PersonaBackground && window.PersonaBackground.shareGifById){ window.shareGifById = window.PersonaBackground.shareGifById; }
