/**
 * One-in-flight-per-proxy pool.
 * Max concurrent outbound requests = number of proxies; extra requests wait in queue.
 */
class ProxyPool {
  constructor(proxies = []) {
    this.proxies = Array.isArray(proxies) ? proxies.filter(Boolean) : [];
    this.freeIndices = this.proxies.map((_, index) => index);
    this.waitQueue = [];
    this.inUse = 0;
    this._seq = 0;
    this.stats = { maxActive: 0, maxQueued: 0, started: 0, finished: 0 };
  }

  get size() {
    return this.proxies.length;
  }

  get active() {
    return this.inUse;
  }

  get queued() {
    return this.waitQueue.length;
  }

  _trackStats() {
    this.stats.maxActive = Math.max(this.stats.maxActive, this.inUse);
    this.stats.maxQueued = Math.max(this.stats.maxQueued, this.waitQueue.length);
  }

  _log(event, reqId, proxy) {
    this._trackStats();
    const host = proxy ? `${proxy.host}:${proxy.port}` : '-';
    console.log(
      `[proxyPool] #${reqId} ${event} proxy=${host} | active=${this.inUse}/${this.size} queued=${this.queued} free=${this.freeIndices.length}`
    );
  }

  _grant(idx, resolve, reqId) {
    this.inUse += 1;
    const proxy = this.proxies[idx];
    this._log('START', reqId, proxy);
    resolve({
      proxy,
      release: () => this._release(idx, reqId, proxy)
    });
  }

  _release(idx, reqId, proxy) {
    this.inUse = Math.max(0, this.inUse - 1);
    this.stats.finished += 1;
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      this._grant(idx, next.resolve, next.reqId);
      return;
    }
    this.freeIndices.push(idx);
    this._log('DONE', reqId, proxy);
  }

  acquire(reqId) {
    if (this.proxies.length === 0) {
      return Promise.resolve({ proxy: null, release: () => {} });
    }
    if (this.freeIndices.length > 0) {
      const idx = this.freeIndices.shift();
      return new Promise((resolve) => this._grant(idx, resolve, reqId));
    }
    this._trackStats();
    console.log(
      `[proxyPool] #${reqId} WAIT | active=${this.inUse}/${this.size} queued=${this.waitQueue.length + 1} (no free proxy)`
    );
    return new Promise((resolve) => {
      this.waitQueue.push({ resolve, reqId });
    });
  }

  /**
   * Run task with one dedicated proxy; releases slot when done (success or error).
   * @param {function(Object): Promise<*>} task
   * @param {string} [logLabel]
   */
  async run(task, logLabel = '') {
    const reqId = ++this._seq;
    this.stats.started += 1;
    const slot = await this.acquire(reqId);
    if (!slot.proxy) {
      return task(null);
    }
    if (logLabel) {
      console.log(`[proxyPool] #${reqId} label=${logLabel}`);
    }
    try {
      return await task(slot.proxy);
    } finally {
      slot.release();
    }
  }

  resetStats() {
    this.stats = { maxActive: 0, maxQueued: 0, started: 0, finished: 0 };
  }

  printStats() {
    console.log(
      `[proxyPool] STATS started=${this.stats.started} finished=${this.stats.finished} maxActive=${this.stats.maxActive}/${this.size} maxQueued=${this.stats.maxQueued}`
    );
  }
}

module.exports = ProxyPool;
