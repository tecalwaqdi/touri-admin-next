"use client";

import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
};

/**
 * Browser-visible Firebase public env.
 * Direct static process.env.NEXT_PUBLIC_* refs are required for Next.js client inlining.
 */
function readFirebasePublicEnvFromProcess(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  };
}

/** Reads public Firebase web config from NEXT_PUBLIC_FIREBASE_* only. */
export function readFirebaseWebConfigFromEnv(
  env?: Record<string, string | undefined>,
): FirebaseWebConfig | null {
  const source = env ?? readFirebasePublicEnvFromProcess();
  const apiKey = source.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  const authDomain = source.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = source.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const appId = source.NEXT_PUBLIC_FIREBASE_APP_ID?.trim();
  if (!apiKey || !authDomain || !projectId || !appId) return null;

  const storageBucket = source.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  const messagingSenderId = source.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim();

  const config: FirebaseOptions = { apiKey, authDomain, projectId, appId };
  if (storageBucket) config.storageBucket = storageBucket;
  if (messagingSenderId) config.messagingSenderId = messagingSenderId;
  return config as FirebaseWebConfig;
}

export function isFirebaseClientConfigured(
  env?: Record<string, string | undefined>,
): boolean {
  return readFirebaseWebConfigFromEnv(env) !== null;
}

/** Browser singleton — lazy init on first use. */
export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  const config = readFirebaseWebConfigFromEnv();
  if (!config) {
    throw new Error(
      "Firebase client is not configured (set NEXT_PUBLIC_FIREBASE_* in the deployment environment)",
    );
  }
  app = getApps().length > 0 ? getApps()[0]! : initializeApp(config);
  auth = getAuth(app);
  return auth;
}

/** Test-only reset of module singletons. */
export function resetFirebaseClientForTests(): void {
  app = null;
  auth = null;
}
