/**
 * JuYi — 共享数据库核心
 * ======================
 * 通用的 IndexedDB 异步封装，供所有 JuYi 模块使用。
 *
 * 特性：
 * - Promise 风格 API，告别回调地狱
 * - 自动创建/升级 Object Store 和索引
 * - 内置导出/导入（JSON），方便数据迁移
 * - 零依赖，纯浏览器原生 API
 *
 * 使用示例：
 *   const db = new JuYiDB();
 *   await db.open('JuYiDB', 1, {
 *     myStore: {
 *       keyPath: 'id',
 *       autoIncrement: true,
 *       indexes: [{ name: 'byDate', keyPath: 'createdAt' }]
 *     }
 *   });
 *   await db.add('myStore', { title: 'Hello' });
 *   const all = await db.getAll('myStore');
 *
 * @module db-core
 * @version 1.0.0
 */

class JuYiDB {
  constructor() {
    /** @type {IDBDatabase|null} */
    this.db = null;
  }

  /* ============================ 连接 ============================ */

  /**
   * 打开（或创建）数据库。
   *
   * @param {string}  name    - 数据库名称
   * @param {number}  version - 版本号（修改 schema 时递增）
   * @param {Object}  stores  - Store 定义
   *   { storeName: { keyPath?, autoIncrement?, indexes?: [{name, keyPath, unique?}] } }
   * @returns {Promise<IDBDatabase>}
   */
  open(name, version, stores = {}) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, version);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const [storeName, def] of Object.entries(stores)) {
          // 如果 store 已存在则复用，否则创建
          const store = db.objectStoreNames.contains(storeName)
            ? e.target.transaction.objectStore(storeName)
            : db.createObjectStore(storeName, {
                keyPath: def.keyPath || 'id',
                autoIncrement: def.autoIncrement !== false,
              });

          // 创建 / 补建索引
          for (const idx of def.indexes || []) {
            if (!store.indexNames.contains(idx.name)) {
              store.createIndex(idx.name, idx.keyPath, {
                unique: idx.unique || false,
              });
            }
          }
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /** 关闭数据库连接 */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /* ============================ CRUD ============================ */

  /**
   * 新增一条记录
   * @returns {Promise<IDBValidKey>} 生成的 key
   */
  add(storeName, item) {
    return this._tx(storeName, 'readwrite', (store) => {
      return this._promisify(store.add(item));
    });
  }

  /**
   * 新增或覆盖（key 已存在则覆盖）
   * @returns {Promise<IDBValidKey>}
   */
  put(storeName, item) {
    return this._tx(storeName, 'readwrite', (store) => {
      return this._promisify(store.put(item));
    });
  }

  /**
   * 按主键查询单条
   * @returns {Promise<Object|undefined>}
   */
  get(storeName, id) {
    return this._tx(storeName, 'readonly', (store) => {
      return this._promisify(store.get(id));
    });
  }

  /**
   * 获取全部记录
   * @returns {Promise<Object[]>}
   */
  getAll(storeName) {
    return this._tx(storeName, 'readonly', (store) => {
      return this._promisify(store.getAll());
    });
  }

  /**
   * 按主键删除
   * @returns {Promise<void>}
   */
  delete(storeName, id) {
    return this._tx(storeName, 'readwrite', (store) => {
      return this._promisify(store.delete(id));
    });
  }

  /**
   * 清空整个 store
   * @returns {Promise<void>}
   */
  clear(storeName) {
    return this._tx(storeName, 'readwrite', (store) => {
      return this._promisify(store.clear());
    });
  }

  /**
   * 记录总数
   * @returns {Promise<number>}
   */
  count(storeName) {
    return this._tx(storeName, 'readonly', (store) => {
      return this._promisify(store.count());
    });
  }

  /**
   * 按索引查询单条
   * @param {string} storeName
   * @param {string} indexName
   * @param {*}      value
   * @returns {Promise<Object|undefined>}
   */
  getByIndex(storeName, indexName, value) {
    return this._tx(storeName, 'readonly', (store) => {
      return this._promisify(store.index(indexName).get(value));
    });
  }

  /* ============================ 导出 / 导入 ============================ */

  /**
   * 导出指定 store 的全部数据为 JSON 对象（含元信息）
   * @param {string[]} storeNames
   * @returns {Promise<Object>}
   */
  async exportAll(storeNames) {
    const data = {};
    for (const name of storeNames) {
      data[name] = await this.getAll(name);
    }
    return {
      _format: 'JuYiDB/1',
      exportedAt: new Date().toISOString(),
      stores: data,
    };
  }

  /**
   * 从 exportAll 生成的 JSON 对象导入数据（全量覆盖）
   * @param {Object} jsonData - exportAll 的输出
   * @param {Object} stores   - store 定义（与 open 相同格式），用于校验
   */
  async importAll(jsonData, stores = {}) {
    if (jsonData._format !== 'JuYiDB/1' && jsonData._format !== 'JuYiDB/2') {
      throw new Error('不支持的导入格式');
    }
    const { stores: data } = jsonData;
    for (const [storeName, items] of Object.entries(data)) {
      if (!stores[storeName]) continue; // 跳过未定义的 store
      await this.clear(storeName);
      for (const item of items) {
        await this.add(storeName, item);
      }
    }
  }

  /* ============================ 内部工具 ============================ */

  /** 封装事务操作 */
  _tx(storeName, mode, callback) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('数据库未打开，请先调用 open()'));
      const tx = this.db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const result = callback(store);
      if (result && typeof result.then === 'function') {
        result.then(resolve).catch(reject);
      } else {
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
      }
    });
  }

  /** 把 IDBRequest 转为 Promise */
  _promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
