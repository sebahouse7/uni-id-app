import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";

export type Lang = "es" | "en" | "pt";

export const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: "es", label: "Español", flag: "🇦🇷" },
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
];

export const T: Record<Lang, Record<string, string>> = {
  es: {
    // General
    appName: "uni.id",
    companyName: "human.id labs",
    companyTagline: "Infraestructura de identidad digital",
    version: "uni.id v1.0 · © 2026 human.id labs",

    // Onboarding
    onb1Title: "Tu identidad en un solo lugar",
    onb1Sub: "Guardá todos tus documentos de forma segura y accedé a ellos desde cualquier lugar.",
    onb2Title: "Conectada al mundo",
    onb2Sub: "Usá tu identidad en bancos, hospitales, aeropuertos y más.",
    onb3Title: "Protección inteligente",
    onb3Sub: "Tu información está protegida con cifrado de nivel bancario.",
    getStarted: "Comenzar",
    next: "Siguiente",

    // Tabs
    tabHome: "Inicio",
    tabDocs: "Docs",
    tabSecurity: "Seguridad",
    tabNetwork: "Red",
    tabProfile: "Perfil",

    // Home
    welcomeTo: "Bienvenido a",
    myDigitalIdentity: "Tu identidad digital",
    documents: "documentos",
    myDocuments: "Mis documentos",
    recent: "Recientes",
    seeAll: "Ver todos",
    addFirst: "Tocá el + para agregar tu primer documento",
    noDocs: "Sin documentos aún",
    activeProtection: "Protección activa",
    infoSafe: "Tu información está segura",
    connectToNetwork: "Conectate a la red global",
    connectDesc: "Usá tu identidad en bancos, hospitales y más",

    // Identity status
    identityActive: "Identidad activa",
    identityVerified: "Identidad verificada",
    identityCertified: "Identidad certificada",

    // Categories
    catIdentidad: "Identidad",
    catEstudios: "Estudios",
    catSalud: "Salud",
    catLicencia: "Licencia",
    catPropiedades: "Propiedades",
    catMascotas: "Mascotas",
    catOtros: "Otros",

    // Docs
    addDocument: "Agregar documento",
    editDocument: "Editar documento",
    deleteDocument: "Eliminar",
    confirmDelete: "¿Eliminar este documento?",
    confirmDeleteDesc: "Esta acción no se puede deshacer.",
    cancel: "Cancelar",
    delete: "Eliminar",
    save: "Guardar",
    title: "Título",
    notes: "Notas",
    category: "Categoría",
    attachFile: "Adjuntar archivo",
    attachPhoto: "Sacar foto",
    noDocCategory: "No hay documentos en esta categoría",
    doc: "doc",
    docs: "docs",

    // Security
    securityTitle: "Seguridad",
    immuneSystem: "Sistema inmunológico activo",
    immuneDesc: "Tu identidad está protegida en tiempo real",
    threatLevel: "Nivel de amenaza",
    low: "Bajo",
    medium: "Medio",
    high: "Alto",
    activeNodes: "Nodos activos en la red",
    recentActivity: "Actividad reciente",
    encrypted: "Cifrado AES-256",
    encryptedDesc: "Todos tus datos viajan y se almacenan cifrados",
    layers: "Capas de protección",
    layer1: "Tu dispositivo",
    layer2: "Wallet uni.id",
    layer3: "Red de identidad",
    layer4: "Capa de seguridad",
    layer5: "Infraestructura global",
    howItWorks: "Cómo funciona la protección",
    step1: "Se detecta una anomalía",
    step2: "La red aprende el patrón",
    step3: "Se protegen todos los usuarios",
    step4: "La seguridad mejora",

    // Network
    networkTitle: "Conexiones",
    networkSubtitle: "Usá tu identidad digital donde más la necesitás",
    connectedCount: "personas conectadas en la red",
    identityConnected: "Tu identidad está conectada",
    whereToUse: "Dónde podés usarla",
    connectionPlans: "Planes de conexión",
    planActive: "Plan activo",
    activate: "Activar",
    processing: "Procesando...",
    planActivated: "¡Listo!",
    planActivatedDesc: "Tu identidad ya está conectada al plan",
    e2eNote: "Tu identidad está protegida con cifrado de extremo a extremo. Ningún tercero puede acceder a tu información sin tu autorización.",
    mostPopular: "Más popular",
    perMonth: "/mes",
    basicActive: "Conexión Básica activa",
    proActive: "Conexión Pro activa",
    identityEnabledEco: "Tu identidad está habilitada en el ecosistema",

    // Ecosystem
    banks: "Bancos",
    banksDesc: "Abrí cuentas y operá sin papel",
    schools: "Escuelas",
    schoolsDesc: "Inscripciones y legajos digitales",
    hospitals: "Hospitales",
    hospitalsDesc: "Historia clínica unificada",
    airports: "Aeropuertos",
    airportsDesc: "Check-in con tu identidad",
    government: "Gobierno",
    governmentDesc: "Trámites 100% digitales",
    realestate: "Inmobiliarias",
    realestateDesc: "Escrituras y contratos digitales",

    // Profile
    myProfile: "Mi perfil",
    edit: "Editar",
    yourName: "Tu nombre",
    aboutYou: "Algo sobre vos...",
    uniqueId: "ID único",
    memberSince: "Miembro desde",
    plan: "Plan",
    planFree: "Gratuito",
    planBasic: "Conexión Básica",
    planPro: "Conexión Pro",
    accountInfo: "Información de cuenta",
    docsByType: "Mis documentos por tipo",
    categories: "Categorías",
    connection: "Conexión",
    connected: "Activa",
    basic: "Básica",
    expandCoverage: "Ampliar mi cobertura",
    expandDesc: "Usá tu identidad en bancos, hospitales, aeropuertos y más",
    language: "Idioma",
  },

  en: {
    appName: "uni.id",
    companyName: "human.id labs",
    companyTagline: "Digital identity infrastructure",
    version: "uni.id v1.0 · © 2026 human.id labs",

    onb1Title: "Your identity in one place",
    onb1Sub: "Store all your documents securely and access them from anywhere.",
    onb2Title: "Connected to the world",
    onb2Sub: "Use your identity at banks, hospitals, airports and more.",
    onb3Title: "Intelligent protection",
    onb3Sub: "Your information is protected with bank-level encryption.",
    getStarted: "Get started",
    next: "Next",

    tabHome: "Home",
    tabDocs: "Docs",
    tabSecurity: "Security",
    tabNetwork: "Network",
    tabProfile: "Profile",

    welcomeTo: "Welcome to",
    myDigitalIdentity: "Your digital identity",
    documents: "documents",
    myDocuments: "My documents",
    recent: "Recent",
    seeAll: "See all",
    addFirst: "Tap + to add your first document",
    noDocs: "No documents yet",
    activeProtection: "Active protection",
    infoSafe: "Your information is safe",
    connectToNetwork: "Connect to the global network",
    connectDesc: "Use your identity at banks, hospitals and more",

    identityActive: "Active identity",
    identityVerified: "Verified identity",
    identityCertified: "Certified identity",

    catIdentidad: "Identity",
    catEstudios: "Education",
    catSalud: "Health",
    catLicencia: "License",
    catPropiedades: "Properties",
    catMascotas: "Pets",
    catOtros: "Other",

    addDocument: "Add document",
    editDocument: "Edit document",
    deleteDocument: "Delete",
    confirmDelete: "Delete this document?",
    confirmDeleteDesc: "This action cannot be undone.",
    cancel: "Cancel",
    delete: "Delete",
    save: "Save",
    title: "Title",
    notes: "Notes",
    category: "Category",
    attachFile: "Attach file",
    attachPhoto: "Take photo",
    noDocCategory: "No documents in this category",
    doc: "doc",
    docs: "docs",

    securityTitle: "Security",
    immuneSystem: "Active immune system",
    immuneDesc: "Your identity is protected in real time",
    threatLevel: "Threat level",
    low: "Low",
    medium: "Medium",
    high: "High",
    activeNodes: "Active nodes on the network",
    recentActivity: "Recent activity",
    encrypted: "AES-256 Encryption",
    encryptedDesc: "All your data travels and is stored encrypted",
    layers: "Protection layers",
    layer1: "Your device",
    layer2: "uni.id Wallet",
    layer3: "Identity network",
    layer4: "Security layer",
    layer5: "Global infrastructure",
    howItWorks: "How protection works",
    step1: "An anomaly is detected",
    step2: "The network learns the pattern",
    step3: "All users are protected",
    step4: "Security keeps improving",

    networkTitle: "Connections",
    networkSubtitle: "Use your digital identity where you need it most",
    connectedCount: "people connected on the network",
    identityConnected: "Your identity is connected",
    whereToUse: "Where you can use it",
    connectionPlans: "Connection plans",
    planActive: "Active plan",
    activate: "Activate",
    processing: "Processing...",
    planActivated: "Done!",
    planActivatedDesc: "Your identity is now connected to the plan",
    e2eNote: "Your identity is protected with end-to-end encryption. No third party can access your information without your authorization.",
    mostPopular: "Most popular",
    perMonth: "/mo",
    basicActive: "Basic Connection active",
    proActive: "Pro Connection active",
    identityEnabledEco: "Your identity is enabled in the ecosystem",

    banks: "Banks",
    banksDesc: "Open accounts and operate paperlessly",
    schools: "Schools",
    schoolsDesc: "Digital enrollment and records",
    hospitals: "Hospitals",
    hospitalsDesc: "Unified medical history",
    airports: "Airports",
    airportsDesc: "Check-in with your identity",
    government: "Government",
    governmentDesc: "100% digital procedures",
    realestate: "Real estate",
    realestateDesc: "Digital deeds and contracts",

    myProfile: "My profile",
    edit: "Edit",
    yourName: "Your name",
    aboutYou: "Something about you...",
    uniqueId: "Unique ID",
    memberSince: "Member since",
    plan: "Plan",
    planFree: "Free",
    planBasic: "Basic Connection",
    planPro: "Pro Connection",
    accountInfo: "Account information",
    docsByType: "My documents by type",
    categories: "Categories",
    connection: "Connection",
    connected: "Active",
    basic: "Basic",
    expandCoverage: "Expand my coverage",
    expandDesc: "Use your identity at banks, hospitals, airports and more",
    language: "Language",
  },

  pt: {
    appName: "uni.id",
    companyName: "human.id labs",
    companyTagline: "Infraestrutura de identidade digital",
    version: "uni.id v1.0 · © 2026 human.id labs",

    onb1Title: "Sua identidade em um só lugar",
    onb1Sub: "Guarde todos os seus documentos com segurança e acesse-os de qualquer lugar.",
    onb2Title: "Conectada ao mundo",
    onb2Sub: "Use sua identidade em bancos, hospitais, aeroportos e muito mais.",
    onb3Title: "Proteção inteligente",
    onb3Sub: "Suas informações são protegidas com criptografia de nível bancário.",
    getStarted: "Começar",
    next: "Próximo",

    tabHome: "Início",
    tabDocs: "Docs",
    tabSecurity: "Segurança",
    tabNetwork: "Rede",
    tabProfile: "Perfil",

    welcomeTo: "Bem-vindo ao",
    myDigitalIdentity: "Sua identidade digital",
    documents: "documentos",
    myDocuments: "Meus documentos",
    recent: "Recentes",
    seeAll: "Ver todos",
    addFirst: "Toque no + para adicionar seu primeiro documento",
    noDocs: "Sem documentos ainda",
    activeProtection: "Proteção ativa",
    infoSafe: "Suas informações estão seguras",
    connectToNetwork: "Conecte-se à rede global",
    connectDesc: "Use sua identidade em bancos, hospitais e muito mais",

    identityActive: "Identidade ativa",
    identityVerified: "Identidade verificada",
    identityCertified: "Identidade certificada",

    catIdentidad: "Identidade",
    catEstudios: "Educação",
    catSalud: "Saúde",
    catLicencia: "Licença",
    catPropiedades: "Propriedades",
    catMascotas: "Animais",
    catOtros: "Outros",

    addDocument: "Adicionar documento",
    editDocument: "Editar documento",
    deleteDocument: "Excluir",
    confirmDelete: "Excluir este documento?",
    confirmDeleteDesc: "Esta ação não pode ser desfeita.",
    cancel: "Cancelar",
    delete: "Excluir",
    save: "Salvar",
    title: "Título",
    notes: "Notas",
    category: "Categoria",
    attachFile: "Anexar arquivo",
    attachPhoto: "Tirar foto",
    noDocCategory: "Sem documentos nesta categoria",
    doc: "doc",
    docs: "docs",

    securityTitle: "Segurança",
    immuneSystem: "Sistema imunológico ativo",
    immuneDesc: "Sua identidade está protegida em tempo real",
    threatLevel: "Nível de ameaça",
    low: "Baixo",
    medium: "Médio",
    high: "Alto",
    activeNodes: "Nós ativos na rede",
    recentActivity: "Atividade recente",
    encrypted: "Criptografia AES-256",
    encryptedDesc: "Todos os seus dados trafegam e são armazenados criptografados",
    layers: "Camadas de proteção",
    layer1: "Seu dispositivo",
    layer2: "Carteira uni.id",
    layer3: "Rede de identidade",
    layer4: "Camada de segurança",
    layer5: "Infraestrutura global",
    howItWorks: "Como a proteção funciona",
    step1: "Uma anomalia é detectada",
    step2: "A rede aprende o padrão",
    step3: "Todos os usuários são protegidos",
    step4: "A segurança continua melhorando",

    networkTitle: "Conexões",
    networkSubtitle: "Use sua identidade digital onde mais precisa",
    connectedCount: "pessoas conectadas na rede",
    identityConnected: "Sua identidade está conectada",
    whereToUse: "Onde você pode usar",
    connectionPlans: "Planos de conexão",
    planActive: "Plano ativo",
    activate: "Ativar",
    processing: "Processando...",
    planActivated: "Pronto!",
    planActivatedDesc: "Sua identidade já está conectada ao plano",
    e2eNote: "Sua identidade está protegida com criptografia de ponta a ponta. Nenhum terceiro pode acessar suas informações sem sua autorização.",
    mostPopular: "Mais popular",
    perMonth: "/mês",
    basicActive: "Conexão Básica ativa",
    proActive: "Conexão Pro ativa",
    identityEnabledEco: "Sua identidade está habilitada no ecossistema",

    banks: "Bancos",
    banksDesc: "Abra contas e opere sem papel",
    schools: "Escolas",
    schoolsDesc: "Matrículas e registros digitais",
    hospitals: "Hospitais",
    hospitalsDesc: "Histórico médico unificado",
    airports: "Aeroportos",
    airportsDesc: "Check-in com sua identidade",
    government: "Governo",
    governmentDesc: "Trâmites 100% digitais",
    realestate: "Imobiliárias",
    realestateDesc: "Escrituras e contratos digitais",

    myProfile: "Meu perfil",
    edit: "Editar",
    yourName: "Seu nome",
    aboutYou: "Algo sobre você...",
    uniqueId: "ID único",
    memberSince: "Membro desde",
    plan: "Plano",
    planFree: "Gratuito",
    planBasic: "Conexão Básica",
    planPro: "Conexão Pro",
    accountInfo: "Informações da conta",
    docsByType: "Meus documentos por tipo",
    categories: "Categorias",
    connection: "Conexão",
    connected: "Ativa",
    basic: "Básica",
    expandCoverage: "Ampliar minha cobertura",
    expandDesc: "Use sua identidade em bancos, hospitais, aeroportos e mais",
    language: "Idioma",
  },
};

interface LanguageContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Record<string, string>;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "es",
  setLang: () => {},
  t: T.es,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("es");

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem("@uni_lang");
      if (stored && (stored === "es" || stored === "en" || stored === "pt")) {
        setLangState(stored as Lang);
      } else {
        const locale = getLocales()[0]?.languageCode ?? "es";
        if (locale === "pt") setLangState("pt");
        else if (locale === "en") setLangState("en");
        else setLangState("es");
      }
    })();
  }, []);

  const setLang = async (l: Lang) => {
    setLangState(l);
    await AsyncStorage.setItem("@uni_lang", l);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: T[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
