import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getNodeStatus } from "@/lib/api";

export default function Landing() {
  const [, navigate] = useLocation();
  const [nodeRunning, setNodeRunning] = useState<boolean | null>(null);

  useEffect(() => {
    getNodeStatus()
      .then((s) => setNodeRunning(s.autonomous_node.running))
      .catch(() => setNodeRunning(null));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-bold text-sm">
            u
          </div>
          <span className="font-semibold text-lg tracking-tight">uni.id</span>
        </div>
        <div className="flex items-center gap-3">
          {nodeRunning !== null && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <span
                className={`w-2 h-2 rounded-full ${nodeRunning ? "bg-green-400 animate-pulse" : "bg-red-400"}`}
              />
              {nodeRunning ? "Red activa" : "Red offline"}
            </span>
          )}
          <button
            onClick={() => navigate("/app")}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
          >
            Probar ahora
          </button>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-6">
        <div className="pt-24 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950 border border-blue-800 text-blue-300 text-xs mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Nodo autónomo activo
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight mb-6">
            Verificación sin
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
              {" "}confianza central
            </span>
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Validá la autenticidad de documentos con consenso criptográfico
            distribuido. Sin intermediarios. Sin servidores centrales de confianza.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate("/app")}
              className="px-8 py-3.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold text-lg transition-all hover:scale-105 active:scale-95"
            >
              Verificar un documento
            </button>
            <a
              href="https://expressjs-production-8bfc.up.railway.app/api/verify/node/status"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-lg transition-colors"
            >
              Ver API
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-20">
          {[
            { label: "Seguridad", value: "Ed25519", sub: "Firma criptográfica" },
            { label: "Consenso", value: "≥ 3 nodos", sub: "Para validar" },
            { label: "Anti-replay", value: "Nonce + timestamp", sub: "Doble protección" },
            { label: "Loop", value: "30 s", sub: "Ciclo del nodo" },
          ].map((s) => (
            <div
              key={s.label}
              className="p-4 bg-white/5 border border-white/10 rounded-xl text-center"
            >
              <div className="text-sm text-gray-400 mb-1">{s.label}</div>
              <div className="font-bold text-white">{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* How it works */}
        <section className="mb-24">
          <h2 className="text-3xl font-bold text-center mb-12">
            Cómo funciona
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                icon: "📂",
                title: "Subís el documento",
                desc: "El archivo se procesa localmente. Nunca sube a ningún servidor.",
              },
              {
                step: "02",
                icon: "🔐",
                title: "Se genera el hash",
                desc: "SHA-256 criptográfico — huella digital única e irreversible del documento.",
              },
              {
                step: "03",
                icon: "🌐",
                title: "La red vota",
                desc: "Nodos distribuidos evalúan el hash. Consenso ponderado por reputación y stake.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="relative p-6 bg-white/5 border border-white/10 rounded-2xl"
              >
                <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
                  {item.step}
                </div>
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Protocol highlight */}
        <section className="mb-24">
          <div className="bg-gradient-to-br from-blue-950/60 to-purple-950/40 border border-blue-800/40 rounded-2xl p-8">
            <div className="max-w-3xl">
              <h2 className="text-2xl font-bold mb-4">Protocolo completo</h2>
              <ul className="space-y-2 text-gray-300 text-sm">
                {[
                  "Identidad DID-based: did:uniid:<uuid> — portátil y sin custodio",
                  "Trust Graph: reputación ponderada por endorsements entre nodos",
                  "Stake económico: peso de voto = base × (1 + ln(stake + 1))",
                  "Anti-colisión: detección de clusters sospechosos en < 5 s",
                  "TSA (Time Stamping Authority) + Merkle anchors para documentos",
                  "Nonce de un solo uso + ventana ±60 s para cada voto",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10 py-8 flex items-center justify-between text-sm text-gray-500">
          <div>© 2026 human.id labs S.A.S. — Sebastián Maximiliano Monteleón</div>
          <div>uni.id Light Consensus</div>
        </footer>
      </main>
    </div>
  );
}
