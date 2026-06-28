// Free the dev port before starting, so `npm run dev` always claims port 5000 even if a
// previous server is still holding it.
//
// Scoped to the port ON PURPOSE: it kills only the process LISTENING on this port, never
// "every process" (that would take down this very session and your other work).
// Cross-platform, and never throws — on any trouble it does nothing, so the server still
// starts.

import { execSync } from "node:child_process";

const port = Number(process.env.PORT ?? 5000);

function pidsOnPort() {
  try {
    if (process.platform === "win32") {
      const out = execSync("netstat -ano", { encoding: "utf8" });
      const pids = new Set();
      for (const line of out.split("\n")) {
        const p = line.trim().split(/\s+/);
        // Proto  Local  Foreign  State  PID
        if (p.length >= 5 && p[0] === "TCP" && p[3] === "LISTENING" && p[1].endsWith(`:${port}`)) {
          pids.add(p[4]);
        }
      }
      return [...pids];
    }
    const out = execSync(`lsof -ti tcp:${port} -s tcp:LISTEN`, { encoding: "utf8" });
    return [...new Set(out.split("\n").map((s) => s.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

function kill(pid) {
  try {
    execSync(process.platform === "win32" ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const pids = pidsOnPort();
if (pids.length === 0) {
  console.log(`port ${port} already free`);
} else {
  const killed = pids.filter(kill);
  console.log(`port ${port}: freed (killed ${killed.join(", ") || "nothing"})`);
}
