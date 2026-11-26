import { useEffect, useState } from 'react';

export default function DownloadNotice() {
  const [path, setPath] = useState('');

  useEffect(() => {
    let timer: number | undefined;
    function showNotice(event: Event) {
      const path = (event as CustomEvent<unknown>).detail;
      if (typeof path !== 'string' || !path) return;
      setPath(path);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setPath(''), 8000);
    }
    window.addEventListener('desktop-download-complete', showNotice);
    return () => {
      window.removeEventListener('desktop-download-complete', showNotice);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div aria-live="polite" aria-atomic="true">
      {path && (
        <div className="download-notice">
          <strong>下载完成</strong>
          <span>已保存到：{path}</span>
        </div>
      )}
    </div>
  );
}
