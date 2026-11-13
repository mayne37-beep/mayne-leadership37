import { ZipReader, parse, renderSlideToSvg } from '@web-ppt/core';
import DOMPurify from 'dompurify';
import { readSlideMetadata } from './powerpoint-metadata.js';

const zipLimits = { maxEntries: 5000, maxTotalBytes: 200 * 1024 * 1024, maxEntryBytes: 100 * 1024 * 1024 };
const localAsset = /^(?:blob:|data:image\/)/i;

function privateSlideMetadata(archive, signal) {
  const decoder = new TextDecoder();
  function readText(part, maxBytes) {
    const entry = archive.unzip(item => item.name === part && item.originalSize <= maxBytes)[part];
    return entry ? decoder.decode(entry) : '';
  }
  const types = readText('[Content_Types].xml', 1024 * 1024);
  if (!/presentationml\.(?:presentation|slideshow)\.main\+xml/.test(types) || /macroEnabled/i.test(types)) {
    throw new Error('Choose a standard, unprotected .pptx or .ppsx PowerPoint.');
  }
  return readSlideMetadata(readText, new DOMParser(), signal);
}

function internalPage(value, indices) {
  if (!/^\d+$/.test(value ?? '')) return -1;
  return indices.indexOf(Number(value) - 1);
}

function linkTarget(anchor, indices) {
  const page = internalPage(anchor.getAttribute('data-slide'), indices);
  if (page >= 0) return { page };
  const href = anchor.getAttribute('href');
  if (!href || href.length > 2048) return null;
  try {
    const url = new URL(href);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return { href: url.href };
  } catch {}
  return null;
}

function readSlideLinks(svg, width, height, indices) {
  const links = [];
  const matrix = svg.getScreenCTM()?.inverse();
  if (!matrix) return links;
  for (const anchor of Array.from(svg.querySelectorAll('a')).slice(0, 100)) {
    const target = linkTarget(anchor, indices);
    if (!target) continue;
    const bounds = anchor.getBoundingClientRect();
    const a = new DOMPoint(bounds.left, bounds.top).matrixTransform(matrix);
    const b = new DOMPoint(bounds.right, bounds.bottom).matrixTransform(matrix);
    const x = Math.max(0, a.x) / width;
    const y = Math.max(0, a.y) / height;
    const w = Math.min(width, b.x) / width - x;
    const h = Math.min(height, b.y) / height - y;
    if (w > 0 && h > 0) links.push({ ...target, x, y, width: w, height: h });
  }
  return links;
}

function measureSlideLinks(svg, width, height, indices) {
  if (!svg.querySelector('a')) return [];
  const fragment = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: false }, RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: ['style', 'use', 'animate', 'set'], FORBID_ATTR: ['style', 'id', 'tabindex', 'src'],
  });
  const geometry = fragment.querySelector('svg');
  if (!geometry) return [];
  for (const node of geometry.querySelectorAll('image')) {
    node.removeAttribute('href');
    node.removeAttribute('xlink:href');
  }
  const layout = document.createElement('div');
  layout.className = 'powerpoint-link-layout';
  layout.setAttribute('aria-hidden', 'true');
  layout.inert = true;
  layout.append(geometry);
  document.body.append(layout);
  try { return readSlideLinks(geometry, width, height, indices); }
  finally { layout.remove(); }
}

function fileData(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function makeImage(svg, signal) {
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    signal.throwIfAborted();
    return image;
  } finally { URL.revokeObjectURL(url); }
}

function safeSlideSvg(presentation, slide) {
  const markup = renderSlideToSvg(presentation, slide, {
    textMode: 'svg', includeNotes: false, showComments: false,
  });
  const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  if (svg.localName !== 'svg' || svg.querySelector('parsererror, script, foreignObject, iframe, object, embed')) {
    throw new Error('This slide contains content the browser player could not display.');
  }
  let linkedImages = false;
  for (const image of svg.querySelectorAll('image')) {
    const href = image.getAttribute('href') ?? image.getAttribute('xlink:href') ?? '';
    if (!localAsset.test(href)) {
      if (href) linkedImages = true;
      image.remove();
    }
  }
  return { svg, linkedImages };
}

function compatibilityFor(slide, linkedImages) {
  const hints = new Set();
  if (slide.animations?.length || slide.transition) hints.add('animations and transitions');
  if (linkedImages) hints.add('linked images');
  function inspect(elements) {
    for (const element of elements) {
      if (element.media) hints.add('audio or video');
      if (element.kind === 'unsupported' && !element.preview) hints.add('some slide objects');
      if (element.children) inspect(element.children);
    }
  }
  inspect(slide.elements);
  return [...hints];
}

export async function openDirectPowerPoint(file, signal) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  let presentation;
  try {
    const archive = new ZipReader(bytes, zipLimits);
    const metadata = await privateSlideMetadata(archive, signal);
    if (!metadata) throw new Error('This PowerPoint’s slides could not be read.');
    const indices = metadata.flatMap((slide, index) => slide.hidden ? [] : [index]);
    if (!indices.length || indices.length > 200) throw new Error('Choose a PowerPoint with 1 to 200 visible slides.');
    signal.throwIfAborted();
    presentation = await parse(bytes, { zip: zipLimits });
    if (presentation.source !== 'pptx' || presentation.slides.length !== metadata.length) {
      throw new Error('The browser player could not match the PowerPoint slides.');
    }
    signal.throwIfAborted();
    const width = Math.max(1, Math.round(presentation.width));
    const height = Math.max(1, Math.round(presentation.height));
    if (![width, height].every(value => Number.isFinite(value) && value <= 16384)) throw new Error('The slide dimensions could not be displayed.');
    const lifetime = new AbortController();
    const assets = new Map();
    const frames = new Map();

    function frame(index, linkAreas) {
      const key = index + ':' + linkAreas;
      if (frames.has(key)) {
        const cached = frames.get(key);
        frames.delete(key);
        frames.set(key, cached);
        return cached;
      }
      const task = render(index, linkAreas);
      frames.set(key, task);
      if (frames.size > 6) frames.delete(frames.keys().next().value);
      task.catch(() => { if (frames.get(key) === task) frames.delete(key); });
      return task;
    }

    function localData(url) {
      if (!assets.has(url)) {
        assets.set(url, fetch(url, { signal: lifetime.signal }).then(response => response.blob()).then(fileData));
        if (assets.size > 12) assets.delete(assets.keys().next().value);
      }
      return assets.get(url);
    }

    async function render(index, linkAreas) {
      lifetime.signal.throwIfAborted();
      const slide = presentation.slides[indices[index]];
      const { svg, linkedImages } = safeSlideSvg(presentation, slide);
      const resources = Array.from(svg.querySelectorAll('image'), image => {
        const href = image.getAttribute('href') ?? image.getAttribute('xlink:href');
        if (!href?.startsWith('blob:')) return null;
        return localData(href).then(url => {
          image.removeAttribute('xlink:href');
          image.setAttribute('href', url);
        });
      });
      await Promise.all(resources);
      for (const style of svg.querySelectorAll('style')) {
        const text = style.textContent;
        const matches = [...text.matchAll(/url\(['"](blob:[^'"]+)['"]\)/g)];
        const replacements = await Promise.all(matches.map(async match => [match[1], await localData(match[1])]));
        style.textContent = replacements.reduce((value, [url, data]) => value.replaceAll(url, data), text);
      }
      lifetime.signal.throwIfAborted();
      const scale = Math.min((linkAreas ? 1920 : 256) / width, (linkAreas ? 1080 : 144) / height);
      svg.setAttribute('width', Math.max(1, Math.round(width * scale)));
      svg.setAttribute('height', Math.max(1, Math.round(height * scale)));
      const links = linkAreas ? measureSlideLinks(svg, width, height, indices) : [];
      const image = await makeImage(svg, lifetime.signal);
      return { image, links, hints: linkAreas ? compatibilityFor(slide, linkedImages) : [] };
    }

    return {
      count: indices.length, powerpoint: true, direct: true,
      slides: indices.map(index => metadata[index]),
      async render(index, canvas) {
        const stage = canvas.width > 256;
        const { image, links, hints } = await frame(index, stage);
        lifetime.signal.throwIfAborted();
        const scale = Math.min(canvas.width / width, canvas.height / height);
        const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
        const x = Math.round((canvas.width - w) / 2), y = Math.round((canvas.height - h) / 2);
        const context = canvas.getContext('2d', { alpha: false });
        context.fillStyle = '#17161d';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, x, y, w, h);
        if (stage) return {
          hints,
          links: links.map(link => ({ ...link,
            x: (x + link.x * w) / canvas.width, y: (y + link.y * h) / canvas.height,
            width: link.width * w / canvas.width, height: link.height * h / canvas.height })),
        };
      },
      close() {
        lifetime.abort();
        frames.clear();
        assets.clear();
        presentation.dispose();
      },
    };
  } catch (error) {
    presentation?.dispose();
    if (error.name === 'ZipSafetyError') {
      throw new Error('The browser player couldn’t read this PowerPoint. Try a fresh copy or share its slideshow window.');
    }
    throw error;
  }
}
