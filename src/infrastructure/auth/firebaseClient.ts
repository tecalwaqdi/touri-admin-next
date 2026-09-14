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

/** Reads public Firebase web config from NEXT_PUBLIC_FIREBASE_* only. */
export function readFirebaseWebConfigFromEnv(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): FirebaseWebConfig | null {
  const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  const authDomain = env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const appId = env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim();
  if (!apiKey || !authDomain || !projectId || !appId) return null;

  const storageBucket = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  const messagingSenderId = env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim();

  const config: FirebaseOptions = { apiKey, authDomain, projectId, appId };
  if (storageBucket) config.storageBucket = storageBucket;
  if (messagingSenderId) config.messagingSenderId = messagingSenderId;
  return config as FirebaseWebConfig;
}

export function isFirebaseClientConfigured(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
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
