import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  apiRegister,
  apiCheckSession,
  apiUpdateProfile,
  apiGetDocuments,
  apiCreateDocument,
  apiUpdateDocument,
  apiDeleteDocument,
} from "../lib/apiClient";
import { secureGet, secureSet, secureDelete } from "./SecureStorage";
import { isVaultUri, parseVaultId, vaultDeleteEntry } from "@/lib/fileVault";

export type DocumentCategory =
  | "identity"
  | "passport"
  | "education"
  | "health"
  | "driving"
  | "property"
  | "pets"
  | "other";

export interface Document {
  id: string;
  title: string;
  category: DocumentCategory;
  description?: string;
  fileUri?: string;
  fileName?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export interface IdentityNode {
  id: string;
  globalId?: string;
  name: string;
  avatar?: string;
  bio?: string;
  createdAt: string;
  networkPlan?: "free" | "basic" | "pro";
}

export interface VerifiableCredential {
  id: string;
  type: "identity" | "document" | "signature";
  issuer: "self" | "network" | "institution";
  subject: string;
  issuedAt: string;
  expiresAt?: string;
  status: "active" | "revoked" | "pending";
  proof?: string;
}

export interface DigitalIdentity {
  userId: string;
  deviceId: string;
  publicKey?: string;
  credentials: VerifiableCredential[];
  trustScore: number;
  connectedNodes: number;
  lastVerified: string;
}

export interface CognitiveNetwork {
  id: string;
  name: string;
  description: string;
  price: number;
  features: string[];
}

const CACHE_KEY_NODE = "uniud_cache_node";
const CACHE_KEY_DOCS = "uniud_cache_docs";
const DEVICE_ID_KEY = "uniud_device_id";
const AVATAR_URI_KEY = "uniud_avatar_uri_v1";

function generateDeviceId(): string {
  const part1 = Date.now().toString(36);
  const part2 = Math.random().toString(36).substring(2, 18);
  const part3 = Math.random().toString(36).substring(2, 18);
  return `${part1}-${part2}-${part3}`;
}

async function getOrCreateDeviceId(): Promise<string> {
  if (Platform.OS === "web") {
    try {
      const stored = typeof localStorage !== "undefined" ? localStorage.getItem(DEVICE_ID_KEY) : null;
      if (stored) return stored;
      const id = generateDeviceId();
      if (typeof localStorage !== "undefined") localStorage.setItem(DEVICE_ID_KEY, id);
      return id;
    } catch {
      return generateDeviceId();
    }
  }
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY).catch(() => null);
  if (!id) {
    id = generateDeviceId();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  }
  return id;
}

interface IdentityContextType {
  node: IdentityNode | null;
  documents: Document[];
  isLoading: boolean;
  isSyncing: boolean;
  isOnline: boolean;
  digitalIdentity: DigitalIdentity | null;
  avatarUri: string | null;
  setAvatarUri: (uri: string | null) => Promise<void>;
  createNode: (data: Omit<IdentityNode, "id" | "createdAt">) => Promise<void>;
  updateNode: (data: Partial<IdentityNode>) => Promise<void>;
  addDocument: (doc: Omit<Document, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateDocument: (id: string, updates: Partial<Document>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  getDocumentsByCategory: (cat: DocumentCategory) => Document[];
  syncWithBackend: () => Promise<void>;
}

const IdentityContext = createContext<IdentityContextType | undefined>(undefined);

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [node, setNode] = useState<IdentityNode | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [avatarUri, setAvatarUriState] = useState<string | null>(null);
  const syncRef = useRef(false);

  const digitalIdentity: DigitalIdentity | null = node
    ? {
        userId: node.id,
        deviceId: deviceId ?? "pending",
        credentials: [
          {
            id: `cred-identity-${node.id}`,
            type: "identity",
            issuer: "self",
            subject: node.name,
            issuedAt: node.createdAt,
            status: "active",
          },
          ...documents.map((d) => ({
            id: `cred-doc-${d.id}`,
            type: "document" as const,
            issuer: "self" as const,
            subject: d.title,
            issuedAt: d.createdAt,
            status: "active" as const,
          })),
        ],
        trustScore: Math.min(
          100,
          30 +
            (documents.length > 0 ? Math.min(30, documents.length * 5) : 0) +
            (node.networkPlan === "basic" ? 20 : node.networkPlan === "pro" ? 40 : 0)
        ),
        connectedNodes: node.networkPlan !== "free" ? 147382 : 0,
        lastVerified: new Date().toISOString(),
      }
    : null;

  // Load from local cache first (instant load), then sync backend
  useEffect(() => {
    (async () => {
      try {
        const [rawNode, rawDocs, dId, savedAvatar] = await Promise.all([
          secureGet(CACHE_KEY_NODE).catch(() => null),
          secureGet(CACHE_KEY_DOCS).catch(() => null),
          getOrCreateDeviceId().catch(() => null),
          secureGet(AVATAR_URI_KEY).catch(() => null),
        ]);
        if (rawNode) setNode(JSON.parse(rawNode));
        if (rawDocs) setDocuments(JSON.parse(rawDocs));
        if (dId) setDeviceId(dId);
        if (savedAvatar) setAvatarUriState(savedAvatar);
      } catch {
        // ignore cache errors
      } finally {
        setIsLoading(false);
      }

      // After local load, try to sync with backend
      await syncWithBackend();
    })();
  }, []);

  const setAvatarUri = useCallback(async (uri: string | null) => {
    setAvatarUriState(uri);
    if (uri) {
      await secureSet(AVATAR_URI_KEY, uri).catch(() => {});
    } else {
      await secureDelete(AVATAR_URI_KEY).catch(() => {});
    }
  }, []);

  const cacheNode = async (n: IdentityNode) => {
    await secureSet(CACHE_KEY_NODE, JSON.stringify(n)).catch(() => {});
    setNode(n);
  };

  const cacheDocs = async (docs: Document[]) => {
    await secureSet(CACHE_KEY_DOCS, JSON.stringify(docs)).catch(() => {});
    setDocuments(docs);
  };

  const syncWithBackend = useCallback(async () => {
    if (syncRef.current) return;
    syncRef.current = true;
    setIsSyncing(true);
    try {
      // Verify session with backend — handles refresh tokens automatically
      const session = await apiCheckSession();

      if (!session.authenticated) {
        // Tokens expired — try silent re-register with same device ID
        // The backend is idempotent: same device_id returns the SAME user with fresh tokens
        try {
          const rawLocalNode = await secureGet(CACHE_KEY_NODE).catch(() => null);
          const localNode: IdentityNode | null = rawLocalNode ? JSON.parse(rawLocalNode) : null;
          const storedDeviceId = await getOrCreateDeviceId();
          const localName = localNode?.name || "Usuario";
          await apiRegister(storedDeviceId, localName, localNode?.bio);
          // Tokens refreshed — retry session check
          const retrySession = await apiCheckSession();
          if (!retrySession.authenticated) throw new Error("Session unrecoverable");
          // Merge recovered session data into local node
          const recovered: IdentityNode = {
            id: retrySession.user.id,
            globalId: retrySession.user.global_id ?? localNode?.globalId ?? undefined,
            name: retrySession.user.name || localNode?.name || "",
            bio: retrySession.user.bio ?? localNode?.bio,
            createdAt: retrySession.user.created_at || localNode?.createdAt || new Date().toISOString(),
            networkPlan: retrySession.user.network_plan ?? localNode?.networkPlan,
          };
          await cacheNode(recovered);
          setIsOnline(true);
          return;
        } catch {
          // Cannot recover session — clear and force new onboarding
          await secureDelete(CACHE_KEY_NODE).catch(() => {});
          await secureDelete(CACHE_KEY_DOCS).catch(() => {});
          setNode(null);
          setDocuments([]);
          setIsOnline(false);
          return;
        }
      }

      // Session valid — sync profile + documents
      const docs = await apiGetDocuments();
      setIsOnline(true);

      // Read current local cache to preserve fields the backend might return as null
      // (e.g. name not yet saved, globalId not assigned yet)
      const rawLocalNode = await secureGet(CACHE_KEY_NODE).catch(() => null);
      const localNode: IdentityNode | null = rawLocalNode ? JSON.parse(rawLocalNode) : null;

      const backendNode: IdentityNode = {
        id: session.user.id,
        // Keep local globalId if backend hasn't assigned one yet
        globalId: session.user.global_id ?? localNode?.globalId ?? undefined,
        // Prefer backend name only if it's non-empty; otherwise keep local name
        name: session.user.name || localNode?.name || "",
        bio: session.user.bio ?? localNode?.bio,
        createdAt: session.user.created_at || localNode?.createdAt || new Date().toISOString(),
        networkPlan: session.user.network_plan ?? localNode?.networkPlan,
      };
      await cacheNode(backendNode);

      const backendDocs: Document[] = docs.map((d: any) => ({
        id: d.id,
        title: d.title,
        category: d.category as DocumentCategory,
        description: d.description ?? undefined,
        fileUri: d.fileUri ?? undefined,
        fileName: d.fileName ?? undefined,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        tags: d.tags ?? [],
      }));
      await cacheDocs(backendDocs);
    } catch {
      // Network error — keep cached data, just mark offline
      setIsOnline(false);
    } finally {
      setIsSyncing(false);
      syncRef.current = false;
    }
  }, []);

  const createNode = useCallback(async (data: Omit<IdentityNode, "id" | "createdAt">) => {
    const deviceId = await getOrCreateDeviceId();
    const { user } = await apiRegister(deviceId, data.name, data.bio);
    const newNode: IdentityNode = {
      id: user.id,
      globalId: user.global_id ?? undefined,
      name: user.name,
      bio: data.bio,
      createdAt: new Date().toISOString(),
      networkPlan: user.network_plan ?? "free",
    };
    await cacheNode(newNode);
    setIsOnline(true);
    // Sync from backend immediately to get full profile data
    setTimeout(() => syncWithBackend(), 500);
  }, [syncWithBackend]);

  const updateNode = useCallback(async (data: Partial<IdentityNode>) => {
    if (!node) return;

    // ── Optimistic local save first — user sees the change immediately ──────────
    const localNode: IdentityNode = { ...node, ...data };
    await cacheNode(localNode);

    // ── Try to sync with backend if online and profile fields changed ───────────
    if (isOnline && (data.name !== undefined || data.bio !== undefined)) {
      try {
        const updated = await apiUpdateProfile({
          name: data.name ?? node.name,
          bio: data.bio !== undefined ? (data.bio ?? null) : node.bio,
        });
        // Update local cache with confirmed backend data
        await cacheNode({
          ...localNode,
          name: updated.name ?? localNode.name,
          bio: updated.bio ?? localNode.bio,
          networkPlan: updated.network_plan ?? localNode.networkPlan,
        });
      } catch {
        // Backend failed — keep the optimistic local update
        // Next successful sync will reconcile
      }
    }
  }, [node, isOnline]);

  const addDocument = useCallback(async (doc: Omit<Document, "id" | "createdAt" | "updatedAt">) => {
    const saveLocally = async () => {
      const tempDoc: Document = {
        id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...doc,
      };
      await cacheDocs([tempDoc, ...documents]);
    };

    if (isOnline) {
      // 12-second timeout for backend save — fall back to local if it takes too long
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Tiempo agotado — documento guardado localmente.")), 12000)
      );
      try {
        const created = await Promise.race([apiCreateDocument(doc), timeoutPromise]);
        const newDoc: Document = {
          id: created.id,
          title: created.title,
          category: created.category,
          description: created.description ?? undefined,
          fileUri: created.fileUri ?? undefined,
          fileName: created.fileName ?? undefined,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
          tags: created.tags ?? [],
        };
        await cacheDocs([newDoc, ...documents]);
      } catch (err: any) {
        // Network error or timeout — save locally so user doesn't lose work
        await saveLocally();
        if (err.message?.includes("agotado")) {
          throw new Error("Sin conexión estable. El documento se guardó en tu dispositivo y se sincronizará cuando vuelvas a estar online.");
        }
        throw err;
      }
    } else {
      await saveLocally();
    }
  }, [documents, isOnline]);

  const updateDocument = useCallback(async (id: string, updates: Partial<Document>) => {
    if (isOnline && !id.startsWith("local-")) {
      await apiUpdateDocument(id, updates);
    }
    const updated = documents.map((d) =>
      d.id === id ? { ...d, ...updates, updatedAt: new Date().toISOString() } : d
    );
    await cacheDocs(updated);
  }, [documents, isOnline]);

  const deleteDocument = useCallback(async (id: string) => {
    const doc = documents.find((d) => d.id === id);
    if (isOnline && !id.startsWith("local-")) {
      await apiDeleteDocument(id);
    }
    if (doc?.fileUri && isVaultUri(doc.fileUri)) {
      const vaultId = parseVaultId(doc.fileUri);
      if (vaultId) vaultDeleteEntry(vaultId).catch(() => {});
    }
    await cacheDocs(documents.filter((d) => d.id !== id));
  }, [documents, isOnline]);

  const getDocumentsByCategory = useCallback(
    (cat: DocumentCategory) => documents.filter((d) => d.category === cat),
    [documents]
  );

  return (
    <IdentityContext.Provider
      value={{
        node,
        documents,
        isLoading,
        isSyncing,
        isOnline,
        digitalIdentity,
        avatarUri,
        setAvatarUri,
        createNode,
        updateNode,
        addDocument,
        updateDocument,
        deleteDocument,
        getDocumentsByCategory,
        syncWithBackend,
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error("useIdentity must be used within IdentityProvider");
  return ctx;
}

export const CATEGORIES: { key: DocumentCategory; label: string; icon: string; sfIcon: string; color: string }[] = [
  { key: "identity",  label: "Identidad",    icon: "credit-card", sfIcon: "creditcard.fill",    color: "#1A6FE8" },
  { key: "passport",  label: "Pasaporte",    icon: "globe",       sfIcon: "globe",              color: "#0891B2" },
  { key: "education", label: "Estudios",      icon: "book",        sfIcon: "graduationcap.fill", color: "#7C3AED" },
  { key: "health",    label: "Salud",         icon: "heart",       sfIcon: "heart.fill",         color: "#E53E3E" },
  { key: "driving",   label: "Licencia",      icon: "truck",       sfIcon: "car.fill",           color: "#D69E2E" },
  { key: "property",  label: "Propiedades",   icon: "home",        sfIcon: "house.fill",         color: "#38A169" },
  { key: "pets",      label: "Mascotas",      icon: "github",      sfIcon: "pawprint.fill",      color: "#DD6B20" },
  { key: "other",     label: "Otros",         icon: "folder",      sfIcon: "folder.fill",        color: "#718096" },
];

export const NETWORK_PLANS: CognitiveNetwork[] = [
  {
    id: "basic",
    name: "Conexión Básica",
    description: "Conectate a la red de identidad y validá tus documentos",
    price: 4.99,
    features: [
      "Verificación de documentos",
      "Backup cifrado en la nube",
      "Acceso desde múltiples dispositivos",
      "Soporte básico",
    ],
  },
  {
    id: "pro",
    name: "Conexión Pro",
    description: "Acceso completo a la red global de identidad digital",
    price: 12.99,
    features: [
      "Verificación biométrica avanzada",
      "Firma digital certificada",
      "Identidad en múltiples países",
      "Acceso para instituciones",
      "Soporte 24/7 prioritario",
    ],
  },
];
