import { secureGet, secureSet } from "./SecureStorage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

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

const STORAGE_KEY_NODE = "uniud_identity_node";
const STORAGE_KEY_DOCS = "uniud_documents";

interface IdentityContextType {
  node: IdentityNode | null;
  documents: Document[];
  isLoading: boolean;
  createNode: (data: Omit<IdentityNode, "id" | "createdAt">) => Promise<void>;
  updateNode: (data: Partial<IdentityNode>) => Promise<void>;
  addDocument: (doc: Omit<Document, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateDocument: (id: string, updates: Partial<Document>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  getDocumentsByCategory: (cat: DocumentCategory) => Document[];
}

const IdentityContext = createContext<IdentityContextType | undefined>(undefined);

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [node, setNode] = useState<IdentityNode | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [rawNode, rawDocs] = await Promise.all([
          secureGet(STORAGE_KEY_NODE),
          secureGet(STORAGE_KEY_DOCS),
        ]);
        if (rawNode) setNode(JSON.parse(rawNode));
        if (rawDocs) setDocuments(JSON.parse(rawDocs));
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const saveNode = async (n: IdentityNode) => {
    await secureSet(STORAGE_KEY_NODE, JSON.stringify(n));
    setNode(n);
  };

  const saveDocs = async (docs: Document[]) => {
    await secureSet(STORAGE_KEY_DOCS, JSON.stringify(docs));
    setDocuments(docs);
  };

  const createNode = useCallback(async (data: Omit<IdentityNode, "id" | "createdAt">) => {
    const newNode: IdentityNode = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      ...data,
    };
    await saveNode(newNode);
  }, []);

  const updateNode = useCallback(async (data: Partial<IdentityNode>) => {
    if (!node) return;
    const updated = { ...node, ...data };
    await saveNode(updated);
  }, [node]);

  const addDocument = useCallback(async (doc: Omit<Document, "id" | "createdAt" | "updatedAt">) => {
    const newDoc: Document = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...doc,
    };
    const updated = [...documents, newDoc];
    await saveDocs(updated);
  }, [documents]);

  const updateDocument = useCallback(async (id: string, updates: Partial<Document>) => {
    const updated = documents.map((d) =>
      d.id === id ? { ...d, ...updates, updatedAt: new Date().toISOString() } : d
    );
    await saveDocs(updated);
  }, [documents]);

  const deleteDocument = useCallback(async (id: string) => {
    const updated = documents.filter((d) => d.id !== id);
    await saveDocs(updated);
  }, [documents]);

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
        createNode,
        updateNode,
        addDocument,
        updateDocument,
        deleteDocument,
        getDocumentsByCategory,
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
  { key: "identity", label: "Identidad", icon: "credit-card", sfIcon: "creditcard.fill", color: "#1A6FE8" },
  { key: "education", label: "Estudios", icon: "book", sfIcon: "graduationcap.fill", color: "#7C3AED" },
  { key: "health", label: "Salud", icon: "heart", sfIcon: "heart.fill", color: "#E53E3E" },
  { key: "driving", label: "Licencia", icon: "truck", sfIcon: "car.fill", color: "#D69E2E" },
  { key: "property", label: "Propiedades", icon: "home", sfIcon: "house.fill", color: "#38A169" },
  { key: "pets", label: "Mascotas", icon: "github", sfIcon: "pawprint.fill", color: "#DD6B20" },
  { key: "other", label: "Otros", icon: "folder", sfIcon: "folder.fill", color: "#718096" },
];

export const NETWORK_PLANS: CognitiveNetwork[] = [
  {
    id: "basic",
    name: "Red Básica",
    description: "Conectate a la red cognitiva de identidad y validá tus documentos",
    price: 4.99,
    features: [
      "Verificación de documentos",
      "Red de 10 nodos",
      "Backup seguro en la nube",
      "Soporte básico",
    ],
  },
  {
    id: "pro",
    name: "Red Pro",
    description: "Acceso completo a la red cognitiva distribuida de identidad global",
    price: 12.99,
    features: [
      "Verificación avanzada biométrica",
      "Red ilimitada de nodos",
      "Firma digital certificada",
      "Identidad en múltiples países",
      "Soporte 24/7 prioritario",
    ],
  },
];
