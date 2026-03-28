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
  apiGetProfile,
  apiUpdateProfile,
  apiGetDocuments,
  apiCreateDocument,
  apiUpdateDocument,
  apiDeleteDocument,
  isLoggedIn,
} from "../lib/apiClient";
import { secureGet, secureSet } from "./SecureStorage";

export type DocumentCategory =
  | "identity"
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
  name: string;
  avatar?: string;
  bio?: string;
  createdAt: string;
  networkPlan?: "free" | "basic" | "pro";
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

function generateDeviceId(): string {
  const part1 = Date.now().toString(36);
  const part2 = Math.random().toString(36).substring(2, 18);
  const part3 = Math.random().toString(36).substring(2, 18);
  return `${part1}-${part2}-${part3}`;
}

async function getOrCreateDeviceId(): Promise<string> {
  if (Platform.OS === "web") return "web-device-" + Date.now();
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
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
  const syncRef = useRef(false);

  // Load from local cache first (instant load), then sync backend
  useEffect(() => {
    (async () => {
      try {
        const [rawNode, rawDocs] = await Promise.all([
          secureGet(CACHE_KEY_NODE).catch(() => null),
          secureGet(CACHE_KEY_DOCS).catch(() => null),
        ]);
        if (rawNode) setNode(JSON.parse(rawNode));
        if (rawDocs) setDocuments(JSON.parse(rawDocs));
      } catch {
        // ignore cache errors
      } finally {
        setIsLoading(false);
      }

      // After local load, try to sync with backend
      await syncWithBackend();
    })();
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
      const loggedIn = await isLoggedIn();
      if (!loggedIn) {
        setIsOnline(false);
        return;
      }
      const [profile, docs] = await Promise.all([
        apiGetProfile(),
        apiGetDocuments(),
      ]);
      setIsOnline(true);
      const backendNode: IdentityNode = {
        id: profile.id,
        name: profile.name,
        bio: profile.bio,
        createdAt: profile.created_at,
        networkPlan: profile.network_plan,
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
      name: user.name,
      bio: data.bio,
      createdAt: new Date().toISOString(),
      networkPlan: user.network_plan ?? "free",
    };
    await cacheNode(newNode);
    setIsOnline(true);
  }, []);

  const updateNode = useCallback(async (data: Partial<IdentityNode>) => {
    if (!node) return;
    if (isOnline) {
      const updated = await apiUpdateProfile({ name: data.name, bio: data.bio });
      const updatedNode: IdentityNode = {
        ...node,
        name: updated.name ?? node.name,
        bio: updated.bio ?? node.bio,
        networkPlan: updated.network_plan ?? node.networkPlan,
      };
      await cacheNode(updatedNode);
    } else {
      await cacheNode({ ...node, ...data });
    }
  }, [node, isOnline]);

  const addDocument = useCallback(async (doc: Omit<Document, "id" | "createdAt" | "updatedAt">) => {
    if (isOnline) {
      const created = await apiCreateDocument(doc);
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
    } else {
      // Offline fallback — will sync on next connection
      const tempDoc: Document = {
        id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...doc,
      };
      await cacheDocs([tempDoc, ...documents]);
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
    if (isOnline && !id.startsWith("local-")) {
      await apiDeleteDocument(id);
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
