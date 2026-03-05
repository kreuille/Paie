/**
 * ============================================================
 * GESTIONNAIRE DE FEUILLES DE PAIE — Application JavaScript
 * UI Web pour GitHub Pages — Connexion via Google Apps Script
 * ============================================================
 */

// ============================================================
// CONFIGURATION — À RENSEIGNER APRÈS DÉPLOIEMENT APPS SCRIPT
// ============================================================
const API_CONFIG = {
  // URL du WebApp Google Apps Script (après déploiement)
  BASE_URL: localStorage.getItem('gasUrl') || 'https://script.google.com/macros/s/AKfycbzWTiRl2qKl-LUfixmapNzp1mUasx1WK0kqVaRAJ5jk38sVWCZDDgn3qS1FSjsnrEA_/exec',
  // URL de base du webhook n8n
  N8N_URL: localStorage.getItem('n8nUrl') || 'https://n8n.guedou.com/webhook',
};

// ============================================================
// ÉTAT DE L'APPLICATION
// ============================================================
const STATE = {
  salaries: [],
  fichierPDF: null,
  fileId: null,
  periode: '',
  mappingPages: [],
  indexMismatch: 0,
  mismatches: [],
  pendingAction: null,
  nomPrenomASupprimer: '',
};

// ============================================================
// INITIALISATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  verifierConfiguration();
  chargerSalaries();
  setupDragDrop();

  // Afficher la configuration si l'URL API n'est pas définie
  if (!API_CONFIG.BASE_URL) {
    afficherConfigurationPanel();
  }
});

function verifierConfiguration() {
  if (API_CONFIG.BASE_URL) {
    testConnexion();
  } else {
    setStatut('Non configuré', 'error');
  }
}

async function testConnexion() {
  try {
    const reponse = await apiGet('listerSalaries');
    setStatut('Connecté', 'connected');
  } catch (e) {
    setStatut('Erreur de connexion', 'error');
  }
}

function setStatut(texte, etat) {
  document.getElementById('statusText').textContent = texte;
  const dot = document.getElementById('statusDot');
  dot.className = 'status-dot ' + etat;
}

// ============================================================
// NAVIGATION
// ============================================================
function afficherOnglet(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('tab-' + tabId).classList.add('active');
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

  if (tabId === 'logs') chargerLogs();
}

// ============================================================
// GESTION DES SALARIÉS
// ============================================================
async function chargerSalaries() {
  const tbody = document.getElementById('bodyTableSalaries');
  tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Chargement...</td></tr>';

  try {
    const data = await apiGet('listerSalaries');
    STATE.salaries = Array.isArray(data) ? data : [];
    afficherTableauSalaries(STATE.salaries);
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell" style="color:var(--danger)">
      Erreur de connexion. <button class="btn btn-secondary" onclick="chargerSalaries()">Réessayer</button>
      <br><small>${error.message}</small></td></tr>`;
  }
}

function afficherTableauSalaries(liste) {
  const tbody = document.getElementById('bodyTableSalaries');

  if (!liste.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Aucun salarié enregistré</td></tr>';
    return;
  }

  tbody.innerHTML = liste.map(s => `
    <tr>
      <td><span class="text-muted">${s.id}</span></td>
      <td><strong>${s.nomPrenom}</strong></td>
      <td>${s.email || '<span class="text-muted">—</span>'}</td>
      <td>${formaterDate(s.dateEntree)}</td>
      <td>
        <span class="badge ${s.statut === 'Actif' ? 'badge-actif' : 'badge-inactif'}">
          ${s.statut}
        </span>
      </td>
      <td>
        <div class="action-btns">
          <button class="btn-icon" title="Modifier" onclick="ouvrirFormulaire('modifier', '${s.nomPrenom}')">✏️</button>
          <button class="btn-icon" title="Désactiver" onclick="demanderSuppression('${s.nomPrenom}')">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filtrerSalaries(query) {
  const filtre = query.toLowerCase();
  const filtres = STATE.salaries.filter(s =>
    s.nomPrenom.toLowerCase().includes(filtre) ||
    (s.email || '').toLowerCase().includes(filtre)
  );
  afficherTableauSalaries(filtres);
}

// ---- Formulaire Salarié ----
function ouvrirFormulaire(mode, nomPrenom = '') {
  const form = document.getElementById('formSalarie');
  form.reset();

  document.getElementById('modeFormulaire').value = mode;
  document.getElementById('nomPrenomOriginal').value = nomPrenom;

  if (mode === 'ajouter') {
    document.getElementById('titreFormulaire').textContent = 'Ajouter un salarié';
    document.getElementById('btnSoumettreForm').textContent = 'Enregistrer';
    document.getElementById('fieldNom').readOnly = false;
    document.getElementById('fieldPrenom').readOnly = false;
    document.getElementById('groupeDateEntree').style.display = '';
  } else {
    document.getElementById('titreFormulaire').textContent = 'Modifier le salarié';
    document.getElementById('btnSoumettreForm').textContent = 'Mettre à jour';

    const salarie = STATE.salaries.find(s => s.nomPrenom === nomPrenom);
    if (salarie) {
      const parties = nomPrenom.split('_');
      document.getElementById('fieldNom').value = parties[0] || salarie.nom;
      document.getElementById('fieldPrenom').value = parties[1] || salarie.prenom;
      document.getElementById('fieldEmail').value = salarie.email;
      document.getElementById('fieldDateEntree').value = salarie.dateEntree;
      // Nom/Prénom non modifiables (NOM_Prenom = identifiant clé du dossier Drive)
      document.getElementById('fieldNom').readOnly = true;
      document.getElementById('fieldPrenom').readOnly = true;
    }
  }

  ouvrirModal('modalSalarie');
}

async function soumettreFormulaire(event) {
  event.preventDefault();
  const mode = document.getElementById('modeFormulaire').value;
  const btn = document.getElementById('btnSoumettreForm');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Traitement...';

  const payload = {
    nom: document.getElementById('fieldNom').value,
    prenom: document.getElementById('fieldPrenom').value,
    email: document.getElementById('fieldEmail').value,
    dateEntree: document.getElementById('fieldDateEntree').value,
  };

  try {
    let reponse;
    if (mode === 'ajouter') {
      reponse = await apiPost({ action: 'ajouterSalarie', payload });
    } else {
      const nomPrenom = document.getElementById('nomPrenomOriginal').value;
      reponse = await apiPost({ action: 'modifierSalarie', nomPrenom, payload });
    }

    if (reponse.success) {
      toast(reponse.message, 'success');
      fermerModal('modalSalarie');
      chargerSalaries();
    } else {
      toast('Erreur : ' + reponse.error, 'error');
    }
  } catch (error) {
    toast('Erreur réseau : ' + error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = mode === 'ajouter' ? 'Enregistrer' : 'Mettre à jour';
  }
}

// ---- Suppression ----
function demanderSuppression(nomPrenom) {
  STATE.nomPrenomASupprimer = nomPrenom;
  document.getElementById('messageSuppression').textContent =
    `Confirmer la désactivation de ${nomPrenom} ?\n\nLe salarié sera marqué "Inactif".`;
  ouvrirModal('modalSuppression');
}

async function confirmerSuppression() {
  const btn = document.getElementById('btnConfirmerSuppression');
  btn.disabled = true;

  try {
    const reponse = await apiPost({
      action: 'supprimerSalarie',
      nomPrenom: STATE.nomPrenomASupprimer
    });

    if (reponse.success) {
      toast(reponse.message, 'success');
      fermerModal('modalSuppression');
      chargerSalaries();
    } else {
      toast('Erreur : ' + reponse.error, 'error');
    }
  } catch (error) {
    toast('Erreur réseau : ' + error.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ============================================================
// UPLOAD ET TRAITEMENT PDF
// ============================================================

function setupDragDrop() {
  const zone = document.getElementById('uploadZone');

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });

  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const fichier = e.dataTransfer.files[0];
    if (fichier && fichier.type === 'application/pdf') {
      traiterFichierSelectionne(fichier);
    } else {
      toast('Veuillez déposer un fichier PDF valide.', 'warning');
    }
  });
}

function gererSelectionFichier(input) {
  if (input.files && input.files[0]) {
    traiterFichierSelectionne(input.files[0]);
  }
}

function traiterFichierSelectionne(fichier) {
  STATE.fichierPDF = fichier;

  const zone = document.getElementById('uploadZone');
  zone.innerHTML = `
    <div class="upload-icon">✅</div>
    <h3>${fichier.name}</h3>
    <p>${formaterTaille(fichier.size)}</p>
    <button class="btn btn-secondary mt-8" onclick="reinitialiserUpload()">
      Changer de fichier
    </button>`;

  // Afficher le champ période
  document.getElementById('periodeField').style.display = 'flex';

  // Suggestion automatique de la période courante
  const now = new Date();
  const mois = String(now.getMonth() + 1).padStart(2, '0');
  const annee = now.getFullYear();
  document.getElementById('periodeInput').value = `${mois}-${annee}`;
}

async function lancerTraitement() {
  const periode = document.getElementById('periodeInput').value.trim();

  // Validation de la période
  if (!/^\d{2}-\d{4}$/.test(periode)) {
    toast('Format de période invalide. Utilisez MM-YYYY (ex: 03-2025)', 'warning');
    return;
  }

  if (!STATE.fichierPDF) {
    toast('Veuillez sélectionner un fichier PDF.', 'warning');
    return;
  }

  STATE.periode = periode;

  // Afficher le panel de traitement
  document.getElementById('periodeField').style.display = 'none';
  document.getElementById('traitementPanel').style.display = 'block';

  const utiliserN8n = !!API_CONFIG.N8N_URL;

  // ÉTAPE 2 — Validation PDF côté client (avant upload)
  await executerEtape(2, 'Validation du fichier...', async () => {
    const valide = await validerPDFClient(STATE.fichierPDF);
    if (!valide) {
      await attendreConfirmationHumaine('modalPDFCorrompu');
    }
    return { valide: true };
  });

  // ÉTAPE 1 — Upload + (si n8n) extraction et matching en une seule requête
  await executerEtape(1, 'Upload vers Google Drive...', async () => {
    const base64 = await lireEnBase64(STATE.fichierPDF);

    if (utiliserN8n) {
      const reponse = await apiN8n('paie-upload', {
        fileData: base64,
        fileName: STATE.fichierPDF.name,
        periode: STATE.periode,
      });

      if (!reponse.success && reponse.alert === 'PDF_CORROMPU') {
        await attendreConfirmationHumaine('modalPDFCorrompu');
      } else if (!reponse.success) {
        const detail = reponse.error || JSON.stringify(reponse);
        throw new Error('Erreur n8n upload : ' + detail);
      }

      STATE.fileId = reponse.fileId;
      // n8n renvoie déjà le mapping extrait et matché
      STATE.mappingPages = reponse.mapping || [];
      return { pages: STATE.mappingPages.length };
    } else {
      const reponse = await apiPost({
        action: 'uploadPDF',
        fileData: base64,
        fileName: STATE.fichierPDF.name,
        periode: STATE.periode,
      });
      if (!reponse.success) throw new Error(reponse.error);
      STATE.fileId = reponse.fileId;
      return reponse;
    }
  });

  // ÉTAPE 3 — Extraction (faite par n8n) ou simulation
  await executerEtape(3, 'Extraction des identités...', async () => {
    if (utiliserN8n) {
      // Déjà effectué lors de l'étape 1 via n8n
      return { pages: STATE.mappingPages.length };
    }
    const mapping = await simulerExtractionPDF();
    STATE.mappingPages = mapping;
    return { pages: mapping.length };
  });

  // ÉTAPE 4 — Matching (fait par n8n) ou vérification locale
  await executerEtape(4, 'Matching avec la base salariés...', async () => {
    if (utiliserN8n) {
      // Gérer les cas EMAIL_MANQUANT et NON_TROUVE retournés par n8n
      const resultats = await verifierMappingAvecBase(STATE.mappingPages);
      return resultats;
    }
    const resultats = await verifierMappingAvecBase(STATE.mappingPages);
    return resultats;
  });

  // ÉTAPE 5 — Confirmation globale avant envoi
  await executerEtape(5, 'Préparation du récapitulatif...', async () => {
    await afficherConfirmationGlobale();
    return { confirmed: true };
  });

  // ÉTAPES 6, 7, 8 — Traitement final (via n8n ou directement GAS)
  await executerEtape(6, 'Découpage et stockage des fiches...', async () => {
    const mappingFiltré = STATE.mappingPages.filter(m => m.inclure !== false);

    let reponse;
    if (utiliserN8n) {
      reponse = await apiN8n('paie-confirmer', {
        fileId: STATE.fileId,
        mapping: mappingFiltré,
        periode: STATE.periode,
      });
    } else {
      reponse = await apiPost({
        action: 'confirmerEnvoi',
        fileId: STATE.fileId,
        mapping: mappingFiltré,
        periode: STATE.periode,
      });
    }

    if (!reponse.success) throw new Error(reponse.error || 'Erreur traitement');
    return reponse;
  });

  await executerEtape(7, 'Envoi des emails...', async () => {
    // Inclus dans l'étape 6
    return { done: true };
  });

  // Afficher le résultat final
  afficherResultatFinal();
}

/**
 * Exécuter une étape avec gestion des erreurs et de l'affichage
 */
async function executerEtape(numero, message, fn) {
  const etapeEl = document.getElementById('etape' + numero);
  const statutEl = document.getElementById('statut' + numero);

  etapeEl.classList.add('active');
  statutEl.textContent = '⏳';

  mettreAJourProgression(numero - 1);

  try {
    const result = await fn();
    etapeEl.classList.remove('active');
    etapeEl.classList.add('done');
    statutEl.textContent = '✅';
    mettreAJourProgression(numero);
    return result;
  } catch (error) {
    etapeEl.classList.remove('active');
    etapeEl.classList.add('error');
    statutEl.textContent = '❌';
    toast('Étape ' + numero + ' : ' + error.message, 'error');
    throw error;
  }
}

function mettreAJourProgression(etapesTerminees) {
  const pct = Math.round((etapesTerminees / 7) * 100);
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressText').textContent = `${etapesTerminees} / 7 étapes`;
}

/**
 * Validation de base du PDF côté client
 */
async function validerPDFClient(fichier) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const bytes = new Uint8Array(e.target.result.slice(0, 5));
      const header = String.fromCharCode(...bytes);
      resolve(header.startsWith('%PDF'));
    };
    reader.readAsArrayBuffer(fichier.slice(0, 5));
  });
}

/**
 * Simulation extraction PDF — En production : traitement par n8n/Apps Script
 */
async function simulerExtractionPDF() {
  // En production : Apps Script lit le PDF via un service OCR/extraction
  // et retourne un tableau de { pageIndex, nomPrenom }
  // Ici, on retourne un placeholder pour validation humaine
  return [
    { pageIndex: 0, nomPrenom: 'DUPONT_Jean', email: '', inclure: true },
    // D'autres entrées seraient détectées automatiquement
  ];
}

/**
 * Vérifier le mapping avec la base de données
 */
async function verifierMappingAvecBase(mapping) {
  for (let i = 0; i < mapping.length; i++) {
    const item = mapping[i];
    const salarie = STATE.salaries.find(s => s.nomPrenom === item.nomPrenom);

    if (!salarie) {
      // ⚠️ Salarié non trouvé — attente humaine
      document.getElementById('messageSalarieIntrouvable').textContent =
        `Le salarié "${item.nomPrenom}" n'existe pas dans la base. Que souhaitez-vous faire ?`;
      STATE.pendingAction = { type: 'mismatch', index: i };
      const action = await attendreConfirmationHumaine('modalSalarieIntrouvable');

      if (action === 'ignorer') {
        mapping[i].inclure = false;
      } else if (action === 'stopper') {
        throw new Error('Traitement stoppé par l\'utilisateur');
      }
      // 'creer' : ouvre le formulaire d'ajout — reprise après fermeture
    } else {
      mapping[i].email = salarie.email;

      if (!salarie.email) {
        // ⚠️ Email manquant
        document.getElementById('messageEmailManquant').textContent =
          `Aucun email pour ${item.nomPrenom}. Saisir l'email ou ignorer ?`;
        STATE.pendingAction = { type: 'emailManquant', index: i };
        const email = await attendreConfirmationHumaine('modalEmailManquant');

        if (email && email !== 'ignorer') {
          mapping[i].email = email;
        }
      }
    }
  }
  return mapping;
}

/**
 * Afficher la confirmation globale avant envoi
 */
async function afficherConfirmationGlobale() {
  const inclus = STATE.mappingPages.filter(m => m.inclure !== false);
  const avecEmail = inclus.filter(m => m.email && m.email.trim() !== '');
  const problemes = STATE.mappingPages.filter(m => m.inclure === false);

  // Remplir le récapitulatif
  document.getElementById('recapBox').innerHTML = `
    <strong>Fiches détectées :</strong> ${STATE.mappingPages.length}<br>
    <strong>Salariés identifiés :</strong> ${inclus.length}<br>
    <strong>Emails disponibles :</strong> ${avecEmail.length}<br>
    <strong>Problèmes détectés :</strong> ${problemes.length}`;

  const lignes = STATE.mappingPages.map(m => `
    <div class="recap-item">
      <span>
        <span class="${m.inclure === false ? 'recap-item-error' : (!m.email ? 'recap-item-warn' : 'recap-item-ok')}">
          ${m.inclure === false ? '❌' : (!m.email ? '⚠️' : '✅')}
        </span>
        ${m.nomPrenom}
      </span>
      <span class="text-muted">${m.email || '(pas d\'email)'}</span>
    </div>`).join('');

  document.getElementById('recapListe').innerHTML = lignes;

  return attendreConfirmationHumaine('modalConfirmationEnvoi');
}

function annulerEnvoi() {
  fermerModal('modalConfirmationEnvoi');
  if (STATE.pendingAction && STATE.pendingAction._resolve) {
    STATE.pendingAction._resolve('annuler');
  }
  reinitialiserUpload();
  toast('Envoi annulé.', 'warning');
}

function confirmerEnvoi() {
  fermerModal('modalConfirmationEnvoi');
  if (STATE.pendingAction && STATE.pendingAction._resolve) {
    STATE.pendingAction._resolve('confirmer');
  }
}

function continuerMalgre() {
  fermerModal('modalPDFCorrompu');
  if (STATE.pendingAction && STATE.pendingAction._resolve) {
    STATE.pendingAction._resolve('continuer');
  }
}

function gererSalarieIntrouvable(action) {
  fermerModal('modalSalarieIntrouvable');
  if (action === 'creer') {
    ouvrirFormulaire('ajouter');
  }
  if (STATE.pendingAction && STATE.pendingAction._resolve) {
    STATE.pendingAction._resolve(action);
  }
}

function gererEmailManquant(action) {
  let valeur = action;
  if (action === 'sauvegarder') {
    valeur = document.getElementById('emailManquantInput').value;
  }
  fermerModal('modalEmailManquant');
  if (STATE.pendingAction && STATE.pendingAction._resolve) {
    STATE.pendingAction._resolve(valeur);
  }
}

/**
 * Attendre une confirmation humaine (Promise qui se résout quand l'utilisateur agit)
 */
function attendreConfirmationHumaine(modalId) {
  return new Promise((resolve) => {
    if (!STATE.pendingAction) STATE.pendingAction = {};
    STATE.pendingAction._resolve = resolve;
    ouvrirModal(modalId);
  });
}

/**
 * Afficher le résultat final
 */
function afficherResultatFinal() {
  const inclus = STATE.mappingPages.filter(m => m.inclure !== false);
  const avecEmail = inclus.filter(m => m.email && m.email.trim() !== '');
  const erreurs = STATE.mappingPages.filter(m => m.inclure === false);

  document.getElementById('resultatGrid').innerHTML = `
    <div class="resultat-card">
      <div class="rcard-value">${STATE.mappingPages.length}</div>
      <div class="rcard-label">Fiches traitées</div>
    </div>
    <div class="resultat-card">
      <div class="rcard-value" style="color:var(--success)">${avecEmail.length}</div>
      <div class="rcard-label">Emails envoyés</div>
    </div>
    <div class="resultat-card">
      <div class="rcard-value" style="color:var(--danger)">${erreurs.length}</div>
      <div class="rcard-label">Erreurs</div>
    </div>
    <div class="resultat-card">
      <div class="rcard-value" style="color:var(--text-muted)">—</div>
      <div class="rcard-label">Durée</div>
    </div>`;

  ouvrirModal('modalResultat');
  chargerLogs();
}

function reinitialiserUpload() {
  STATE.fichierPDF = null;
  STATE.fileId = null;
  STATE.mappingPages = [];
  STATE.pendingAction = null;

  document.getElementById('fileInput').value = '';
  document.getElementById('periodeField').style.display = 'none';
  document.getElementById('traitementPanel').style.display = 'none';
  document.getElementById('periodeInput').value = '';

  const zone = document.getElementById('uploadZone');
  zone.innerHTML = `
    <div class="upload-icon">📄</div>
    <h3>Glisser-déposer votre PDF ici</h3>
    <p>ou</p>
    <label class="btn btn-primary upload-label">
      Sélectionner un fichier PDF
      <input type="file" id="fileInput" accept=".pdf" onchange="gererSelectionFichier(this)">
    </label>
    <p class="upload-info">Format accepté : PDF uniquement — Toutes tailles</p>`;

  // Réinitialiser les étapes
  for (let i = 1; i <= 7; i++) {
    const el = document.getElementById('etape' + i);
    if (el) {
      el.classList.remove('active', 'done', 'error');
      document.getElementById('statut' + i).textContent = '⏳';
    }
  }
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('progressText').textContent = '0 / 7 étapes';
}

// ============================================================
// JOURNAUX
// ============================================================
async function chargerLogs() {
  const tbody = document.getElementById('bodyTableLogs');
  tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Chargement...</td></tr>';

  try {
    const data = await apiGet('getLogs', { limit: 100 });
    const logs = Array.isArray(data) ? data : [];

    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Aucun log enregistré</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(log => `
      <tr>
        <td class="text-muted">${log.dateHeure}</td>
        <td><code>${log.action}</code></td>
        <td class="text-muted">${log.fichier || '—'}</td>
        <td><strong>${log.salarie || '—'}</strong></td>
        <td>${badgeStatut(log.statut)}</td>
        <td class="text-muted">${log.detail || '—'}</td>
      </tr>`).join('');
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell" style="color:var(--danger)">
      Erreur : ${error.message}</td></tr>`;
  }
}

function badgeStatut(statut) {
  if (!statut) return '—';
  if (statut.includes('✅') || statut.includes('Succès') || statut.includes('Envoyé') || statut.includes('Reçu') || statut.includes('Stocké'))
    return `<span class="badge badge-actif">${statut}</span>`;
  if (statut.includes('❌') || statut.includes('Erreur') || statut.includes('Échec'))
    return `<span class="badge badge-inactif">${statut}</span>`;
  return statut;
}

// ============================================================
// CONFIGURATION DU PANNEAU API
// ============================================================
function afficherConfigurationPanel() {
  const panel = document.createElement('div');
  panel.id = 'configPanel';
  panel.style.cssText = `
    position:fixed; bottom:80px; right:24px; background:white;
    border:2px solid var(--primary); border-radius:12px; padding:20px;
    box-shadow:0 4px 16px rgba(0,0,0,.2); z-index:999; max-width:380px;
  `;
  panel.innerHTML = `
    <h4 style="margin-bottom:10px;color:var(--primary)">⚙️ Configuration requise</h4>
    <p style="font-size:.85rem;margin-bottom:12px;">
      Renseignez les URLs de votre WebApp Google Apps Script et de votre webhook n8n.
    </p>
    <label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:4px;">URL Google Apps Script</label>
    <input type="url" id="gasUrlInput" placeholder="https://script.google.com/macros/s/..."
      value="${API_CONFIG.BASE_URL}"
      style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;margin-bottom:10px;font-size:.85rem;">
    <label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:4px;">URL webhook n8n (base)</label>
    <input type="url" id="n8nUrlInput" placeholder="https://my-n8n.cloud/webhook"
      value="${API_CONFIG.N8N_URL}"
      style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;margin-bottom:10px;font-size:.85rem;">
    <button onclick="sauvegarderURL()" class="btn btn-primary" style="width:100%">
      Enregistrer
    </button>`;
  document.body.appendChild(panel);
}

function sauvegarderURL() {
  const gasUrl = document.getElementById('gasUrlInput').value.trim();
  const n8nUrl = document.getElementById('n8nUrlInput').value.trim();

  if (!gasUrl.startsWith('https://script.google.com')) {
    toast('URL GAS invalide. Elle doit commencer par https://script.google.com', 'error');
    return;
  }
  if (n8nUrl && !n8nUrl.startsWith('https://')) {
    toast('URL n8n invalide. Elle doit commencer par https://', 'error');
    return;
  }

  localStorage.setItem('gasUrl', gasUrl);
  API_CONFIG.BASE_URL = gasUrl;

  if (n8nUrl) {
    localStorage.setItem('n8nUrl', n8nUrl);
    API_CONFIG.N8N_URL = n8nUrl;
  }

  document.getElementById('configPanel')?.remove();
  toast('Configuration enregistrée !', 'success');
  testConnexion();
  chargerSalaries();
}

// ============================================================
// UTILITAIRES API
// ============================================================
async function apiGet(action, params = {}) {
  if (!API_CONFIG.BASE_URL) throw new Error('URL API non configurée');

  const url = new URL(API_CONFIG.BASE_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function apiPost(data) {
  if (!API_CONFIG.BASE_URL) throw new Error('URL API non configurée');

  const response = await fetch(API_CONFIG.BASE_URL, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function apiN8n(path, data) {
  if (!API_CONFIG.N8N_URL) throw new Error('URL n8n non configurée');
  const base = API_CONFIG.N8N_URL.replace(/\/$/, '');
  const response = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, gasUrl: API_CONFIG.BASE_URL }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} sur ${path}`);
  const text = await response.text();
  if (!text || !text.trim()) {
    throw new Error(
      `n8n webhook "${path}" a répondu vide (HTTP ${response.status}).\n` +
      `Dans n8n : mode Webhook → "Respond using Respond to Webhook node", ` +
      `puis ajouter un nœud "Respond to Webhook" qui retourne {"success":true,"fileId":"...","mapping":[]}`
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Réponse n8n invalide (non-JSON) : ${text.substring(0, 200)}`);
  }
}

function lireEnBase64(fichier) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(fichier);
  });
}

// ============================================================
// UTILITAIRES UI
// ============================================================
function ouvrirModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function fermerModal(id) {
  document.getElementById(id).style.display = 'none';
}

// Fermer une modale en cliquant sur l'overlay
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.style.display = 'none';
  }
});

function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span>
    <span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function formaterDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formaterTaille(bytes) {
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}
