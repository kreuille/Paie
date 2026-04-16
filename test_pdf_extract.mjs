import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'fs';

const buf = readFileSync('test_fiches_paie.pdf');

function extraireNomPrenom(lignes) {
  for (const ligne of lignes.slice(0, 20)) {
    const m1 = ligne.match(/^([A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ\-\']{1,})\s+([A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ][a-zàâäéèêëïîùûüçœæ\-\']{1,})$/);
    if (m1) return m1[1].trim() + '_' + m1[2].trim();
    const m3 = ligne.match(/^([A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ][a-zàâäéèêëïîùûüçœæ\-\']{1,})\s+([A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ]{2,})$/);
    if (m3) return m3[2] + '_' + m3[1];
  }
  return '';
}

const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
console.log('Pages:', pdfDoc.numPages);

for (let i = 1; i <= pdfDoc.numPages; i++) {
  const page = await pdfDoc.getPage(i);
  const content = await page.getTextContent();
  const lineMap = new Map();
  for (const item of content.items) {
    if (!item.str?.trim()) continue;
    const y = Math.round(item.transform[5]);
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y).push({ x: item.transform[4], str: item.str });
  }
  const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
  const lignes = sortedYs.map(y => lineMap.get(y).sort((a,b)=>a.x-b.x).map(i=>i.str).join(' ').trim()).filter(l=>l);
  const nom = extraireNomPrenom(lignes);
  console.log(`Page ${i}: "${nom}" | Top lines: ${lignes.slice(0,4).join(' | ')}`);
}
