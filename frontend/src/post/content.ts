import DOMPurify from 'dompurify';
import { URL_TEXT_RE, stripUrlTrailing } from '../../../src/main/resources/static/shared/linkify.js';

export function sanitizedContent(content: string) {
  const doc = new DOMParser().parseFromString(DOMPurify.sanitize(content, { USE_PROFILES: { html: true } }), 'text/html');
  replaceText(doc.body, URL_TEXT_RE, match => stripUrlTrailing(match[0]), text => text);
  replaceText(doc.body, /@[A-Za-z0-9_\-\u4e00-\u9fff]+(?=:)/g, match => match[0], text => `https://weibo.com/n/${text.slice(1)}`);
  for (const anchor of doc.querySelectorAll('a')) {
    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('//')) anchor.setAttribute('href', `https:${href}`);
    else if (href.startsWith('/')) anchor.setAttribute('href', `https://weibo.com${href}`);
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener');
  }
  // Re-sanitize the transformed tree before crossing React's raw-HTML boundary.
  // https://github.com/cure53/DOMPurify#is-there-any-foot-gun-potential
  return DOMPurify.sanitize(doc.body.innerHTML, { USE_PROFILES: { html: true }, ADD_ATTR: ['target'] });
}

function replaceText(root: HTMLElement, pattern: RegExp, textFor: (match: RegExpExecArray) => string, hrefFor: (text: string) => string) {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    if (!walker.currentNode.parentElement?.closest('a')) nodes.push(walker.currentNode as Text);
  }
  for (const node of nodes) {
    const text = node.data;
    const fragment = doc.createDocumentFragment();
    let end = 0;
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const label = textFor(match);
      if (!label) continue;
      fragment.append(doc.createTextNode(text.slice(end, match.index)));
      const anchor = doc.createElement('a');
      anchor.textContent = label;
      anchor.setAttribute('href', hrefFor(label));
      fragment.append(anchor);
      end = match.index + label.length;
    }
    if (end === 0) continue;
    fragment.append(doc.createTextNode(text.slice(end)));
    node.replaceWith(fragment);
  }
}
