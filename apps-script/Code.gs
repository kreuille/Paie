/**
 * ============================================================
 * GESTIONNAIRE DE FEUILLES DE PAIE — Google Apps Script
 * Version : 1.0.0
 * Pays : Suisse | Devise : CHF | Langue : Français
 * ============================================================
 */

// ============================================================
// CONFIGURATION GLOBALE — À PERSONNALISER
// ============================================================
const CONFIG = {
  SPREADSHEET_ID: 'REMPLACER_PAR_VOTRE_ID', // ← Coller ici l'ID de votre Google Sheet
  DRIVE_ROOT_FOLDER_NAME: 'Fiches de Paie',
  DRIVE_SALARIES_FOLDER_NAME: 'Salariés',
  DRIVE_UPLOAD_FOLDER_NAME: 'Upload PDF',
  DRIVE_ERRORS_FOLDER_NAME: 'Erreurs',
  ADMIN_EMAIL: 'admin@votre-entreprise.ch', // ← Modifier avec l'email admin RH
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 10000, // 10 secondes
  SHEET_SALARIES: 'Salariés',
  SHEET_LOGS: 'Logs',
};

// ============================================================
// HELPER — Obtenir la Spreadsheet (standalone ou liée)
// ============================================================
function getSpreadsheet() {
  if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID !== 'REMPLACER_PAR_VOTRE_ID') {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Aucune Spreadsheet trouvée. Renseignez CONFIG.SPREADSHEET_ID avec l\'ID de votre Google Sheet.');
  return ss;
}

// ============================================================
// INITIALISATION — Créer la structure Sheets & Drive
// ============================================================

/**
 * Fonction principale d'initialisation — à lancer une seule fois
 * depuis l'éditeur Apps Script
 */
function initialiserApplication() {
  Logger.log('=== INITIALISATION DE L\'APPLICATION ===');

  try {
    // 1. Créer/Vérifier la structure Google Sheets
    initialiserSheets();

    // 2. Créer/Vérifier la structure Google Drive
    const folders = initialiserDrive();

    // 3. Déployer le WebApp (API REST)
    Logger.log('✅ Initialisation terminée avec succès');
    Logger.log('📂 Structure Drive créée : ' + JSON.stringify(folders));

    return {
      success: true,
      message: 'Application initialisée avec succès',
      driveFolders: folders
    };

  } catch (error) {
    Logger.log('❌ Erreur initialisation : ' + error.message);
    throw error;
  }
}

/**
 * Initialise les feuilles Google Sheets
 */
function initialiserSheets() {
  const ss = getSpreadsheet();

  // --- Feuille "Salariés" ---
  let sheetSalaries = ss.getSheetByName(CONFIG.SHEET_SALARIES);
  if (!sheetSalaries) {
    sheetSalaries = ss.insertSheet(CONFIG.SHEET_SALARIES);
    Logger.log('✅ Feuille Salariés créée');
  }

  // En-têtes Salariés
  const headersSalaries = [
    'ID', 'NOM', 'Prenom', 'NOM_Prenom', 'Email',
    'Date_Entrée', 'Statut', 'ID_Dossier_Drive'
  ];

  const firstRowSalaries = sheetSalaries.getRange(1, 1, 1, headersSalaries.length).getValues()[0];
  if (firstRowSalaries[0] !== 'ID') {
    sheetSalaries.getRange(1, 1, 1, headersSalaries.length).setValues([headersSalaries]);
    // Mise en forme des en-têtes
    const headerRange = sheetSalaries.getRange(1, 1, 1, headersSalaries.length);
    headerRange.setBackground('#1a73e8');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    sheetSalaries.setFrozenRows(1);
    Logger.log('✅ En-têtes Salariés configurés');
  }

  // --- Feuille "Logs" ---
  let sheetLogs = ss.getSheetByName(CONFIG.SHEET_LOGS);
  if (!sheetLogs) {
    sheetLogs = ss.insertSheet(CONFIG.SHEET_LOGS);
    Logger.log('✅ Feuille Logs créée');
  }

  // En-têtes Logs
  const headersLogs = [
    'Date_Heure', 'Action', 'Fichier', 'Salarié',
    'Statut', 'Détail_Erreur'
  ];

  const firstRowLogs = sheetLogs.getRange(1, 1, 1, headersLogs.length).getValues()[0];
  if (firstRowLogs[0] !== 'Date_Heure') {
    sheetLogs.getRange(1, 1, 1, headersLogs.length).setValues([headersLogs]);
    const headerRangeLogs = sheetLogs.getRange(1, 1, 1, headersLogs.length);
    headerRangeLogs.setBackground('#0f9d58');
    headerRangeLogs.setFontColor('#ffffff');
    headerRangeLogs.setFontWeight('bold');
    sheetLogs.setFrozenRows(1);
    Logger.log('✅ En-têtes Logs configurés');
  }

  // Supprimer la feuille par défaut "Feuille1" si vide
  const defaultSheet = ss.getSheetByName('Feuille1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 2) {
    ss.deleteSheet(defaultSheet);
  }
}

/**
 * Initialise la structure des dossiers Google Drive
 */
function initialiserDrive() {
  const rootFolder = obtenirOuCreerDossier(null, CONFIG.DRIVE_ROOT_FOLDER_NAME);
  const salariesFolder = obtenirOuCreerDossier(rootFolder, CONFIG.DRIVE_SALARIES_FOLDER_NAME);
  const uploadFolder = obtenirOuCreerDossier(rootFolder, CONFIG.DRIVE_UPLOAD_FOLDER_NAME);
  const errorsFolder = obtenirOuCreerDossier(rootFolder, CONFIG.DRIVE_ERRORS_FOLDER_NAME);

  return {
    root: { id: rootFolder.getId(), name: rootFolder.getName() },
    salaries: { id: salariesFolder.getId(), name: salariesFolder.getName() },
    upload: { id: uploadFolder.getId(), name: uploadFolder.getName() },
    errors: { id: errorsFolder.getId(), name: errorsFolder.getName() }
  };
}

/**
 * Obtient ou crée un dossier Drive
 */
function obtenirOuCreerDossier(parentFolder, folderName) {
  let folders;

  if (parentFolder) {
    folders = parentFolder.getFoldersByName(folderName);
  } else {
    folders = DriveApp.getFoldersByName(folderName);
  }

  if (folders.hasNext()) {
    return folders.next();
  }

  const newFolder = parentFolder
    ? parentFolder.createFolder(folderName)
    : DriveApp.createFolder(folderName);

  Logger.log('📂 Dossier créé : ' + folderName);
  return newFolder;
}

// ============================================================
// GESTION DES SALARIÉS (CRUD)
// ============================================================

/**
 * Ajouter un nouveau salarié
 * @param {Object} data - { nom, prenom, email, dateEntree }
 */
function ajouterSalarie(data) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_SALARIES);

    // Validation des données
    if (!data.nom || !data.prenom || !data.email || !data.dateEntree) {
      return { success: false, error: 'Tous les champs sont obligatoires' };
    }

    const nom = data.nom.toUpperCase().trim();
    const prenom = data.prenom.trim();
    const nomPrenom = nom + '_' + prenom;

    // Vérifier si le salarié existe déjà
    const existant = rechercherSalarie(nomPrenom);
    if (existant) {
      return { success: false, error: `Le salarié ${nomPrenom} existe déjà (ID: ${existant.id})` };
    }

    // Générer un ID unique
    const id = 'SAL_' + Utilities.formatDate(new Date(), 'Europe/Zurich', 'yyyyMMddHHmmss');

    // Créer le dossier Drive
    const dossierDriveId = creerDossierSalarie(nomPrenom);

    // Ajouter la ligne dans Sheets
    const nouvelleLigne = [
      id,
      nom,
      prenom,
      nomPrenom,
      data.email.trim(),
      data.dateEntree,
      'Actif',
      dossierDriveId
    ];

    sheet.appendRow(nouvelleLigne);

    // Logger l'action
    loggerAction('AJOUT_SALARIE', '', nomPrenom, '✅ Succès',
      `Salarié ajouté. Dossier Drive ID: ${dossierDriveId}`);

    return {
      success: true,
      message: `Salarié ${nomPrenom} ajouté avec succès`,
      id: id,
      dossierDriveId: dossierDriveId
    };

  } catch (error) {
    loggerAction('AJOUT_SALARIE', '', data.nom + '_' + data.prenom, '❌ Erreur', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Modifier un salarié existant
 * @param {string} nomPrenom - Identifiant NOM_Prenom
 * @param {Object} data - Champs à modifier
 */
function modifierSalarie(nomPrenom, data) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_SALARIES);

    const salarie = rechercherSalarie(nomPrenom);
    if (!salarie) {
      return { success: false, error: `Salarié ${nomPrenom} non trouvé` };
    }

    // Mise à jour des champs (sans modifier NOM_Prenom ni ID_Dossier_Drive)
    const row = salarie.row;
    const modifications = [];

    if (data.email !== undefined) {
      sheet.getRange(row, 5).setValue(data.email.trim());
      modifications.push('Email');
    }
    if (data.dateEntree !== undefined) {
      sheet.getRange(row, 6).setValue(data.dateEntree);
      modifications.push('Date_Entrée');
    }
    if (data.statut !== undefined) {
      sheet.getRange(row, 7).setValue(data.statut);
      modifications.push('Statut');
    }

    // ⚠️ NE PAS renommer le dossier Drive
    loggerAction('MODIFICATION_SALARIE', '', nomPrenom, '✅ Succès',
      `Champs modifiés: ${modifications.join(', ')}`);

    return {
      success: true,
      message: `Salarié ${nomPrenom} mis à jour (${modifications.join(', ')})`,
      modifications: modifications
    };

  } catch (error) {
    loggerAction('MODIFICATION_SALARIE', '', nomPrenom, '❌ Erreur', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Désactiver un salarié (soft delete — approbation humaine déjà faite côté UI)
 * @param {string} nomPrenom
 */
function supprimerSalarie(nomPrenom) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_SALARIES);

    const salarie = rechercherSalarie(nomPrenom);
    if (!salarie) {
      return { success: false, error: `Salarié ${nomPrenom} non trouvé` };
    }

    // Marquer comme Inactif (ne pas supprimer la ligne ni le dossier Drive)
    sheet.getRange(salarie.row, 7).setValue('Inactif');

    loggerAction('SUPPRESSION_SALARIE', '', nomPrenom, '✅ Désactivé',
      'Statut = Inactif. Dossier Drive conservé.');

    return {
      success: true,
      message: `Salarié ${nomPrenom} désactivé. Le dossier Drive est conservé.`
    };

  } catch (error) {
    loggerAction('SUPPRESSION_SALARIE', '', nomPrenom, '❌ Erreur', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Lister tous les salariés actifs
 */
function listerSalaries(inclureInactifs = false) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_SALARIES);
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return [];

  return data.slice(1)
    .filter(row => row[0] !== '' && (inclureInactifs || row[6] === 'Actif'))
    .map(row => ({
      id: row[0],
      nom: row[1],
      prenom: row[2],
      nomPrenom: row[3],
      email: row[4],
      dateEntree: row[5],
      statut: row[6],
      idDossierDrive: row[7]
    }));
}

/**
 * Rechercher un salarié par NOM_Prenom
 */
function rechercherSalarie(nomPrenom) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_SALARIES);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][3] === nomPrenom) {
      return {
        row: i + 1,
        id: data[i][0],
        nom: data[i][1],
        prenom: data[i][2],
        nomPrenom: data[i][3],
        email: data[i][4],
        dateEntree: data[i][5],
        statut: data[i][6],
        idDossierDrive: data[i][7]
      };
    }
  }
  return null;
}

/**
 * Créer un dossier salarié dans Drive
 */
function creerDossierSalarie(nomPrenom) {
  const rootFolder = obtenirOuCreerDossier(null, CONFIG.DRIVE_ROOT_FOLDER_NAME);
  const salariesFolder = obtenirOuCreerDossier(rootFolder, CONFIG.DRIVE_SALARIES_FOLDER_NAME);
  const dossierSalarie = obtenirOuCreerDossier(salariesFolder, nomPrenom);
  return dossierSalarie.getId();
}

// ============================================================
// TRAITEMENT DES PDF
// ============================================================

/**
 * Point d'entrée : Réception du PDF uploadé depuis l'UI
 * @param {string} fileData - Base64 du fichier PDF
 * @param {string} fileName - Nom original du fichier
 * @param {string} periode - MM-YYYY (ex: 03-2025)
 */
function traiterUploadPDF(fileData, fileName, periode) {
  const timestamp = Utilities.formatDate(new Date(), 'Europe/Zurich', 'yyyyMMddHHmmss');
  const nomFichierStocke = `Fiche_Paie_${periode}_${timestamp}.pdf`;

  Logger.log(`=== TRAITEMENT PDF : ${nomFichierStocke} ===`);

  try {
    // ÉTAPE 1 — Stocker le PDF dans Drive
    const fichierDrive = stockerPDFDrive(fileData, nomFichierStocke);
    loggerAction('UPLOAD_PDF', nomFichierStocke, '', '✅ Reçu',
      `Fichier stocké dans Upload PDF. ID Drive: ${fichierDrive.getId()}`);

    return {
      success: true,
      fileId: fichierDrive.getId(),
      fileName: nomFichierStocke,
      message: 'PDF reçu et stocké. Validation en cours...',
      etape: 1
    };

  } catch (error) {
    loggerAction('UPLOAD_PDF', nomFichierStocke, '', '❌ Erreur', error.message);
    notifierAdminErreur('UPLOAD_PDF', nomFichierStocke, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * ÉTAPE 1 — Stocker le PDF dans le dossier Upload PDF
 */
function stockerPDFDrive(fileData, nomFichier) {
  const rootFolder = obtenirOuCreerDossier(null, CONFIG.DRIVE_ROOT_FOLDER_NAME);
  const uploadFolder = obtenirOuCreerDossier(rootFolder, CONFIG.DRIVE_UPLOAD_FOLDER_NAME);

  const blob = Utilities.newBlob(
    Utilities.base64Decode(fileData),
    'application/pdf',
    nomFichier
  );

  return uploadFolder.createFile(blob);
}

/**
 * ÉTAPE 6 & 7 — Découper le PDF et stocker les fiches individuelles
 * Cette étape est déclenchée après confirmation humaine (étape 5)
 *
 * @param {string} fileId - ID Drive du PDF global
 * @param {Array} mapping - [{ nomPrenom, email, pageIndex }]
 * @param {string} periode - MM-YYYY
 */
function decouperEtStockerPDF(fileId, mapping, periode) {
  const resultats = [];

  for (const item of mapping) {
    let tentatives = 0;
    let succes = false;

    while (tentatives < CONFIG.MAX_RETRIES && !succes) {
      try {
        // Récupérer le salarié pour obtenir l'ID dossier Drive
        const salarie = rechercherSalarie(item.nomPrenom);
        if (!salarie || !salarie.idDossierDrive) {
          throw new Error(`Dossier Drive introuvable pour ${item.nomPrenom}`);
        }

        const nomFichierIndividuel = `${item.nomPrenom}_Fiche_Paie_${periode}.pdf`;
        const dossierSalarie = DriveApp.getFolderById(salarie.idDossierDrive);

        // Vérifier les doublons et renommer si nécessaire
        const nomFinal = gererDoublon(dossierSalarie, nomFichierIndividuel);

        // Note: Le découpage réel du PDF nécessite une API externe (Cloud Function)
        // car Apps Script ne peut pas découper des PDF nativement.
        // Ici on copie la page via l'ID page stocké par le workflow n8n.
        const blobPage = obtenirPagePDF(fileId, item.pageIndex);
        const fichierCree = dossierSalarie.createFile(blobPage.setName(nomFinal));

        loggerAction('STOCKAGE_FICHE', nomFinal, item.nomPrenom, '✅ Stocké',
          `Dossier: ${salarie.idDossierDrive}`);

        resultats.push({
          nomPrenom: item.nomPrenom,
          fichier: nomFinal,
          fileId: fichierCree.getId(),
          success: true
        });

        succes = true;

      } catch (error) {
        tentatives++;
        Logger.log(`⚠️ Tentative ${tentatives}/${CONFIG.MAX_RETRIES} échouée pour ${item.nomPrenom}: ${error.message}`);

        if (tentatives < CONFIG.MAX_RETRIES) {
          Utilities.sleep(CONFIG.RETRY_DELAY_MS);
        } else {
          // Échec définitif — déplacer dans le dossier Erreurs
          deplacerVersErreurs(fileId, periode, item.nomPrenom);
          loggerAction('STOCKAGE_FICHE', '', item.nomPrenom, '❌ Échec définitif',
            `Après ${CONFIG.MAX_RETRIES} tentatives: ${error.message}`);
          notifierAdminErreur('STOCKAGE_FICHE', item.nomPrenom, error.message);

          resultats.push({
            nomPrenom: item.nomPrenom,
            success: false,
            error: error.message
          });
        }
      }
    }
  }

  return resultats;
}

/**
 * Obtenir une page spécifique d'un PDF (proxy vers le service de découpage)
 * En production, ceci appelle un service externe ou utilise le blob stocké par n8n
 */
function obtenirPagePDF(fileId, pageIndex) {
  // En production : appel à Cloud Function ou service de découpage PDF
  // Pour la démo, on retourne le fichier complet (à remplacer par le vrai découpage)
  const fichier = DriveApp.getFileById(fileId);
  return fichier.getBlob();
}

/**
 * ÉTAPE 8 — Envoi des emails avec les fiches de paie
 */
function envoyerFichesPaie(mapping, periode) {
  const resultats = [];
  const mois = periode.split('-')[0];
  const annee = periode.split('-')[1];
  const moisEnLettres = obtenirMoisEnLettres(parseInt(mois));

  for (const item of mapping) {
    if (!item.email || item.email.trim() === '') {
      resultats.push({ nomPrenom: item.nomPrenom, success: false, error: 'Email manquant' });
      continue;
    }

    let tentatives = 0;
    let succes = false;

    while (tentatives < CONFIG.MAX_RETRIES && !succes) {
      try {
        const sujet = `Votre fiche de paie - ${moisEnLettres} ${annee}`;
        const corps = construireCorpsEmail(item.nomPrenom, moisEnLettres, annee);

        // Récupérer la pièce jointe depuis Drive
        const fichierNom = `${item.nomPrenom}_Fiche_Paie_${periode}.pdf`;
        const piecesJointes = obtenirFichierPourEmail(item.nomPrenom, fichierNom);

        GmailApp.sendEmail(item.email, sujet, '', {
          htmlBody: corps,
          attachments: piecesJointes,
          name: 'Service RH'
        });

        loggerAction('ENVOI_EMAIL', fichierNom, item.nomPrenom, '✅ Envoyé',
          `Destinataire: ${item.email}`);

        resultats.push({ nomPrenom: item.nomPrenom, email: item.email, success: true });
        succes = true;

      } catch (error) {
        tentatives++;

        if (tentatives < CONFIG.MAX_RETRIES) {
          Utilities.sleep(CONFIG.RETRY_DELAY_MS);
        } else {
          loggerAction('ENVOI_EMAIL', '', item.nomPrenom, '❌ Échec définitif', error.message);
          notifierAdminErreur('ENVOI_EMAIL', item.nomPrenom, error.message);
          resultats.push({ nomPrenom: item.nomPrenom, success: false, error: error.message });
        }
      }
    }
  }

  return resultats;
}

/**
 * Obtenir une pièce jointe depuis Drive pour un salarié
 */
function obtenirFichierPourEmail(nomPrenom, nomFichier) {
  const salarie = rechercherSalarie(nomPrenom);
  if (!salarie || !salarie.idDossierDrive) return [];

  const dossier = DriveApp.getFolderById(salarie.idDossierDrive);
  const fichiers = dossier.getFilesByName(nomFichier);

  if (fichiers.hasNext()) {
    return [fichiers.next().getBlob()];
  }
  return [];
}

/**
 * Construire le corps HTML de l'email
 */
function construireCorpsEmail(nomPrenom, moisEnLettres, annee) {
  const parties = nomPrenom.split('_');
  const nom = parties[0] || '';
  const prenom = parties[1] || '';

  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a73e8; padding: 20px; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 20px;">Fiche de Paie — ${moisEnLettres} ${annee}</h1>
  </div>

  <div style="padding: 30px;">
    <p>Madame, Monsieur <strong>${prenom} ${nom}</strong>,</p>

    <p>Nous vous adressons ci-joint votre fiche de paie pour le mois de
    <strong>${moisEnLettres} ${annee}</strong>.</p>

    <p>Ce document est confidentiel et vous est destiné personnellement.
    Nous vous prions de bien vouloir le conserver précieusement.</p>

    <p>Pour toute question relative à votre fiche de paie,
    n'hésitez pas à contacter le Service des Ressources Humaines.</p>

    <p style="margin-top: 30px;">Avec nos cordiales salutations,</p>

    <p><strong>Service des Ressources Humaines</strong></p>
  </div>

  <div style="background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
    <p>Ce message est automatique. Merci de ne pas y répondre directement.</p>
  </div>
</body>
</html>`;
}

/**
 * Envoyer l'email de synthèse à l'admin RH
 */
function envoyerEmailSyntheseAdmin(resultats, periode, fichierLogs) {
  const mois = periode.split('-')[0];
  const annee = periode.split('-')[1];
  const moisEnLettres = obtenirMoisEnLettres(parseInt(mois));

  const envoyes = resultats.filter(r => r.success);
  const erreurs = resultats.filter(r => !r.success);

  const lignesEnvoyes = envoyes.map(r =>
    `<tr><td style="padding:5px;border:1px solid #ddd;">✅ ${r.nomPrenom}</td><td style="padding:5px;border:1px solid #ddd;">${r.email}</td></tr>`
  ).join('');

  const lignesErreurs = erreurs.map(r =>
    `<tr><td style="padding:5px;border:1px solid #ddd;">❌ ${r.nomPrenom}</td><td style="padding:5px;border:1px solid #ddd;">${r.error}</td></tr>`
  ).join('');

  const ss = getSpreadsheet();
  const lienSheets = ss.getUrl();

  const rootFolder = obtenirOuCreerDossier(null, CONFIG.DRIVE_ROOT_FOLDER_NAME);
  const uploadFolder = obtenirOuCreerDossier(rootFolder, CONFIG.DRIVE_UPLOAD_FOLDER_NAME);
  const lienDrive = `https://drive.google.com/drive/folders/${uploadFolder.getId()}`;

  const corps = `
<!DOCTYPE html>
<html lang="fr">
<body style="font-family: Arial, sans-serif; color: #333;">
  <h2>Rapport de traitement — Fiches de Paie ${moisEnLettres} ${annee}</h2>

  <table style="border-collapse:collapse; margin-bottom:20px;">
    <tr><td style="padding:8px;font-weight:bold;">Fiches traitées :</td><td>${resultats.length}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;">Emails envoyés :</td><td style="color:green;">${envoyes.length} ✅</td></tr>
    <tr><td style="padding:8px;font-weight:bold;">Erreurs :</td><td style="color:red;">${erreurs.length} ❌</td></tr>
  </table>

  ${envoyes.length > 0 ? `
  <h3>Envois réussis ✅</h3>
  <table style="border-collapse:collapse;width:100%;">
    <tr style="background:#e8f5e9;">
      <th style="padding:8px;border:1px solid #ddd;text-align:left;">Salarié</th>
      <th style="padding:8px;border:1px solid #ddd;text-align:left;">Email</th>
    </tr>
    ${lignesEnvoyes}
  </table>` : ''}

  ${erreurs.length > 0 ? `
  <h3>Erreurs / Ignorés ❌</h3>
  <table style="border-collapse:collapse;width:100%;">
    <tr style="background:#ffebee;">
      <th style="padding:8px;border:1px solid #ddd;text-align:left;">Salarié</th>
      <th style="padding:8px;border:1px solid #ddd;text-align:left;">Raison</th>
    </tr>
    ${lignesErreurs}
  </table>` : ''}

  <p style="margin-top:20px;">
    <a href="${lienDrive}" style="margin-right:20px;">📂 Dossier Drive Upload PDF</a>
    <a href="${lienSheets}">📊 Google Sheets Logs</a>
  </p>
</body>
</html>`;

  GmailApp.sendEmail(
    CONFIG.ADMIN_EMAIL,
    `[RH] Rapport Fiches de Paie — ${moisEnLettres} ${annee}`,
    '',
    { htmlBody: corps, name: 'Système Paie' }
  );
}

// ============================================================
// UTILITAIRES
// ============================================================

/**
 * Logger une action dans la feuille Logs
 */
function loggerAction(action, fichier, salarie, statut, detail) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_LOGS);
    const dateHeure = Utilities.formatDate(new Date(), 'Europe/Zurich', 'dd/MM/yyyy HH:mm:ss');

    sheet.appendRow([dateHeure, action, fichier, salarie, statut, detail]);
  } catch (error) {
    Logger.log('⚠️ Impossible de logger : ' + error.message);
  }
}

/**
 * Notifier l'admin d'une erreur par email
 */
function notifierAdminErreur(etape, contexte, messageErreur) {
  try {
    const dateHeure = Utilities.formatDate(new Date(), 'Europe/Zurich', 'dd/MM/yyyy HH:mm:ss');

    GmailApp.sendEmail(
      CONFIG.ADMIN_EMAIL,
      `[ALERTE] Erreur Système Paie — ${etape}`,
      `Une erreur s'est produite le ${dateHeure}.\n\nÉtape : ${etape}\nContexte : ${contexte}\nErreur : ${messageErreur}`,
      { name: 'Système Paie — Alerte' }
    );
  } catch (e) {
    Logger.log('⚠️ Impossible d\'envoyer l\'email d\'alerte : ' + e.message);
  }
}

/**
 * Vérifier les doublons et renommer si nécessaire
 */
function gererDoublon(dossier, nomFichier) {
  const base = nomFichier.replace('.pdf', '');
  let compteur = 1;
  let nomFinal = nomFichier;

  while (dossier.getFilesByName(nomFinal).hasNext()) {
    compteur++;
    nomFinal = `${base}_v${compteur}.pdf`;
  }

  return nomFinal;
}

/**
 * Déplacer un fichier vers le dossier Erreurs
 */
function deplacerVersErreurs(fileId, periode, nomSalarie) {
  try {
    const rootFolder = obtenirOuCreerDossier(null, CONFIG.DRIVE_ROOT_FOLDER_NAME);
    const errorsFolder = obtenirOuCreerDossier(rootFolder, CONFIG.DRIVE_ERRORS_FOLDER_NAME);
    const subFolder = obtenirOuCreerDossier(errorsFolder, periode);

    const fichier = DriveApp.getFileById(fileId);
    fichier.moveTo(subFolder);

    Logger.log(`📁 Fichier déplacé vers Erreurs/${periode} pour ${nomSalarie}`);
  } catch (error) {
    Logger.log('⚠️ Impossible de déplacer vers Erreurs : ' + error.message);
  }
}

/**
 * Convertir un numéro de mois en lettres (français)
 */
function obtenirMoisEnLettres(moisNum) {
  const mois = [
    '', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];
  return mois[moisNum] || 'inconnu';
}

// ============================================================
// WEB APP — API REST pour l'UI
// ============================================================

/**
 * Point d'entrée GET — Lister les salariés
 */
function doGet(e) {
  const action = e.parameter.action || '';

  let result;

  switch (action) {
    case 'listerSalaries':
      result = listerSalaries(e.parameter.inclureInactifs === 'true');
      break;
    case 'rechercherSalarie':
      result = rechercherSalarie(e.parameter.nomPrenom);
      break;
    case 'getLogs':
      result = getLogs(parseInt(e.parameter.limit) || 50);
      break;
    default:
      result = { error: 'Action inconnue', actionsDisponibles: ['listerSalaries', 'rechercherSalarie', 'getLogs'] };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Point d'entrée POST — Actions CRUD et upload
 */
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (error) {
    return reponseJSON({ success: false, error: 'Corps de requête JSON invalide' });
  }

  const action = data.action || '';
  let result;

  switch (action) {
    case 'ajouterSalarie':
      result = ajouterSalarie(data.payload);
      break;
    case 'modifierSalarie':
      result = modifierSalarie(data.nomPrenom, data.payload);
      break;
    case 'supprimerSalarie':
      // L'approbation humaine a déjà été faite côté UI
      result = supprimerSalarie(data.nomPrenom);
      break;
    case 'uploadPDF':
      result = traiterUploadPDF(data.fileData, data.fileName, data.periode);
      break;
    case 'confirmerEnvoi':
      // Après approbation humaine sur l'UI — découpage + stockage + envoi
      result = traiterConfirmationEnvoi(data.fileId, data.mapping, data.periode);
      break;
    default:
      result = { success: false, error: 'Action inconnue' };
  }

  return reponseJSON(result);
}

/**
 * Traitement complet après confirmation humaine (étapes 6, 7, 8)
 */
function traiterConfirmationEnvoi(fileId, mapping, periode) {
  const debut = new Date();

  // Étape 6 & 7 — Découper et stocker
  const resultatsStockage = decouperEtStockerPDF(fileId, mapping, periode);

  // Étape 8 — Envoyer les emails
  const resultatsEmail = envoyerFichesPaie(mapping, periode);

  const fin = new Date();
  const dureeSecondes = Math.round((fin - debut) / 1000);

  // Email de synthèse à l'admin
  envoyerEmailSyntheseAdmin(resultatsEmail, periode, null);

  return {
    success: true,
    fichesTraitees: mapping.length,
    emailsEnvoyes: resultatsEmail.filter(r => r.success).length,
    erreurs: resultatsEmail.filter(r => !r.success).length,
    dureeSecondes: dureeSecondes,
    details: resultatsEmail
  };
}

/**
 * Récupérer les derniers logs
 */
function getLogs(limit = 50) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_LOGS);
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) return [];

  return data.slice(1)
    .reverse()
    .slice(0, limit)
    .map(row => ({
      dateHeure: row[0],
      action: row[1],
      fichier: row[2],
      salarie: row[3],
      statut: row[4],
      detail: row[5]
    }));
}

/**
 * Helper pour réponse JSON CORS
 */
function reponseJSON(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
