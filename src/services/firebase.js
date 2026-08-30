/**
 * Firestore, when it is configured.
 *
 * EcoBin runs perfectly well without it: every operator-owned record falls back
 * to localStorage, which is where all of them lived until now. Adding Firebase
 * changes one thing — the records stop being private to a single browser tab, so
 * two operators finally see the same fleet, and n8n can drop a dispatch command
 * straight into the page instead of the page having to keep asking for one.
 *
 * The web config below is not a secret. Firebase publishes it on purpose: it
 * names the project rather than authenticating anyone, and it ships in any
 * client bundle. What actually protects the data is Firestore security rules.
 * It still lives in `.env` so the repo does not carry one project's identifiers.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const env = import.meta.env;

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/**
 * Which deployment's records these are.
 *
 * Everything is written under `ecobin/{workspace}/…`, so a demo and a real
 * council can share one Firebase project without one dispatching the other's
 * trucks.
 */
export const WORKSPACE = env.VITE_FIREBASE_WORKSPACE || 'default';

export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

let db = null;
let failure = null;

if (firebaseConfigured) {
  try {
    db = getFirestore(initializeApp(config));
  } catch (error) {
    // A bad config must not take the dashboard down with it. Falling back to
    // localStorage leaves a working single-operator app rather than a blank page.
    failure = error?.message ?? 'Firebase failed to initialise.';
    db = null;
  }
}

export const firestore = db;
export const firebaseError = failure;

/** Where one piece of shared state lives. */
export const docPath = (key) => ['ecobin', WORKSPACE, 'state', key];

/** Where n8n drops dispatch commands. */
export const COMMANDS_PATH = ['ecobin', WORKSPACE, 'commands'];

/**
 * Where the freshest reading per channel lives, one document per bin.
 *
 * ThingSpeak accepts a write every fifteen seconds and is polled besides, so
 * the history path can never be quicker than that. A device that also pushes
 * its latest reading here reaches the screen in about a second; the history,
 * the fill rate and the collection detection still come from ThingSpeak.
 */
export const LIVE_PATH = ['ecobin', WORKSPACE, 'live'];
