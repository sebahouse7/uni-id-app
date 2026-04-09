import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  hashFile,
  submitDocument,
  getVerificationStatus,
  getNodeStatus,
  type VerificationStatus,
  type NodeStatus,
} from "@/lib/api";

type Phase = "idle" | "hashing" | "submitting" | "polling" | "done" | "error";

const SECURITY_COLORS: Record<string, string> = {
  high:   "text-green-400 bg-green-400/10 border-green-400/30",
  medium: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  low:    "text-orange-400 bg-orange-400/10 border-orange-400/30",
  none:   "text-gray-400 bg-gray-400/10 border-gray-400/30",
};

const RESULT_COLORS: Record<string, string> = {
  valid:   "text-green-400 border-green-400/30 bg-green-400/5",
  invalid: "text-red-400 border-red-400/30 bg-red-400/5",
  partial: "text-yellow-400 border-yellow-400/30 bg-yellow-400/5",
  pending: "text-gray-400 border-gray-400/20 bg-gray-400/5",
};

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [phase, setPhase]           = useState<Phase>("idle");
  const [fileInfo, setFileInfo]     = useState<{ name: string; size: number } | null>(null);
  const [hash, setHash]             = useState<string>("");
  const [result, setResult]         = useState<VerificationStatus | null>(null);
  const [nodeStatus, setNodeStatus] = useState<NodeStatus | null>(null);
  const [error, setError]           = useState<string>("");
  const [pollCount, setPollCount]   = useState(0);
  const pollRef                     = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropRef                     = useRef<HTMLDivElement>(null);

  // Load node status once
  useEffect(() => {
    getNodeStatus()
      .then(setNodeStatus)
      .catch(() => {});
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPolling = useCallback(
    (h: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const status = await getVerificationStatus(h);
          setResult(status);
          setPollCount((c) => c + 1);
          if (status.consensus_result !== "pending" && status.votes.total >= 1) {
            setPhase("done");
            stopPolling();
          }
        } catch {/* continue polling */}
      }, 5_000);
    },
    [stopPolling]
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  const handleFile = useCallback(
    async (file: File) => {
      setError("");
      setResult(null);
      setPollCount(0);
      setFileInfo({ name: file.name, size: file.size });

      // 1. Hash
      setPhase("hashing");
      let h: string;
      try {
        h = await hashFile(file);
        setHash(h);
      } catch {
        setError("No se pudo calcular el hash del archivo.");
        setPhase("error");
        return;
      }

      // 2. Submit
      setPhase("submitting");
      try {
        await submitDocument(h);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Error desconocido";
        if (!msg.toLowerCase().includes("ya registrado") && !msg.toLowerCase().includes("already")) {
          setError(msg);
          setPhase("error");
          return;
        }
      }

      // 3. Poll
      setPhase("polling");
      startPolling(h);
    },
    [startPolling]
  );

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const reset = () => {
    stopPolling();
    setPhase("idle");
    setHash("");
    setResult(null);
    setFileInfo(null);
    setError("");
    setPollCount(0);
  };

  const fmtSize = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10 max-w-5xl mx-auto">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-bold text-sm">
            u
          </div>
          <span className="font-semibold text-lg tracking-tight">uni.id</span>
        </button>

        {nodeStatus && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span
              className={`w-2 h-2 rounded-full ${
                nodeStatus.autonomous_node.running
                  ? "bg-green-400 animate-pulse"
                  : "bg-red-400"
              }`}
            />
            {nodeStatus.autonomous_node.running
              ? `Nodo activo · agresividad ${nodeStatus.autonomous_node.aggressiveness.toFixed(2)}`
              : "Nodo offline"}
          </div>
        )}
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Verificar documento</h1>
          <p className="text-gray-400">
            El archivo se procesa localmente. Solo el hash SHA-256 se envía a la red.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-8">
          {/* Upload panel */}
          <div className="lg:col-span-2 space-y-4">
            <div
              ref={dropRef}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-white/20 hover:border-blue-500/50 rounded-2xl p-8 text-center transition-colors cursor-pointer group"
              onClick={() => document.getElementById("fileInput")?.click()}
            >
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">📂</div>
              <p className="font-medium mb-1">
                {phase === "idle" ? "Arrastrá o hacé click" : "Seleccionar otro"}
              </p>
              <p className="text-sm text-gray-500">PDF, imagen, cualquier archivo</p>
              <input
                id="fileInput"
                type="file"
                className="hidden"
                onChange={onFileInputChange}
              />
            </div>

            {fileInfo && (
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{fileInfo.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{fmtSize(fileInfo.size)}</p>
                  </div>
                  <button
                    onClick={reset}
                    className="text-gray-500 hover:text-white text-xs shrink-0 mt-0.5"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            )}

            {hash && (
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                <p className="text-xs text-gray-400 mb-2 font-medium">SHA-256</p>
                <p className="font-mono text-xs text-blue-300 break-all leading-relaxed">
                  {hash}
                </p>
              </div>
            )}

            {/* Phase status */}
            {phase !== "idle" && (
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-2 text-sm">
                  {phase === "hashing" && (
                    <>
                      <span className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                      <span className="text-blue-300">Calculando hash…</span>
                    </>
                  )}
                  {phase === "submitting" && (
                    <>
                      <span className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                      <span className="text-blue-300">Enviando a la red…</span>
                    </>
                  )}
                  {phase === "polling" && (
                    <>
                      <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                      <span className="text-yellow-300">
                        Esperando consenso… ({pollCount} polls)
                      </span>
                    </>
                  )}
                  {phase === "done" && (
                    <>
                      <span className="text-green-400">✓</span>
                      <span className="text-green-300">Consenso alcanzado</span>
                    </>
                  )}
                  {phase === "error" && (
                    <>
                      <span className="text-red-400">✕</span>
                      <span className="text-red-300 text-xs">{error}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Result panel */}
          <div className="lg:col-span-3">
            {!result && phase === "idle" && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-5xl mb-4 opacity-30">🔐</div>
                  <p className="text-gray-600 text-sm">
                    Seleccioná un archivo para ver el resultado
                  </p>
                </div>
              </div>
            )}

            {!result && phase === "polling" && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full border-2 border-blue-400 border-t-transparent animate-spin mx-auto mb-4" />
                  <p className="text-gray-400 text-sm">
                    El nodo autónomo está evaluando el hash…
                  </p>
                  <p className="text-gray-600 text-xs mt-2">
                    Revisando cada 5 segundos · Loop del nodo: 30 s
                  </p>
                </div>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                {/* Main result */}
                <div
                  className={`p-6 border rounded-2xl ${
                    RESULT_COLORS[result.consensus_result] ?? RESULT_COLORS["pending"]!
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-xs opacity-60 mb-1 uppercase tracking-wider">
                        Resultado del consenso
                      </p>
                      <p className="text-3xl font-bold capitalize">
                        {result.consensus_result === "valid"
                          ? "✓ Válido"
                          : result.consensus_result === "invalid"
                          ? "✕ Inválido"
                          : result.consensus_result === "partial"
                          ? "⏳ Parcial"
                          : "⌛ Pendiente"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs opacity-60 mb-1">Confianza</p>
                      <p className="text-2xl font-bold">
                        {(result.confidence * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>

                  {/* Confidence bar */}
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-current rounded-full transition-all duration-700"
                      style={{ width: `${result.confidence * 100}%` }}
                    />
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                    <p className="text-xs text-gray-400 mb-1">Nodos votantes</p>
                    <p className="text-2xl font-bold">{result.votes.total}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {result.votes.valid} válidos · {result.votes.invalid} inválidos
                    </p>
                  </div>

                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                    <p className="text-xs text-gray-400 mb-1">Nodos confiables</p>
                    <p className="text-2xl font-bold">{result.votes.trusted_nodes}</p>
                    <p className="text-xs text-gray-500 mt-0.5">reputación ≥ 2.0</p>
                  </div>

                  <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                    <p className="text-xs text-gray-400 mb-1">Score ponderado</p>
                    <p className="text-2xl font-bold">{result.score.toFixed(3)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Σ valid − Σ invalid</p>
                  </div>

                  <div
                    className={`p-4 border rounded-xl ${
                      SECURITY_COLORS[result.economic_security] ?? SECURITY_COLORS["none"]!
                    }`}
                  >
                    <p className="text-xs opacity-60 mb-1">Seguridad económica</p>
                    <p className="text-2xl font-bold capitalize">
                      {result.economic_security}
                    </p>
                    <p className="text-xs opacity-50 mt-0.5">stake-weighted</p>
                  </div>
                </div>

                {result.suspicious && (
                  <div className="p-4 bg-red-900/20 border border-red-800/40 rounded-xl text-red-300 text-sm">
                    ⚠️ Cluster sospechoso detectado — posible comportamiento coordinado entre nodos
                  </div>
                )}

                {/* Raw hash */}
                <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                  <p className="text-xs text-gray-400 mb-2">Hash verificado</p>
                  <p className="font-mono text-xs text-blue-300 break-all">
                    {result.hash}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={reset}
                    className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors"
                  >
                    Verificar otro
                  </button>
                  <a
                    href={`https://expressjs-production-8bfc.up.railway.app/api/verify/result/${result.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center px-4 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-800/40 rounded-xl text-sm font-medium text-blue-300 transition-colors"
                  >
                    Ver en API
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* How it works mini */}
        <div className="mt-16 border-t border-white/10 pt-12">
          <h2 className="text-lg font-semibold mb-6 text-gray-300">
            Lo que pasa cuando subís un archivo
          </h2>
          <div className="grid sm:grid-cols-4 gap-4 text-sm">
            {[
              { n: "1", t: "Hash local", d: "SHA-256 en tu navegador. El archivo no sale del dispositivo." },
              { n: "2", t: "Registro", d: "Solo el hash se envía al servidor como pending_verification." },
              { n: "3", t: "Nodo vota", d: "El nodo autónomo evalúa en el próximo ciclo de 30 s." },
              { n: "4", t: "Consenso", d: "≥ 3 nodos con reputación ≥ 1.2 forman el resultado final." },
            ].map((s) => (
              <div key={s.n} className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-blue-800 text-blue-300 text-xs flex items-center justify-center shrink-0 mt-0.5">
                  {s.n}
                </span>
                <div>
                  <p className="font-medium text-gray-200">{s.t}</p>
                  <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
