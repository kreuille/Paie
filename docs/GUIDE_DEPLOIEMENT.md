# Guide de Déploiement — Gestionnaire de Feuilles de Paie

## Architecture

```
UI Web (GitHub Pages)
        ↕ HTTPS / JSON
Workflow n8n (orchestration)
        ↕ HTTPS / JSON
Google Apps Script (backend)
        ↕ API Drive / Sheets / Gmail
Google Drive + Google Sheets + Gmail
```

---

## ÉTAPE 1 — Google Sheets

### Créer le fichier Sheets

1. Ouvrir [Google Sheets](https://sheets.google.com)
2. Créer un nouveau fichier : **"Gestionnaire Paie — Base Salariés"**
3. Copier l'**ID** depuis l'URL : `https://docs.google.com/spreadsheets/d/**SPREADSHEET_ID**/edit`

### Initialiser les feuilles via Apps Script

1. Dans le fichier Sheets → **Extensions → Apps Script**
2. Copier tout le contenu de `apps-script/Code.gs`
3. Modifier la ligne `ADMIN_EMAIL` avec l'email RH admin
4. Lancer `initialiserApplication()` via **Exécuter**
5. Autoriser les permissions demandées

Résultat attendu :
- Feuille **"Salariés"** avec 8 colonnes et en-têtes bleus
- Feuille **"Logs"** avec 6 colonnes et en-têtes verts

---

## ÉTAPE 2 — Google Drive

Structure créée automatiquement par `initialiserApplication()` :

```
📁 Fiches de Paie/
├── 📁 Salariés/
│   ├── 📁 DUPONT_Jean/         ← créé à l'ajout du salarié
│   └── 📁 MARTIN_Sophie/
├── 📁 Upload PDF/              ← PDF global uploadé ici
└── 📁 Erreurs/
    └── 📁 03-2025/             ← fichiers en erreur
```

> **Note** : Ne jamais supprimer ces dossiers manuellement.

---

## ÉTAPE 3 — Déployer le WebApp Google Apps Script

1. Dans l'éditeur Apps Script → **Déployer → Nouveau déploiement**
2. Type : **Application Web**
3. Paramètres :
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde** (ou votre organisation)
4. Cliquer **Déployer** et copier l'URL générée

```
https://script.google.com/macros/s/VOTRE_ID_DEPLOIEMENT/exec
```

> ⚠️ Gardez cette URL confidentielle. Elle donne accès à votre Apps Script.

---

## ÉTAPE 4 — GitHub Pages (UI Web)

### Déployer l'interface

1. Créer un dépôt GitHub public (ou utiliser ce dépôt)
2. Pousser les fichiers : `index.html`, `style.css`, `app.js`
3. Dans le dépôt → **Settings → Pages**
4. Source : **Branch: main** → **/ (root)**
5. Sauvegarder → l'URL GitHub Pages est générée

```
https://votre-org.github.io/gestionnaire-paie/
```

### Configurer l'URL Apps Script dans l'UI

Au premier chargement, un panneau de configuration apparaît.
Saisir l'URL Apps Script du déploiement (étape 3).

L'URL est sauvegardée dans `localStorage` du navigateur.

---

## ÉTAPE 5 — n8n (Orchestration)

### Pré-requis
- Instance n8n (cloud ou self-hosted)
- Version n8n ≥ 1.0.0

### Importer le workflow

1. Dans n8n → **Workflows → Import from file**
2. Sélectionner `n8n/workflow.json`
3. Activer le workflow

### Configurer les Webhooks

Après activation, noter les URLs des webhooks n8n :

| Webhook | URL |
|---------|-----|
| Réception PDF | `https://votre-n8n.com/webhook/paie-upload` |
| Confirmation envoi | `https://votre-n8n.com/webhook/paie-confirmer` |

### Connecter l'UI au workflow n8n

Dans `app.js`, modifier les appels `apiPost` pour pointer vers n8n :
- Pour l'upload PDF : utiliser `https://votre-n8n.com/webhook/paie-upload`
- Pour la confirmation : utiliser `https://votre-n8n.com/webhook/paie-confirmer`

### Module pdf-parse (extraction texte PDF)

Pour l'extraction de texte des PDF dans n8n :

**Option A — n8n Community Nodes**
```bash
# Dans le conteneur n8n
npm install pdf-parse
```

**Option B — Google Cloud Document AI**
1. Activer l'API Document AI dans Google Cloud
2. Créer des credentials dans n8n
3. Modifier le nœud "Extraire le texte du PDF" pour utiliser l'API

---

## ÉTAPE 6 — Variables à personnaliser

### Dans `apps-script/Code.gs`
```javascript
ADMIN_EMAIL: 'admin@votre-entreprise.ch',  // ← Email RH admin
```

### Dans `app.js`
```javascript
// L'URL Apps Script est saisie via l'interface (localStorage)
// Pas de modification de code nécessaire
```

---

## Structure Google Sheets — Colonnes

### Feuille "Salariés"
| Colonne | Type | Exemple |
|---------|------|---------|
| ID | Texte | SAL_20250315143022 |
| NOM | Texte (majuscules) | DUPONT |
| Prenom | Texte | Jean |
| NOM_Prenom | Texte | DUPONT_Jean |
| Email | Email | jean.dupont@ent.ch |
| Date_Entrée | Date | 2024-01-15 |
| Statut | Actif/Inactif | Actif |
| ID_Dossier_Drive | Texte | 1BxiMVs0XRA... |

### Feuille "Logs"
| Colonne | Type | Exemple |
|---------|------|---------|
| Date_Heure | Datetime | 15/03/2025 14:30:22 |
| Action | Texte | UPLOAD_PDF |
| Fichier | Texte | Fiche_Paie_03-2025_... |
| Salarié | Texte | DUPONT_Jean |
| Statut | Texte | ✅ Reçu |
| Détail_Erreur | Texte | Dossier Drive: 1Bx... |

---

## Flux de traitement PDF

```
[UI Web] Sélection PDF + Période
        ↓
[n8n] Réception + Validation
        ↓
[GAS] Stockage Drive "Upload PDF"
        ↓
[n8n] Extraction texte pages PDF
        ↓
[n8n] Matching NOM_Prenom ↔ Sheets
        ↓ ── Si non trouvé → [UI] Alerte → Attente humaine
        ↓ ── Si email manquant → [UI] Alerte → Attente humaine
        ↓
[UI] Récapitulatif + CONFIRMATION HUMAINE obligatoire
        ↓
[GAS] Découpage PDF (1 page = 1 fichier)
        ↓
[GAS] Stockage dans dossiers salariés
        ↓
[GAS] Envoi emails (pièce jointe PDF)
        ↓
[GAS] Email synthèse admin RH
        ↓
[UI] Résultat final affiché
```

---

## Gestion des erreurs

| Situation | Comportement |
|-----------|-------------|
| PDF corrompu | Alerte UI → décision humaine |
| Salarié non trouvé | Alerte UI → Ignorer / Créer / Stopper |
| Email manquant | Alerte UI → Saisie email ou Ignorer |
| Erreur API | 3 tentatives (10s d'intervalle) |
| Échec définitif | Déplacement vers Drive/Erreurs/MM-YYYY/ |
| Toute erreur | Log Sheets + Email admin immédiat |

---

## Règles absolues

1. **Jamais d'email sans approbation humaine**
2. **Jamais de suppression de fichier Drive** (déplacer uniquement)
3. **Jamais d'écrasement** → renommage _v2, _v3
4. **Toujours logger** chaque action
5. **Format date** : MM-YYYY strictement
6. **Format dossier** : NOM_Prenom strictement
