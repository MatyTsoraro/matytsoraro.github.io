document.addEventListener('DOMContentLoaded', () => {
  const isNative = window.Capacitor && window.Capacitor.isNativePlatform();
  if (!isNative) return;
  const { Filesystem, Share } = Capacitor.Plugins;
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    });
  };
  window.PersonaNativeShare = {
    async shareBlob(blob, id, ext) {
      if (!blob) throw new Error('Missing media blob');
      const safeId = String(id || 'item').replace(/[^a-zA-Z0-9_-]/g, '');
      const extension = ext || (blob.type && blob.type.includes('gif') ? 'gif' : 'mp4');
      const fileName = `PersonaAI-${safeId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${extension}`;
      const base64Data = await blobToBase64(blob);
      const result = await Filesystem.writeFile({ path: fileName, data: base64Data, directory: 'CACHE' });
      await Share.share({ url: result.uri, dialogTitle: 'שתפו' });
    },
    async saveBlob(blob, id, ext) {
      if (!blob) throw new Error('Missing media blob');
      const safeId = String(id || 'item').replace(/[^a-zA-Z0-9_-]/g, '');
      const extension = ext || (blob.type && blob.type.includes('gif') ? 'gif' : 'mp4');
      const fileName = `PersonaAI-${safeId}-${Date.now()}.${extension}`;
      const base64Data = await blobToBase64(blob);
      try {
        await Filesystem.writeFile({ path: fileName, data: base64Data, directory: 'DOCUMENTS' });
        alert('נשמר: ' + fileName);
      } catch (e) {
        await Filesystem.writeFile({ path: fileName, data: base64Data, directory: 'CACHE' });
        alert('נשמר בקאש: ' + fileName);
      }
    },
  };
});
