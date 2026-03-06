#!/usr/bin/env node
/**
 * deploy-n8n.js — Déploie automatiquement le workflow n8n via l'API REST
 *
 * Usage : node scripts/deploy-n8n.js
 *   ou  : npm run deploy:n8n
 *
 * Variables d'environnement requises (dans .env ou dans le shell) :
 *   N8N_URL     — URL de base de l'API, ex: https://n8n.guedou.com/api/v1
 *   N8N_API_KEY — Clé API générée dans n8n → Settings → API
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── 1. Charger le fichier .env (facultatif) ───────────────────────────────────
function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env absent — les variables doivent venir du shell
  }
}

// ── 2. Valider la configuration ───────────────────────────────────────────────
function validateConfig() {
  const url = process.env.N8N_URL;
  const key = process.env.N8N_API_KEY;
  if (!url || !key) {
    console.error('❌  Variables manquantes :');
    if (!url) console.error('   N8N_URL      — ex: https://n8n.guedou.com/api/v1');
    if (!key) console.error('   N8N_API_KEY  — clé API n8n (Settings → API → Create an API key)');
    console.error('\n   Créez un fichier .env à partir de .env.example et remplissez-le.');
    process.exit(1);
  }
  return { baseUrl: url.replace(/\/$/, ''), headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' } };
}

// ── 3. Lire le workflow.json ──────────────────────────────────────────────────
function readWorkflow() {
  const wfPath = path.join(__dirname, '..', 'n8n', 'workflow.json');
  try {
    return JSON.parse(fs.readFileSync(wfPath, 'utf8'));
  } catch (e) {
    console.error('❌  Impossible de lire n8n/workflow.json :', e.message);
    process.exit(1);
  }
}

// ── Helper : fetch avec timeout 30s ──────────────────────────────────────────
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── 4. Chercher le workflow par nom ───────────────────────────────────────────
async function findWorkflow(baseUrl, headers, name) {
  const res = await fetchWithTimeout(`${baseUrl}/workflows?limit=250`, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET /workflows a échoué (HTTP ${res.status}) : ${body.substring(0, 300)}`);
  }
  const json = await res.json();
  const list = Array.isArray(json) ? json : (json.data || []);
  return list.find(w => w.name === name) ?? null;
}

// ── 5. Créer ou mettre à jour le workflow ─────────────────────────────────────
async function createOrUpdateWorkflow(baseUrl, headers, workflow, existingId) {
  if (existingId) {
    // Mise à jour — inclure l'id dans le corps pour éviter les rejets
    const body = JSON.stringify({ ...workflow, id: existingId });
    const res = await fetchWithTimeout(`${baseUrl}/workflows/${existingId}`, {
      method: 'PUT', headers, body
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`PUT /workflows/${existingId} a échoué (HTTP ${res.status}) : ${err.substring(0, 300)}`);
    }
    return res.json();
  } else {
    // Création
    const res = await fetchWithTimeout(`${baseUrl}/workflows`, {
      method: 'POST', headers, body: JSON.stringify(workflow)
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`POST /workflows a échoué (HTTP ${res.status}) : ${err.substring(0, 300)}`);
    }
    return res.json();
  }
}

// ── 6. Activer le workflow ────────────────────────────────────────────────────
async function activateWorkflow(baseUrl, headers, id) {
  const res = await fetchWithTimeout(`${baseUrl}/workflows/${id}/activate`, {
    method: 'POST', headers
  });
  // 200 = activé, 400 "already active" = OK aussi
  if (!res.ok && res.status !== 400) {
    const err = await res.text();
    throw new Error(`POST /workflows/${id}/activate a échoué (HTTP ${res.status}) : ${err.substring(0, 300)}`);
  }
}

// ── 7. Main ───────────────────────────────────────────────────────────────────
async function main() {
  loadDotEnv();
  const { baseUrl, headers } = validateConfig();
  const workflow = readWorkflow();

  console.log(`\n🚀  Déploiement du workflow "${workflow.name}"...`);
  console.log(`    API : ${baseUrl}`);

  // Rechercher un workflow existant avec le même nom
  console.log('    Recherche du workflow dans n8n...');
  const existing = await findWorkflow(baseUrl, headers, workflow.name);

  let result;
  if (existing) {
    console.log(`    Workflow trouvé (ID: ${existing.id}) — mise à jour en cours...`);
    result = await createOrUpdateWorkflow(baseUrl, headers, workflow, existing.id);
    console.log(`✅  Workflow mis à jour (ID: ${result.id || existing.id})`);
  } else {
    console.log('    Workflow non trouvé — création en cours...');
    result = await createOrUpdateWorkflow(baseUrl, headers, workflow, null);
    console.log(`✅  Workflow créé (ID: ${result.id})`);
  }

  const workflowId = result.id || existing?.id;

  // Activation
  console.log('    Activation du workflow...');
  await activateWorkflow(baseUrl, headers, workflowId);
  console.log('✅  Workflow activé\n');
}

main().catch(err => {
  console.error('\n❌  Erreur lors du déploiement :', err.message);
  process.exit(1);
});
