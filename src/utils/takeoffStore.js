// Storage seam for takeoff PDF drawings.
//
// The raw PDF is the ONE piece of takeoff data too big to ride inside the
// project JSON (which auto-syncs to Supabase on every edit). It lives in a
// private Supabase Storage bucket keyed by <owner>/<projectId>.pdf, so any
// teammate who opens the project pulls the same drawing — nothing to
// re-upload. The lightweight takeoff data (markers, page scales) syncs
// through project.takeoff as normal.
//
// A small IndexedDB cache keyed by storage path makes reopening instant and
// gives offline resilience; Supabase remains the source of truth.
//
// Run supabase-takeoff-storage.sql once to create the bucket + RLS policies.

import { supabase } from '../config';

const BUCKET = 'takeoff-pdfs';

// Build the object path for one of a project's drawings. `prefix` is the team
// id for team projects, or the user id for solo projects — it must be the
// FIRST path segment, since that's what the RLS policies check. A project may
// hold several drawings, each keyed by its own docId.
export function takeoffPdfPath(prefix, projectId, docId) {
    return `${prefix}/${projectId}/${docId}.pdf`;
}

// ---- IndexedDB cache (path -> Blob) --------------------------------------

const DB_NAME = 'av-estimator-takeoff';
const STORE = 'pdf-cache';
const VERSION = 1;
let dbPromise = null;

function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') { reject(new Error('no-idb')); return; }
        const req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
}

async function cacheGet(path) {
    try {
        const db = await openDb();
        return await new Promise((resolve, reject) => {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(path);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch { return null; }
}

async function cachePut(path, blob) {
    try {
        const db = await openDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(blob, path);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch { /* cache is best-effort */ }
}

async function cacheDelete(path) {
    try {
        const db = await openDb();
        await new Promise((resolve) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(path);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch { /* ignore */ }
}

// ---- Public API ----------------------------------------------------------

// Upload (or replace) a project's drawing. Also refreshes the local cache.
export async function savePdf(path, blob) {
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { upsert: true, contentType: 'application/pdf' });
    if (error) {
        const msg = error.message || '';
        if (/bucket not found/i.test(msg)) {
            throw new Error('Storage bucket missing — run supabase-takeoff-storage.sql in Supabase');
        }
        if (/maximum allowed size|exceeded|payload too large|413/i.test(msg) || error.status === 413) {
            const mb = (blob.size / (1024 * 1024)).toFixed(1);
            throw new Error(`Drawing is ${mb} MB — over the storage size limit. Raise the bucket limit (re-run supabase-takeoff-storage.sql) and the project-wide upload limit in Supabase → Storage → Settings.`);
        }
        throw error;
    }
    await cachePut(path, blob);
}

// Returns the drawing Blob (from cache when available, else Supabase), or null
// if no drawing has been uploaded for this project yet.
export async function loadPdf(path) {
    const cached = await cacheGet(path);
    if (cached) return cached;
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error) {
        const msg = error.message || '';
        // Missing object → treat as "no drawing yet", not a hard error.
        if (error.status === 404 || error.statusCode === '404' || /not found|does not exist/i.test(msg)) {
            return null;
        }
        throw error;
    }
    if (data) await cachePut(path, data);
    return data || null;
}

export async function deletePdf(path) {
    await cacheDelete(path);
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error && !/not found/i.test(error.message || '')) throw error;
}
