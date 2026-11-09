import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

export function testServer(args: string[], env: NodeJS.ProcessEnv, directory = '../../') {
  const child = spawn(process.execPath, args, {
    cwd: fileURLToPath(new URL(directory, import.meta.url)),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout?.on('data', data => { log = (log + data.toString()).slice(-6000); });
  child.stderr?.on('data', data => { log = (log + data.toString()).slice(-6000); });
  return {
    child,
    async ready(url: string) {
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        if (child.exitCode !== null || child.signalCode) throw new Error(`Isolated test server exited (${child.exitCode || child.signalCode}): ` + log);
        try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return; } catch {}
        await setTimeout(200);
      }
      throw new Error('Isolated test server did not become ready: ' + log);
    },
    async stop() {
      if (child.exitCode !== null || child.signalCode) return;
      const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
      child.kill('SIGTERM');
      await Promise.race([closed, setTimeout(5000)]);
      if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL');
      await closed;
    }
  };
}
