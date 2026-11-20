import { useEffect, useState, type RefObject } from 'react';

const LOOP_EXTENSION = new Uint8Array([
  0x21, 0xff, 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
  0x03, 0x01, 0x00, 0x00, 0x00,
]);

function loopGif(buffer: ArrayBuffer, contentType: string): Blob {
  const bytes = new Uint8Array(buffer);
  const original = () => new Blob([buffer], { type: contentType });
  const version = new TextDecoder().decode(bytes.subarray(0, 6));
  if (bytes.length < 14 || (version !== 'GIF87a' && version !== 'GIF89a')) return original();

  const colorTableSize = (flags: number) => flags & 0x80 ? 3 << ((flags & 7) + 1) : 0;
  const start = 13 + colorTableSize(bytes[10]);
  let offset = start;
  let frames = 0;
  const loopCounts: number[] = [];

  while (offset < bytes.length) {
    const block = bytes[offset++];
    if (block === 0x3b) {
      if (frames < 2) return original();
      if (loopCounts.length > 0) {
        for (const count of loopCounts) {
          bytes[count] = 0;
          bytes[count + 1] = 0;
        }
        return new Blob([buffer], { type: 'image/gif' });
      }
      // 循环扩展属于 GIF 89a，插在全局颜色表之后。
      bytes[4] = 0x39;
      return new Blob([bytes.subarray(0, start), LOOP_EXTENSION, bytes.subarray(start)], { type: 'image/gif' });
    }
    if (block === 0x2c && offset + 9 < bytes.length) {
      frames++;
      offset += 10 + colorTableSize(bytes[offset + 8]);
    } else if (block === 0x21 && offset < bytes.length) {
      const label = bytes[offset++];
      if (label === 0xff && bytes[offset] === 11 && bytes[offset + 12] === 3 && bytes[offset + 13] === 1) {
        const application = new TextDecoder().decode(bytes.subarray(offset + 1, offset + 12));
        if (application === 'NETSCAPE2.0' || application === 'ANIMEXTS1.0') loopCounts.push(offset + 14);
      }
    } else {
      break;
    }
    while (offset < bytes.length && bytes[offset] !== 0) offset += bytes[offset] + 1;
    offset++;
  }
  return original();
}

function gifRequestUrl(src: string): string | undefined {
  if (!URL.canParse(src, window.location.origin)) return;
  const url = new URL(src, window.location.origin);
  const proxiedUrl = url.origin === window.location.origin && url.pathname === '/chat/image'
    ? url.searchParams.get('url') : null;
  const imageUrl = proxiedUrl && URL.canParse(proxiedUrl) ? new URL(proxiedUrl) : url;
  if (!['http:', 'https:'].includes(imageUrl.protocol) || !/\.gif$/i.test(imageUrl.pathname)) return;
  return proxiedUrl || url.origin === window.location.origin
    ? src
    : `/chat/image?${new URLSearchParams({ url: src })}`;
}

export function useLoopingGif(
  src: string, enabled: boolean, lazyTarget?: RefObject<HTMLElement | null>,
): string | undefined {
  const requestUrl = enabled ? gifRequestUrl(src) : undefined;
  const [resolved, setResolved] = useState<{ url: string; src: string }>();

  useEffect(() => {
    if (!requestUrl) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    async function load(url: string) {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const buffer = await response.arrayBuffer();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(loopGif(buffer, response.headers.get('Content-Type') ?? 'image/gif'));
        setResolved({ url, src: objectUrl });
      } catch {
        if (!controller.signal.aborted) setResolved({ url, src });
      }
    }

    const target = lazyTarget?.current;
    const observer = target && new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer?.disconnect();
      void load(requestUrl);
    }, { rootMargin: '200px' });
    if (target) observer?.observe(target);
    else void load(requestUrl);

    return () => {
      observer?.disconnect();
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [lazyTarget, requestUrl, src]);

  if (!requestUrl) return src;
  return resolved?.url === requestUrl ? resolved.src : undefined;
}
