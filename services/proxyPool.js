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

  _grant(idx, resolve) {
    this.inUse += 1;
    const proxy = this.proxies[idx];
    resolve({
      proxy,
      release: () => this._release(idx)
    });
  }

  _release(idx) {
    this.inUse = Math.max(0, this.inUse - 1);
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      this._grant(idx, next);
      return;
    }
    this.freeIndices.push(idx);
  }

  acquire() {
    if (this.proxies.length === 0) {
      return Promise.resolve({ proxy: null, release: () => {} });
    }
    if (this.freeIndices.length > 0) {
      const idx = this.freeIndices.shift();
      return new Promise((resolve) => this._grant(idx, resolve));
    }
    return new Promise((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /**
   * Run task with one dedicated proxy; releases slot when done (success or error).
   * @param {function(Object): Promise<*>} task
   * @param {string} [logLabel]
   */
  async run(task, logLabel = '') {
    const slot = await this.acquire();
    if (!slot.proxy) {
      return task(null);
    }
    const label = logLabel ? ` (${logLabel})` : '';
    console.log(
      `[proxyPool] using ${slot.proxy.host}:${slot.proxy.port}${label} | active=${this.inUse}/${this.size} queued=${this.queued}`
    );
    try {
      return await task(slot.proxy);
    } finally {
      slot.release();
    }
  }
}

module.exports = ProxyPool;
