/**
 * Multi-process (cluster) orchestration.
 *
 * In "primary" mode: forks `workers` child processes (capped at maxWorkers),
 * restarts crashed workers, and shuts everything down gracefully on SIGINT/SIGTERM.
 * In "worker" mode: nothing to do — the server runs normally.
 *
 * Graceful shutdown: stop accepting connections, wait for in-flight requests,
 * then exit. Forced kill after a timeout.
 */
import cluster from 'cluster';
import os from 'os';

export function shouldRunPrimary(workers) {
  return workers > 1 && cluster.isPrimary;
}

export function workerCount(workers, maxWorkers) {
  if (workers <= 0) return Math.min(os.cpus().length, maxWorkers);
  return Math.min(workers, maxWorkers);
}

export function startCluster({ count, logger, onWorkerExit }) {
  for (let i = 0; i < count; i++) {
    cluster.fork();
  }
  logger?.info('cluster-started', { pid: process.pid, workers: count });

  cluster.on('exit', (worker, code, signal) => {
    logger?.warn('worker-exit', { pid: worker.process.pid, code, signal });
    if (onWorkerExit?.()) return; // primary shutting down — don't respawn
    cluster.fork(); // replace crashed worker
    logger?.info('worker-fork', { pid: worker.process.pid });
  });

  cluster.on('listening', (worker, address) => {
    logger?.info('worker-listening', { pid: worker.process.pid, port: address.port });
  });

  return () => {
    // Ask each worker to shut down gracefully.
    for (const id in cluster.workers) {
      cluster.workers[id]?.send?.('shutdown');
    }
    const force = setTimeout(() => {
      logger?.warn('cluster-force-kill', {});
      for (const id in cluster.workers) cluster.workers[id]?.kill?.('SIGKILL');
    }, 8000);
    force.unref();
  };
}

export function handleWorkerShutdown() {
  // Workers receive a 'shutdown' message; their own signal handlers do the rest.
  return process.on('message', (msg) => {
    if (msg === 'shutdown') {
      process.emit('SIGTERM');
    }
  });
}
