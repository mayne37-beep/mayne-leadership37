const relationshipNamespaces = [
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  'http://purl.oclc.org/ooxml/officeDocument/relationships',
];
const packageOrigin = 'https://powerpoint.invalid';

async function readXml(zip, parser, part, maxBytes = 2 * 1024 * 1024) {
  const entry = zip.file(part);
  if (!entry || entry._data.uncompressedSize > maxBytes) return null;
  const source = await entry.async('string');
  if (/<!DOCTYPE/i.test(source)) return null;
  const xml = parser.parseFromString(source, 'application/xml');
  return xml.getElementsByTagNameNS('*', 'parsererror').length ? null : xml.documentElement;
}

async function relationships(zip, parser, part) {
  const slash = part.lastIndexOf('/');
  const path = part.slice(0, slash + 1) + '_rels/' + part.slice(slash + 1) + '.rels';
  const xml = await readXml(zip, parser, path);
  const targets = new Map();
  for (const relationship of xml?.children ?? []) {
    const target = relationship.getAttribute('Target');
    if (!target || relationship.getAttribute('TargetMode') === 'External') continue;
    try {
      const url = new URL(target, packageOrigin + '/' + part);
      if (url.origin !== packageOrigin || url.search || url.hash) continue;
      targets.set(relationship.getAttribute('Id'), {
        type: relationship.getAttribute('Type'),
        part: decodeURIComponent(url.pathname.slice(1)),
      });
    } catch {}
  }
  return targets;
}

function isRelationship(relationship, name) {
  return relationshipNamespaces.some(namespace => relationship?.type === namespace + '/' + name);
}

function placeholderBodies(xml, ...types) {
  const bodies = [];
  if (!xml) return bodies;
  const ns = xml.namespaceURI;
  for (const shape of xml.getElementsByTagNameNS(ns, 'sp')) {
    const placeholder = shape.getElementsByTagNameNS(ns, 'ph')[0];
    if (!types.includes(placeholder?.getAttribute('type'))) continue;
    const body = Array.from(shape.children).find(child => child.localName === 'txBody');
    if (body) bodies.push(body);
  }
  return bodies;
}

function paragraphText(paragraph) {
  const content = Array.from(paragraph.children, child => {
    if (child.localName === 'br') return '\n';
    if (child.localName === 'r' || child.localName === 'fld') return child.getElementsByTagNameNS('*', 't')[0]?.textContent ?? '';
    return '';
  }).join('');
  const bullet = paragraph.getElementsByTagNameNS('*', 'buChar')[0]?.getAttribute('char');
  return bullet && content ? bullet + ' ' + content : content;
}

function bodyText(bodies) {
  return bodies.flatMap(body => Array.from(body.children)
    .filter(paragraph => paragraph.localName === 'p')
    .map(paragraphText)).join('\n').trim();
}

export async function readPowerPointSlides(zip, parser = new DOMParser()) {
  const part = 'ppt/presentation.xml';
  const presentation = await readXml(zip, parser, part);
  const list = presentation?.getElementsByTagNameNS(presentation.namespaceURI, 'sldIdLst')[0];
  if (!list?.children.length) return null;
  const targets = await relationships(zip, parser, part);
  const slides = [];
  for (const id of list.children) {
    if (id.localName !== 'sldId') continue;
    const relationshipId = relationshipNamespaces.map(ns => id.getAttributeNS(ns, 'id')).find(Boolean);
    const target = targets.get(relationshipId);
    if (!isRelationship(target, 'slide')) return null;
    const slide = await readXml(zip, parser, target.part, 8 * 1024 * 1024);
    if (slide?.localName !== 'sld') return null;
    const notesTarget = Array.from((await relationships(zip, parser, target.part)).values())
      .find(relationship => isRelationship(relationship, 'notesSlide'));
    const notesPage = notesTarget && await readXml(zip, parser, notesTarget.part);
    const notes = bodyText(placeholderBodies(notesPage, 'body'));
    slides.push({
      title: bodyText(placeholderBodies(slide, 'title', 'ctrTitle')).replace(/\s+/g, ' ').slice(0, 160),
      notes: notes.length <= 24000 ? notes : notes.slice(0, 23999) + '…',
      hidden: ['0', 'false'].includes(slide.getAttribute('show')),
    });
  }
  return slides.length ? slides : null;
}

export function matchPowerPointPages(slides, count) {
  if (!slides) return null;
  const visible = slides.flatMap((slide, index) => slide.hidden ? [] : [{ slide, index }]);
  if (count === visible.length) return { slides: visible.map(({ slide }) => slide) };
  if (count === slides.length) {
    return { slides: visible.map(({ slide }) => slide), indices: visible.map(({ index }) => index) };
  }
  return null;
}
