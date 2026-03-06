const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { PDFDocument } = require('pdf-lib');

const PDF_PATH = '/home/user/Paie/test_fiches_paie.pdf';
const OUT_DIR = '/tmp/pages_debug';

fs.mkdirSync(OUT_DIR, { recursive: true });

// ══════════════════════════════════════════════════════════════
// Fonction extraireNomPrenom — même code que n8n
// ══════════════════════════════════════════════════════════════
function extraireNomPrenom(texte) {
  if (!texte || !texte.trim()) return '';
  const lignes = texte.split('\n').map(l => l.trim()).filter(l => l.length > 2);

  for (const ligne of lignes.slice(0, 20)) {
    // Pattern 1 : MAJUSCULES Prénom (ex: DUPONT Jean)
    const m1 = ligne.match(/^([A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ\-\']{1,})\s+([A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ][a-zàâäéèêëïîùûüçœæ\-\']{1,})(?:\s|$)/);
    if (m1) return m1[1].trim() + '_' + m1[2].trim();

    // Pattern 2 : "Nom :" ou "Employé :" suivi du nom
    const m2 = ligne.match(/(?:Nom|Employé|Collaborateur|Salarié)\s*[:\-]\s*([A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ][a-zA-ZÀ-ÿ\s\-\']{2,})/i);
    if (m2) {
      const parts = m2[1].trim().split(/\s+/);
      if (parts.length >= 2) return parts[0].toUpperCase() + '_' + parts[1];
    }

    // Pattern 3 : Prénom NOM (ex: Jean DUPONT)
    const m3 = ligne.match(/^([A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ][a-zàâäéèêëïîùûüçœæ\-\']{1,})\s+([A-ZÀÂÄÉÈÊËÏÎÙÛÜÇ]{2,})(?:\s|$)/);
    if (m3) return m3[2] + '_' + m3[1];
  }
  return '';
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  DEBUG COMPLET — PIPELINE FICHE DE PAIE');
  console.log('═══════════════════════════════════════════════════════\n');

  const buffer = fs.readFileSync(PDF_PATH);
  console.log(`📄 PDF chargé: ${PDF_PATH}`);
  console.log(`   Taille: ${(buffer.length / 1024).toFixed(1)} KB\n`);

  // ── ÉTAPE 1: Vérification en-tête PDF ─────────────────────────────────────
  console.log('── ÉTAPE 1 : Validation en-tête PDF ──────────────────');
  const header = buffer.slice(0, 5).toString('ascii');
  const estPDF = header.startsWith('%PDF');
  console.log(`   Header: "${header}" → estPDF = ${estPDF}`);
  if (!estPDF) { console.error('ÉCHEC: fichier non PDF'); process.exit(1); }
  console.log('   ✅ PDF valide\n');

  // ── ÉTAPE 2: Extraction texte avec pdf-parse ───────────────────────────────
  console.log('── ÉTAPE 2 : Extraction texte (pdf-parse) ─────────────');
  const pdfData = await pdfParse(buffer);
  console.log(`   Pages totales: ${pdfData.numpages}`);
  console.log(`   Texte total: ${pdfData.text.length} caractères`);

  const textesPages = pdfData.text.split('\f');
  console.log(`   Pages séparées par \\f: ${textesPages.length}\n`);

  // ── ÉTAPE 3: Extraction NOM_Prenom par page ────────────────────────────────
  console.log('── ÉTAPE 3 : Extraction NOM_Prenom par page ───────────');
  const pages = [];
  for (let i = 0; i < pdfData.numpages; i++) {
    const texte = textesPages[i] || '';
    const nomPrenom = extraireNomPrenom(texte);

    console.log(`\n   Page ${i + 1}:`);
    console.log(`   Texte brut (50 premiers chars): "${texte.substring(0, 80).replace(/\n/g, '↵').replace(/\f/g, '⏎')}"`);
    console.log(`   Premières lignes:`);
    texte.split('\n').slice(0, 8).forEach((l, j) => {
      if (l.trim()) console.log(`     L${j+1}: "${l.trim()}"`);
    });
    console.log(`   ➜ NOM_Prenom détecté: "${nomPrenom}" ${nomPrenom ? '✅' : '❌ MANQUÉ'}`);

    pages.push({ pageIndex: i, texte: texte.substring(0, 300), nomPrenom });
  }

  // ── ÉTAPE 4: Découpage PDF avec pdf-lib ────────────────────────────────────
  console.log('\n── ÉTAPE 4 : Découpage PDF (pdf-lib) ──────────────────');
  const pdfDocLib = await PDFDocument.load(buffer);
  const totalPagesLib = pdfDocLib.getPageCount();
  console.log(`   Pages dans pdf-lib: ${totalPagesLib}`);

  for (let i = 0; i < totalPagesLib; i++) {
    const singleDoc = await PDFDocument.create();
    const [copiedPage] = await singleDoc.copyPages(pdfDocLib, [i]);
    singleDoc.addPage(copiedPage);
    const pageBytes = await singleDoc.save();
    const pageBase64 = Buffer.from(pageBytes).toString('base64');

    const outFile = path.join(OUT_DIR, `page_${i+1}_${pages[i]?.nomPrenom || 'INCONNU'}.pdf`);
    fs.writeFileSync(outFile, pageBytes);
    console.log(`   Page ${i+1}: ${(pageBytes.length/1024).toFixed(1)} KB → ${outFile}`);
    console.log(`            base64 length: ${pageBase64.length} chars ✅`);

    pages[i].pageBase64 = pageBase64;
  }

  // ── ÉTAPE 5: Simulation matching avec liste salariés ──────────────────────
  console.log('\n── ÉTAPE 5 : Matching NOM_Prenom → Salarié ───────────');
  const salariesDB = [
    { nomPrenom: 'DUPONT_Jean', email: 'arnaudguedou@gmail.com', idDossierDrive: 'DRIVE_ID_DUPONT' },
    { nomPrenom: 'MARTIN_Sophie', email: 'arnaudguedou@gmail.com', idDossierDrive: 'DRIVE_ID_MARTIN' },
    { nomPrenom: 'GUEDOU_Arnaud', email: 'arnaudguedou@gmail.com', idDossierDrive: 'DRIVE_ID_GUEDOU' },
  ];

  function normaliser(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
  }

  const indexSalaries = {};
  for (const s of salariesDB) {
    indexSalaries[normaliser(s.nomPrenom)] = s;
  }

  const mapping = [];
  for (const page of pages) {
    const nomNorm = normaliser(page.nomPrenom);
    let salarie = indexSalaries[nomNorm] || null;

    if (!salarie && nomNorm.length > 2) {
      const nomSeul = nomNorm.split('_')[0];
      for (const [key, val] of Object.entries(indexSalaries)) {
        if (key.startsWith(nomSeul + '_') || key === nomSeul) { salarie = val; break; }
      }
    }

    const statut = !salarie ? 'NON_TROUVE' : !salarie.email ? 'EMAIL_MANQUANT' : 'OK';
    console.log(`   Page ${page.pageIndex+1}: "${page.nomPrenom}" → norm="${nomNorm}" → ${statut} ${statut === 'OK' ? '✅' : '❌'}`);
    if (salarie) console.log(`             email: ${salarie.email}`);

    mapping.push({
      ...page,
      nomPrenom: salarie?.nomPrenom || page.nomPrenom,
      statut,
      email: salarie?.email || null,
      inclure: statut !== 'NON_TROUVE',
    });
  }

  // ── ÉTAPE 6: Simulation email (vérification corps HTML) ───────────────────
  console.log('\n── ÉTAPE 6 : Corps email (vérification) ───────────────');
  for (const item of mapping.filter(m => m.statut === 'OK')) {
    const [nom, prenom] = (item.nomPrenom || '_').split('_');
    const moisEnLettres = 'mars';
    const annee = '2026';
    const sujet = `Votre fiche de paie - ${moisEnLettres} ${annee}`;
    console.log(`   → ${item.nomPrenom} <${item.email}>`);
    console.log(`     Sujet: "${sujet}"`);
    console.log(`     PJ attendue: ${item.nomPrenom}_Fiche_Paie_03-2026.pdf`);
    console.log(`     pageBase64 fourni: ${item.pageBase64 ? '✅ OUI (' + (item.pageBase64.length/1024).toFixed(0) + ' KB)' : '❌ NON (fallback PDF complet)'}`);
  }

  // ── RÉSUMÉ ─────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  RÉSUMÉ DU PIPELINE');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Pages extraites     : ${pages.length}`);
  console.log(`  Noms détectés       : ${pages.filter(p => p.nomPrenom).length}/${pages.length}`);
  console.log(`  Matching OK         : ${mapping.filter(m => m.statut === 'OK').length}/${mapping.length}`);
  console.log(`  Non trouvés         : ${mapping.filter(m => m.statut === 'NON_TROUVE').length}`);
  console.log(`  Email manquant      : ${mapping.filter(m => m.statut === 'EMAIL_MANQUANT').length}`);
  console.log(`  Pages découpées     : ${pages.filter(p => p.pageBase64).length}/${pages.length}`);
  console.log(`  Pages découpées     : ${OUT_DIR}/`);
  console.log('');

  const ok = pages.filter(p => p.nomPrenom).length === pages.length
    && mapping.filter(m => m.statut === 'OK').length === mapping.length
    && pages.filter(p => p.pageBase64).length === pages.length;

  if (ok) {
    console.log('  🟢 PIPELINE COMPLET : TOUT FONCTIONNEL');
  } else {
    console.log('  🔴 PROBLÈMES DÉTECTÉS — voir détails ci-dessus');
  }
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(e => {
  console.error('\n💥 ERREUR FATALE:', e.message);
  console.error(e.stack);
  process.exit(1);
});
