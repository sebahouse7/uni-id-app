import http from "http";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3000");
const VITE_PORT = PORT + 1;

const SPLASH = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>uni.id</title><meta http-equiv="refresh" content="1">
<style>body{background:#0d1117;color:#e6edf3;font-family:sans-serif;height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;margin:0}h1{font-size:2rem;margin:0}p{color:#8b949e}</style>
</head><body><h1>uni.id</h1><p>Iniciando...</p></body></html>`;

const server = http.createServer(async (req, res) => {
  try {
    const headers = { ...req.headers };
    delete headers["host"];
    const r = await fetch(`http://127.0.0.1:${VITE_PORT}${req.url}`, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
      duplex: "half",
    });
    const buf = Buffer.from(await r.arrayBuffer());
    const outHeaders = {};
    r.headers.forEach((v, k) => { outHeaders[k] = v; });
    res.writeHead(r.status, outHeaders);
    res.end(buf);
  } catch {
    res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
    res.end(SPLASH);
  }
});

// Proxy WebSocket upgrades (vite HMR)
server.on("upgrade", (req, socket, head) => {
  const conn = http.request({
    hostname: "127.0.0.1",
    port: VITE_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  });
  conn.end();
  conn.on("upgrade", (res, viteSocket, viteHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
      Object.entries(res.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") +
      "\r\n\r\n"
    );
    viteSocket.pipe(socket);
    socket.pipe(viteSocket);
    socket.on("error", () => viteSocket.destroy());
    viteSocket.on("error", () => socket.destroy());
  });
  conn.on("error", () => socket.destroy());
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[uni.id] Proxy listo en :${PORT} → vite en :${VITE_PORT}`);
  const env = { ...process.env, PORT: String(VITE_PORT) };
  const vite = spawn(
    path.join(__dir, "node_modules/.bin/vite"),
    ["--config", path.join(__dir, "vite.config.ts"), "--host", "0.0.0.0"],
    { env, stdio: "inherit" }
  );
  vite.on("exit", (code) => { server.close(); process.exit(code ?? 1); });
});
