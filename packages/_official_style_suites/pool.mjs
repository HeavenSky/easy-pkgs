// 在多个 worker 中逐条执行判定函数, 单条超时则重启该 worker 并记为 timeout.
// 判定模块须导出 setup(options) => (case) => result | Promise<result>.
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';

const WORKER = new URL('./pool-worker.mjs', import.meta.url);

export function runPool(cases, moduleUrl, options = {}, { timeout = 5000, size = Math.max(1, cpus().length - 1) } = {}) {
  return new Promise((resolve) => {
    const results = new Array(cases.length);
    let next = 0;
    let finished = 0;

    function start() {
      const w = new Worker(WORKER, { workerData: { moduleUrl: String(moduleUrl), options } });
      let index = -1;
      let timer;
      const feed = () => {
        if (next >= cases.length) return void w.terminate();
        index = next++;
        timer = setTimeout(() => {
          results[index] = { id: cases[index].id, level: 'timeout' };
          w.removeAllListeners();
          w.terminate();
          done();
          start();
        }, timeout);
        w.postMessage(cases[index]);
      };
      w.on('message', (r) => {
        clearTimeout(timer);
        results[index] = r;
        done();
        feed();
      });
      w.on('error', (e) => {
        clearTimeout(timer);
        if (index >= 0 && !results[index]) {
          results[index] = { id: cases[index].id, level: 'crash', error: String(e.message).slice(0, 200) };
          done();
        }
        start();
      });
      feed();
    }

    function done() {
      if (++finished === cases.length) resolve(results);
    }

    if (!cases.length) return resolve(results);
    for (let i = 0; i < Math.min(size, cases.length); i++) start();
  });
}
