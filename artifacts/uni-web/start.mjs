import http from "http";
import { spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3000");
const VITE_PORT = PORT + 1;

const SPLASH = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>uni.id</title>
<meta http-equiv="refresh" content="1">
<style>body{background:#0d1117;color:#e6edf3;font-family:sans-serif;height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;margin:0}h1{font-size:2rem;margin:0}p{color:#8b949e}</style>
</head><body><h1>uni.id</h1><p>Starting...</p></body></html>`;

const server = http.createServer(async (req, res) => {
  try {
    const r = await fetch(`http://127.0.0.1:${VITE_PORT}${req.url}`, {
      method: req.method,
      headers: Object.fromEntries(
        Object.entries(req.headers).filter(([k]) => k !== "host")
      ),
    });
    const body = Buffer.from(await r.arrayBuffer());
    const headers = {};
    r.headers.forEach((v, k) => { headers[k] = v; });
    res.writeHead(r.status, headers);
    res.end(body);
  } catch {
    res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
    res.end(SPLASH);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[uni.id] Server listening on ${PORT}`);
  const env = { ...process.env, PORT: String(VITE_PORT) };
  const vite = spawn(
    path.join(__dir, "node_modules/.bin/vite"),
    ["--config", path.join(__dir, "vite.config.ts"), "--host", "0.0.0.0"],
    { env, stdio: "inherit" }
  );
  vite.on("exit", (code) => { server.close(); process.exit(code ?? 1); });
});
