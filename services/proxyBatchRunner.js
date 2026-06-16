/**
 * Strict batch executor for ProxyPool.
 *
 * Unlike the pool's built-in FIFO queue (next request starts as soon as a proxy frees),
 * this module runs fixed-size batches: start N requests, await ALL N, then start the next N.
 *
 * Batch size defaults to pool.size (one request per proxy per batch).
 */

/**
 * @typedef {'fulfilled'|'rejected'} SettledStatus
 */

/**
 * @typedef {Object} SettledItemResult
 * @property {number} index - Global index across all batches (0-based).
 * @property {SettledStatus} status
 * @property {*} [value]
 * @property {*} [reason]
 */

/**
 * @typedef {Object} BatchSummary
 * @property {number} batchIndex - 0-based batch number.
 * @property {number} offset - Global index of first item in this batch.
 * @property {number} size - Number of items in this batch.
 * @property {number} fulfilled
 * @property {number} rejected
 * @property {number} durationMs
 */

/**
 * @typedef {Object} ProxyBatchResult
 * @property {number} total - Total items processed.
 * @property {number} batchSize
 * @property {number} batchCount
 * @property {number} fulfilled
 * @property {number} rejected
 * @property {BatchSummary[]} batches
 * @property {SettledItemResult[]} results - Flat list in global index order.
 */

/**
 * @typedef {Object} ProxyBatchOptions
 * @property {import('./proxyPool')} pool - ProxyPool instance (uses pool.run per item).
 * @property {number} [batchSize] - Defaults to pool.size; capped to pool.size when proxies exist.
 * @property {(proxy: Object|null, item: *, index: number) => Promise<*>} task
 * @property {(summary: BatchSummary) => void|Promise<void>} [onBatchStart]
 * @property {(summary: BatchSummary, batchResults: SettledItemResult[]) => void|Promise<void>} [onBatchComplete]
 * @property {boolean} [stopOnBatchFailure=false] - If true, stop after first batch with any rejection.
 */

/**
 * Resolve effective batch size (never above pool.size when proxies are configured).
 * @param {import('./proxyPool')} pool
 * @param {number|undefined} batchSize
 */
function resolveBatchSize(pool, batchSize) {
  const poolSize = pool?.size || 0;
  const requested = Number.isFinite(batchSize) && batchSize > 0 ? Math.floor(batchSize) : poolSize;
  if (poolSize === 0) return requested;
  return Math.min(requested, poolSize);
}

/**
 * Run one strict batch through ProxyPool.run().
 * Errors in individual tasks do not cancel siblings (Promise.allSettled).
 *
 * @param {import('./proxyPool')} pool
 * @param {*[]} batchItems
 * @param {number} globalOffset
 * @param {ProxyBatchOptions['task']} task
 * @param {number} batchIndex
 * @returns {Promise<SettledItemResult[]>}
 */
async function runSingleBatch(pool, batchItems, globalOffset, task, batchIndex) {
  const settled = await Promise.allSettled(
    batchItems.map((item, localIndex) => {
      const globalIndex = globalOffset + localIndex;
      const label = `batch-${batchIndex + 1}#${globalIndex + 1}`;
      return pool.run((proxy) => task(proxy, item, globalIndex), label);
    })
  );

  return settled.map((entry, localIndex) => {
    const globalIndex = globalOffset + localIndex;
    if (entry.status === 'fulfilled') {
      return { index: globalIndex, status: 'fulfilled', value: entry.value };
    }
    return { index: globalIndex, status: 'rejected', reason: entry.reason };
  });
}

/**
 * Process items in strict batches (array input).
 *
 * Example: 250 items, batchSize 100 =>
 *   batch 1 => indices 0-99, await all
 *   batch 2 => indices 100-199, await all
 *   batch 3 => indices 200-249, await all
 *
 * @param {*[]} items
 * @param {ProxyBatchOptions} options
 * @returns {Promise<ProxyBatchResult>}
 */
async function runProxyBatches(items, options) {
  if (!options?.pool) throw new Error('runProxyBatches: pool is required');
  if (typeof options.task !== 'function') throw new Error('runProxyBatches: task is required');

  const list = Array.isArray(items) ? items : [];
  const batchSize = resolveBatchSize(options.pool, options.batchSize);
  if (batchSize <= 0) throw new Error('runProxyBatches: batchSize must be > 0');

  /** @type {BatchSummary[]} */
  const batches = [];
  /** @type {SettledItemResult[]} */
  const results = [];
  let fulfilled = 0;
  let rejected = 0;

  const batchCount = list.length === 0 ? 0 : Math.ceil(list.length / batchSize);

  for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
    const offset = batchIndex * batchSize;
    const batchItems = list.slice(offset, offset + batchSize);

    const batchSummary = {
      batchIndex,
      offset,
      size: batchItems.length,
      fulfilled: 0,
      rejected: 0,
      durationMs: 0
    };

    if (options.onBatchStart) {
      await options.onBatchStart({ ...batchSummary });
    }

    const batchStart = Date.now();
    const batchResults = await runSingleBatch(
      options.pool,
      batchItems,
      offset,
      options.task,
      batchIndex
    );
    batchSummary.durationMs = Date.now() - batchStart;

    for (const r of batchResults) {
      results.push(r);
      if (r.status === 'fulfilled') {
        fulfilled += 1;
        batchSummary.fulfilled += 1;
      } else {
        rejected += 1;
        batchSummary.rejected += 1;
      }
    }

    batches.push(batchSummary);

    if (options.onBatchComplete) {
      await options.onBatchComplete({ ...batchSummary }, batchResults);
    }

    if (options.stopOnBatchFailure && batchSummary.rejected > 0) {
      break;
    }
  }

  return {
    total: list.length,
    batchSize,
    batchCount: batches.length,
    fulfilled,
    rejected,
    batches,
    results
  };
}

/**
 * Memory-efficient variant for very large M without holding all items in RAM.
 * Supply total count and a getter: getItem(globalIndex) => item | Promise<item>.
 *
 * @param {number} total
 * @param {(index: number) => *|Promise<*>} getItem
 * @param {ProxyBatchOptions} options
 * @returns {Promise<ProxyBatchResult>}
 */
async function runProxyBatchesIndexed(total, getItem, options) {
  if (!Number.isFinite(total) || total < 0) throw new Error('runProxyBatchesIndexed: total must be >= 0');
  if (typeof getItem !== 'function') throw new Error('runProxyBatchesIndexed: getItem is required');
  if (!options?.pool) throw new Error('runProxyBatchesIndexed: pool is required');
  if (typeof options.task !== 'function') throw new Error('runProxyBatchesIndexed: task is required');

  const batchSize = resolveBatchSize(options.pool, options.batchSize);
  if (batchSize <= 0) throw new Error('runProxyBatchesIndexed: batchSize must be > 0');

  /** @type {BatchSummary[]} */
  const batches = [];
  /** @type {SettledItemResult[]} */
  const results = [];
  let fulfilled = 0;
  let rejected = 0;

  const batchCount = total === 0 ? 0 : Math.ceil(total / batchSize);

  for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
    const offset = batchIndex * batchSize;
    const size = Math.min(batchSize, total - offset);

    // Materialize only the current batch (not the full M-item array).
    const batchItems = [];
    for (let i = 0; i < size; i += 1) {
      batchItems.push(await getItem(offset + i));
    }

    const batchSummary = {
      batchIndex,
      offset,
      size,
      fulfilled: 0,
      rejected: 0,
      durationMs: 0
    };

    if (options.onBatchStart) {
      await options.onBatchStart({ ...batchSummary });
    }

    const batchStart = Date.now();
    const batchResults = await runSingleBatch(
      options.pool,
      batchItems,
      offset,
      options.task,
      batchIndex
    );
    batchSummary.durationMs = Date.now() - batchStart;

    for (const r of batchResults) {
      results.push(r);
      if (r.status === 'fulfilled') {
        fulfilled += 1;
        batchSummary.fulfilled += 1;
      } else {
        rejected += 1;
        batchSummary.rejected += 1;
      }
    }

    batches.push(batchSummary);

    if (options.onBatchComplete) {
      await options.onBatchComplete({ ...batchSummary }, batchResults);
    }

    if (options.stopOnBatchFailure && batchSummary.rejected > 0) {
      break;
    }
  }

  return {
    total,
    batchSize,
    batchCount: batches.length,
    fulfilled,
    rejected,
    batches,
    results
  };
}

module.exports = {
  runProxyBatches,
  runProxyBatchesIndexed,
  resolveBatchSize
};
