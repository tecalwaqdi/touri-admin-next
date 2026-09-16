import type { MappedAuthIdentity } from "@/domain/auth/ProductionAuthDesign";
import { currentPanelPersonaMatches } from "@/domain/auth/CurrentPanelPersona";
import { createWifNativeFirestoreRead } from "@/infrastructure/production/firestore/createWifNativeFirestoreReadTransport";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
let readClient: Promise<FirestoreReadClient> | null = null;
let clientProject: string | null = null;
export async function verifyCurrentPanelPersona(identity: MappedAuthIdentity, projectId: string): Promise<boolean> {
  if (!identity.uid || identity.uid.includes("/")) return false;
  if (!readClient || clientProject !== projectId) {
    clientProject = projectId;
    readClient = createWifNativeFirestoreRead({ projectId, requireWif: true }).then(r => r.client).catch(e => { readClient = null; throw e; });
  }
  const doc = await (await readClient).getDocument("user", identity.uid);
  return currentPanelPersonaMatches(identity, doc.exists ? doc.data : null);
}
