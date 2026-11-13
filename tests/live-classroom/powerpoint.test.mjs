import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
import { matchPowerPointPages, readPowerPointSlides } from '../../src/live-classroom/powerpoint-metadata.js';

const presentationNs = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const drawingNs = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const relationshipNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageNs = 'http://schemas.openxmlformats.org/package/2006/relationships';

function rels(...items) {
  return `<Relationships xmlns="${packageNs}">${items.map(([id, type, target, external]) =>
    `<Relationship Id="${id}" Type="${relationshipNs}/${type}" Target="${target}"${external ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`;
}

function shape(type, paragraphs) {
  return `<p:sp><p:nvSpPr><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr><p:txBody>${paragraphs}</p:txBody></p:sp>`;
}

function text(value) {
  return `<a:p><a:r><a:t>${value}</a:t></a:r></a:p>`;
}

function slide(part, content, attrs = '') {
  return `<p:${part} xmlns:p="${presentationNs}" xmlns:a="${drawingNs}" ${attrs}><p:cSld><p:spTree>${content}</p:spTree></p:cSld></p:${part}>`;
}

test('speaker notes follow presentation order and resolve slide-specific relationships', async () => {
  const dom = new JSDOM();
  try {
    const zip = new JSZip();
    zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="${presentationNs}" xmlns:r="${relationshipNs}">
      <p:sldIdLst><p:sldId r:id="rId8"/><p:sldId r:id="rId1"/><p:sldId r:id="rId5"/></p:sldIdLst></p:presentation>`);
    zip.file('ppt/_rels/presentation.xml.rels', rels(
      ['rId1', 'slide', 'slides/slide1.xml'],
      ['rId5', 'slide', '/ppt/slides/slide2.xml'],
      ['rId8', 'slide', 'slides/slide3.xml'],
    ));
    zip.file('ppt/slides/slide3.xml', slide('sld', shape('ctrTitle', text('Opening'))));
    zip.file('ppt/slides/slide1.xml', slide('sld', shape('title', text('Hidden')), 'show="0"'));
    zip.file('ppt/slides/slide2.xml', slide('sld', shape('title', text('Discussion'))));
    zip.file('ppt/slides/_rels/slide3.xml.rels', rels(
      ['rId2', 'notesSlide', 'https://example.com/notes.xml', true],
      ['rId4', 'notesSlide', '../notesSlides/notesSlide2.xml'],
    ));
    zip.file('ppt/notesSlides/notesSlide2.xml', slide('notes',
      shape('body', text('Ask &amp; listen.') +
        '<a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:t>Prompt</a:t></a:r><a:br/><a:r><a:t>Follow-up</a:t></a:r></a:p>') +
      shape('sldNum', text('3')) + shape('ftr', text('Footer'))));
    const checked = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));
    const result = await readPowerPointSlides(checked, new dom.window.DOMParser());
    assert.deepEqual(result, [
      { title: 'Opening', notes: 'Ask & listen.\n• Prompt\nFollow-up', hidden: false },
      { title: 'Hidden', notes: '', hidden: true },
      { title: 'Discussion', notes: '', hidden: false },
    ]);
    const visible = [result[0], result[2]];
    assert.deepEqual(matchPowerPointPages(result, 2), { slides: visible });
    assert.deepEqual(matchPowerPointPages(result, 3), { slides: visible, indices: [0, 2] });
    assert.equal(matchPowerPointPages(result, 4), null);
  } finally {
    dom.window.close();
  }
});
