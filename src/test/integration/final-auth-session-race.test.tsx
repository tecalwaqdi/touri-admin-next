import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const firebase = vi.hoisted(() => ({ listener: null as null | ((user: unknown) => void) }));
vi.mock("@/lib/clientAppEnv", () => ({ isClientBearerAuthRequired: () => true }));
vi.mock("@/infrastructure/auth/firebaseClient", () => ({ getFirebaseAuth: () => ({}), isFirebaseClientConfigured: () => true }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_: unknown, callback: (user: unknown) => void) => { firebase.listener = callback; return vi.fn(); }, signInWithEmailAndPassword: vi.fn(), signOut: vi.fn() }));
import { AuthProvider, useAuth } from "@/auth/AuthContext";
function Session() { const { session } = useAuth(); return <p>{session.state}</p>; }
describe("Firebase session resolution race", () => {
  it("a delayed authorization response cannot restore a signed-out user", async () => {
    let respond!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
    render(<AuthProvider><Session /></AuthProvider>);
    await act(async () => { firebase.listener?.({ getIdToken: async () => "test-token" }); });
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await act(async () => { firebase.listener?.(null); });
    expect(screen.getByText("unauthenticated")).toBeInTheDocument();
    await act(async () => { respond(Response.json({ user: { id: "old-user", status: "active" } })); });
    expect(screen.getByText("unauthenticated")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
