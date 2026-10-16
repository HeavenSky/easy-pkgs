// runPool 的 worker 入口: 载入判定模块, 逐条执行并回传结果.
import { parentPort, workerData } from 'node:worker_threads';

const { setup } = await import(workerData.moduleUrl);
const check = await setup(workerData.options);

parentPort.on('message', async (c) => {
  let r;
  try {
    r = await check(c);
  } catch (e) {
    r = { level: 'crash', error: String(e && e.message).split('\n')[0].slice(0, 200) };
  }
  parentPort.postMessage({ id: c.id, ...r });
});
