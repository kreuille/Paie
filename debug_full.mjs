import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const pdfjsLib = await import('./node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const PDF_PATH = '/home/user/Paie/test_fiches_paie.pdf';
const OUT_DIR = '/tmp/pages_debug';
mkdirSync(OUT_DIR, { recursive: true });

// ── Extraction texte par ligne (via coordonnées Y de pdfjs-dist) ─────────────
async function extractPageText(pdfPage) {
  const content = await pdfPage.getTextContent();
  // Grouper les items par arrondi de Y (ligne)
  const lineMap = new Map();
  for (const item of content.items) {
    if (!item.str) continue;
    const y = Math.round(item.transform[5]);
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y).push({ x: item.transform[4], str: item.str });
  }
  // Trier les lignes de haut en bas (Y décroissant en PDF), puis les mots par X
  const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
  const lignes = sortedYs.map(y => {
    const items = lineMap.get(y).sort((a, b) => a.x - b.x);
    return items.map(i => i.str).join(' ').trim();
  }).filter(l => l.length > 0);
  return lignes;
}

// ── Extraction NOM_Prenom (sur des lignes correctement séparées) ─────────────
function extraireNomPrenom(lignes) {
  for (const ligne of lignes.slice(0, 20)) {
    // Pattern 1 : MAJUSCULES Prénom — ex: "DUPONT Jean"
    const m1 = ligne.match(/^([A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ\-\']{1,})\s+([A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ][a-zàâäéèêëïîùûüçœæ\-\']{1,})$/);
    if (m1) return m1[1].trim() + '_' + m1[2].trim();

    // Pattern 2 : label "Nom :" etc.
    const m2 = ligne.match(/(?:Nom|Employé|Collaborateur|Salarié)\s*[:\-]\s*([A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ][a-zA-ZÀ-ÿ\s\-\']{2,})/i);
    if (m2) {
      const parts = m2[1].trim().split(/\s+/);
      if (parts.length >= 2) return parts[0].toUpperCase() + '_' + parts[1];
    }

    // Pattern 3 : Prénom NOM — ex: "Jean DUPONT"
    const m3 = ligne.match(/^([A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ][a-zàâäéèêëïîùûüçœæ\-\']{1,})\s+([A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ]{2,})$/);
    if (m3) return m3[2] + '_' + m3[1];
  }
  return '';
}

console.log('═══════════════════════════════════════════════════════');
console.log('  DEBUG COMPLET — PIPELINE FICHE DE PAIE (v2)');
console.log('═══════════════════════════════════════════════════════\n');

const buffer = readFileSync(PDF_PATH);
const header = buffer.slice(0, 5).toString('ascii');
console.log(`📄 ${PDF_PATH} — ${(buffer.length/1024).toFixed(1)} KB`);
console.log(`   Header "${header}" → estPDF = ${header.startsWith('%PDF')} ✅\n`);

// Charger le PDF
const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer), standardFontDataUrl: './node_modules/pdfjs-dist/standard_fonts/' });
const pdfDoc = await loadingTask.promise;
const numPages = pdfDoc.numPages;
console.log(`── ÉTAPE 2 : Extraction texte (${numPages} pages, pdfjs ${pdfjsLib.version}) ──`);

const require = createRequire(import.meta.url);
const { PDFDocument: PDFDocCJS } = require('./node_modules/pdf-lib/cjs/index.js');
const pdfDocLib = await PDFDocCJS.load(buffer);

const pages = [];

for (let i = 1; i <= numPages; i++) {
  const page = await pdfDoc.getPage(i);
  const lignes = await extractPageText(page);

  const nomPrenom = extraireNomPrenom(lignes);

  // Découpage avec pdf-lib
  const singleDoc = await PDFDocCJS.create();
  const [cp] = await singleDoc.copyPages(pdfDocLib, [i - 1]);
  singleDoc.addPage(cp);
  const bytes = await singleDoc.save();
  const pageBase64 = Buffer.from(bytes).toString('base64');
  const outFile = join(OUT_DIR, `page_${i}_${nomPrenom || 'INCONNU'}.pdf`);
  writeFileSync(outFile, bytes);

  console.log(`\n   Page ${i}:`);
  console.log(`   Lignes extraites (${lignes.length}):`);
  lignes.slice(0, 10).forEach((l, j) => console.log(`     [${j+1}] "${l}"`));
  console.log(`   ➜ NOM_Prenom: "${nomPrenom}" ${nomPrenom ? '✅' : '❌ NON DÉTECTÉ'}`);
  console.log(`   ➜ Découpage : ${(bytes.length/1024).toFixed(1)} KB → ${outFile} ✅`);

  pages.push({ pageIndex: i-1, lignes, nomPrenom, pageBase64 });
}

// Matching
console.log(`\n── ÉTAPE 3 : Matching salarié ──────────────────────────`);
const salariesDB = [
  { nomPrenom: 'DUPONT_Jean', email: 'arnaudguedou@gmail.com' },
  { nomPrenom: 'MARTIN_Sophie', email: 'arnaudguedou@gmail.com' },
  { nomPrenom: 'GUEDOU_Arnaud', email: 'arnaudguedou@gmail.com' },
];
function normaliser(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
}
const index = {};
for (const s of salariesDB) index[normaliser(s.nomPrenom)] = s;

const mapping = [];
for (const page of pages) {
  const norm = normaliser(page.nomPrenom);
  let salarie = index[norm] || null;
  if (!salarie && norm.length > 2) {
    const nomSeul = norm.split('_')[0];
    for (const [k, v] of Object.entries(index)) {
      if (k.startsWith(nomSeul + '_')) { salarie = v; break; }
    }
  }
  const statut = !salarie ? 'NON_TROUVE' : !salarie.email ? 'EMAIL_MANQUANT' : 'OK';
  console.log(`   Page ${page.pageIndex+1}: "${page.nomPrenom}" → norm="${norm}" → ${statut} ${statut === 'OK' ? '✅' : '❌'}`);
  if (salarie) console.log(`             ↳ ${salarie.email} | pageBase64: ✅`);
  mapping.push({ ...page, statut, email: salarie?.email || null });
}

const nOk = pages.filter(p => p.nomPrenom).length;
const mOk = mapping.filter(m => m.statut === 'OK').length;
const dOk = pages.filter(p => p.pageBase64).length;

console.log('\n═══════════════════════════════════════════════════════');
console.log('  RÉSUMÉ FINAL');
console.log('═══════════════════════════════════════════════════════');
console.log(`  Noms détectés  : ${nOk}/${pages.length} ${nOk === pages.length ? '✅' : '❌'}`);
console.log(`  Matching OK    : ${mOk}/${mapping.length} ${mOk === mapping.length ? '✅' : '❌'}`);
console.log(`  Pages découpées: ${dOk}/${pages.length} ${dOk === pages.length ? '✅' : '❌'}`);
console.log('');
if (nOk === pages.length && mOk === mapping.length) {
  console.log('  🟢 PIPELINE 100% FONCTIONNEL');
} else {
  console.log('  🔴 DES PROBLÈMES SUBSISTENT');
  if (nOk < pages.length) console.log('  → Regex à ajuster pour ce format de PDF');
}
console.log('═══════════════════════════════════════════════════════\n');
