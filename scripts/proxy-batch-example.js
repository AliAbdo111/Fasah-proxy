/**
 * Example: strict batch processing with ProxyPool.run()
 *
 *   node scripts/proxy-batch-example.js
 *   COUNT=250 BATCH_SIZE=100 node scripts/proxy-batch-example.js
 */

const ProxyPool = require('../dist/services/proxyPool').default;
const { runProxyBatches, runProxyBatchesIndexed } = require('../dist/services/proxyBatchRunner');

const COUNT = Number(process.env.COUNT || 250);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 100);
const HOLD_MS = Number(process.env.HOLD_MS || 500);

function makeProxies(n) {
  return Array.from({ length: n }, (_, i) => ({
    host: `10.0.0.${i + 1}`,
    port: 8000 + i
  }));
}

async function exampleWithArray() {
  const pool = new ProxyPool(makeProxies(BATCH_SIZE));
  const items = Array.from({ length: COUNT }, (_, i) => ({ id: i + 1 }));

  console.log(`\n=== Array mode: ${COUNT} items, batchSize=${BATCH_SIZE} ===\n`);

  const result = await runProxyBatches(items, {
    pool,
    batchSize: BATCH_SIZE,
    onBatchStart: (b) => {
      console.log(`[batch] START #${b.batchIndex + 1} items ${b.offset + 1}-${b.offset + b.size}`);
    },
    onBatchComplete: (b) => {
      console.log(
        `[batch] DONE  #${b.batchIndex + 1} ok=${b.fulfilled} fail=${b.rejected} ${b.durationMs}ms`
      );
    },
    task: async (proxy, item) => {
      await new Promise((r) => setTimeout(r, HOLD_MS));
      if (item.id % 97 === 0) throw new Error(`simulated failure id=${item.id}`);
      return { id: item.id, proxy: `${proxy.host}:${proxy.port}` };
    }
  });

  console.log('\nSummary:', {
    total: result.total,
    batches: result.batchCount,
    fulfilled: result.fulfilled,
    rejected: result.rejected
  });
  pool.printStats();
}

async function exampleIndexed() {
  const pool = new ProxyPool(makeProxies(BATCH_SIZE));

  console.log(`\n=== Indexed mode: ${COUNT} items (no full array in memory) ===\n`);

  const result = await runProxyBatchesIndexed(
    COUNT,
    async (index) => ({ id: index + 1 }),
    {
      pool,
      batchSize: BATCH_SIZE,
      onBatchStart: (b) => console.log(`[batch] START #${b.batchIndex + 1}`),
      onBatchComplete: (b) => console.log(`[batch] DONE  #${b.batchIndex + 1} ${b.durationMs}ms`),
      task: async (proxy, item) => {
        await new Promise((r) => setTimeout(r, HOLD_MS / 2));
        return { id: item.id, proxy: `${proxy.host}:${proxy.port}` };
      }
    }
  );

  console.log('Indexed summary:', {
    total: result.total,
    fulfilled: result.fulfilled,
    rejected: result.rejected
  });
}

async function main() {
  await exampleWithArray();
  await exampleIndexed();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
