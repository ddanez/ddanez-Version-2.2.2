// db.ts - Implementación Ultra-Rápida con Soporte Nativo para APK y Termux
import { Capacitor } from '@capacitor/core';

const DB_NAME = 'GestorProDB';
const DB_VERSION = 10;
const STORES = [
  'products', 'customers', 'suppliers', 'sales', 'purchases', 
  'settings', 'sellers', 'payments', 'authenticators', 'expenses', 
  'movements', 'ingredients', 'recipes', 'promotions', 'customer_promotions', 'users',
  'sync_queue', 'tombstones'
];

interface SyncQueueItem {
  id: string;
  store: string;
  action: 'put' | 'delete' | 'bulk';
  payload: any;
  timestamp: number;
  retries: number;
}

export class DBService {
  private db: IDBDatabase | null = null;
  private token: string | null = null;
  private onSessionExpired: (() => void) | null = null;
  private isHandlingSessionExpired = false;

  // Control de conectividad con el servidor backend
  private isServerOnline: boolean = false;
  private serverChecked: boolean = false;
  private lastCheckTime: number = 0;
  private isSyncingQueue: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.checkServerConnection(true).then(online => {
          if (online) this.syncPendingQueue();
        });
      });
      // Sincronización periódica de la cola cuando hay conexión
      setInterval(() => {
        if (!this.isLocalMode() && this.isServerOnline) {
          this.syncPendingQueue();
        }
      }, 30000);
    }
  }

  setToken(token: string | null) {
    this.token = token;
    // Si el token cambia, invalidar caché de conexión e intentar sincronizar pendientes
    this.serverChecked = false;
    if (token && token !== 'local-offline-token') {
      setTimeout(() => {
        this.checkServerConnection(true).then(online => {
          if (online) this.syncPendingQueue();
        });
      }, 1000);
    }
  }

  isLocalMode(): boolean {
    return !this.token || this.token === 'local-offline-token';
  }

  getBaseUrl(): string {
    if (typeof window !== 'undefined') {
      const isNative = Capacitor.isNativePlatform() || window.location.protocol === 'capacitor:';
      if (isNative) {
        // Si hay una URL personalizada configurada, usarla; de lo contrario apuntar al loopback de Termux
        const savedUrl = localStorage.getItem('api_server_url');
        return savedUrl ? savedUrl.replace(/\/$/, '') : 'http://127.0.0.1:3000';
      }
    }
    return '';
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`
    };
  }

  setOnSessionExpired(callback: () => void) {
    this.onSessionExpired = callback;
  }

  private handleSessionExpired() {
    if (this.isHandlingSessionExpired) return;
    this.isHandlingSessionExpired = true;
    if (this.onSessionExpired) {
      this.onSessionExpired();
    }
    setTimeout(() => {
      this.isHandlingSessionExpired = false;
    }, 3000);
  }

  /**
   * Comprobación ultra-rápida de salud del servidor (máximo 400ms).
   * Si el servidor no responde de inmediato, la app continúa 100% en modo local sin demoras.
   */
  async checkServerConnection(force = false): Promise<boolean> {
    if (this.isLocalMode()) {
      this.isServerOnline = false;
      return false;
    }

    const now = Date.now();
    if (!force && this.serverChecked && (now - this.lastCheckTime < 25000)) {
      return this.isServerOnline;
    }

    this.lastCheckTime = now;
    this.serverChecked = true;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 400); // 400ms límite estricto

      const res = await fetch(`${this.getBaseUrl()}/api/health`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      this.isServerOnline = res.ok;
      return res.ok;
    } catch {
      this.isServerOnline = false;
      return false;
    }
  }

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.warn("⚠️ IndexedDB tardando en responder...");
        resolve();
      }, 3000);

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        STORES.forEach(store => {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'id' });
          }
        });
      };

      request.onsuccess = (event) => {
        clearTimeout(timeout);
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = () => {
        clearTimeout(timeout);
        console.error("❌ Error al abrir IndexedDB");
        reject(request.error);
      };
    });
  }

  private async getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    await this.init();
    if (!this.db) throw new Error("Base de datos no inicializada");
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  /**
   * Obtiene datos exclusivamente de la base de datos local (IndexedDB) en milisegundos.
   */
  async getLocal<T>(storeName: string): Promise<T[]> {
    return new Promise<T[]>(async (resolve) => {
      try {
        const store = await this.getStore(storeName, 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve((request.result as T[]) || []);
        request.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  /**
   * Carga instantánea de bootstrap si el servidor está online.
   * Si está offline o en modo APK autónomo, retorna null de inmediato (0ms) sin bloquear.
   */
  async bootstrap(): Promise<Record<string, any[]> | null> {
    if (this.isLocalMode()) return null;

    const isOnline = await this.checkServerConnection();
    if (!isOnline) return null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);

      const response = await fetch(`${this.getBaseUrl()}/api/bootstrap`, { 
        headers: this.getHeaders(),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.status === 401 || response.status === 403) {
        this.handleSessionExpired();
        throw new Error("SESSION_EXPIRED");
      }

      if (response.ok) {
        const data = await response.json();
        // Guardar en IndexedDB en segundo plano sin congelar la UI
        setTimeout(async () => {
          try {
            await this.init();
            if (!this.db) return;
            for (const [storeName, items] of Object.entries(data)) {
              if (this.db?.objectStoreNames.contains(storeName) && Array.isArray(items) && items.length > 0) {
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                for (const item of items) {
                  if (item && item.id) {
                    const isDeleted = await this.isTombstone(storeName, item.id);
                    if (!isDeleted) {
                      store.put(item);
                    }
                  }
                }
              }
            }
          } catch (e) {}
        }, 10);
        return data;
      }
    } catch (err: any) {
      if (err.message === "SESSION_EXPIRED") throw err;
      this.isServerOnline = false;
    }
    return null;
  }

  /**
   * Obtiene todos los registros.
   * En modo local o cuando el servidor está inaccesible, responde al instante desde IndexedDB.
   */
  async getAll<T>(storeName: string): Promise<T[]> {
    // 1. Si no hay conexión al servidor o es modo local, leer directamente de IndexedDB
    if (this.isLocalMode() || !this.isServerOnline) {
      return this.getLocal<T>(storeName);
    }

    // 2. Si el servidor está activo, intentar petición con timeout estricto de 1.2s
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);

      const response = await fetch(`${this.getBaseUrl()}/api/${storeName}`, { 
        headers: this.getHeaders(),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.status === 401 || response.status === 403) {
        this.handleSessionExpired();
        throw new Error("SESSION_EXPIRED");
      }

      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const data = await response.json();
          // Sincronizar con IndexedDB en segundo plano
          setTimeout(async () => {
            try {
              if (Array.isArray(data) && data.length > 0) {
                const store = await this.getStore(storeName, 'readwrite');
                for (const item of data) {
                  if (item && item.id) {
                    const isDeleted = await this.isTombstone(storeName, item.id);
                    if (!isDeleted) {
                      store.put(item);
                    }
                  }
                }
              }
            } catch (e) {}
          }, 10);
          return data;
        }
      }
    } catch (err: any) {
      if (err.message === "SESSION_EXPIRED") throw err;
      this.isServerOnline = false;
    }

    // 3. Fallback instantáneo a IndexedDB
    return this.getLocal<T>(storeName);
  }

  // --- COLA DE SINCRONIZACIÓN PERSISTENTE (OFFLINE-FIRST CON IDEMPOTENCIA) ---

  private async enqueueSync(op: SyncQueueItem): Promise<void> {
    try {
      const store = await this.getStore('sync_queue', 'readwrite');
      await new Promise<void>((resolve) => {
        const req = store.put(op);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    } catch (e) {
      console.warn("Aviso al encolar sincronización:", e);
    }
  }

  private async dequeueSync(id: string): Promise<void> {
    try {
      const store = await this.getStore('sync_queue', 'readwrite');
      await new Promise<void>((resolve) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    } catch (e) {}
  }

  private async recordTombstone(storeName: string, recordId: string): Promise<void> {
    try {
      const store = await this.getStore('tombstones', 'readwrite');
      await new Promise<void>((resolve) => {
        const req = store.put({
          id: `${storeName}::${recordId}`,
          store: storeName,
          recordId,
          timestamp: Date.now()
        });
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    } catch (e) {}
  }

  private async isTombstone(storeName: string, recordId: string): Promise<boolean> {
    try {
      const store = await this.getStore('tombstones', 'readonly');
      return new Promise<boolean>((resolve) => {
        const req = store.get(`${storeName}::${recordId}`);
        req.onsuccess = () => resolve(!!req.result);
        req.onerror = () => resolve(false);
      });
    } catch (e) {
      return false;
    }
  }

  private async removeTombstone(storeName: string, recordId: string): Promise<void> {
    try {
      const store = await this.getStore('tombstones', 'readwrite');
      store.delete(`${storeName}::${recordId}`);
    } catch (e) {}
  }

  /**
   * Procesa la cola de cambios pendientes de forma secuencial garantizando idempotencia
   */
  async syncPendingQueue(): Promise<void> {
    if (this.isSyncingQueue || this.isLocalMode() || !this.isServerOnline) return;
    this.isSyncingQueue = true;

    try {
      const queueStore = await this.getStore('sync_queue', 'readonly');
      const pending: SyncQueueItem[] = await new Promise((resolve) => {
        const req = queueStore.getAll();
        req.onsuccess = () => resolve((req.result as SyncQueueItem[]) || []);
        req.onerror = () => resolve([]);
      });

      if (!pending || pending.length === 0) {
        this.isSyncingQueue = false;
        return;
      }

      // Ordenar por marca de tiempo para preservar el orden causal
      pending.sort((a, b) => a.timestamp - b.timestamp);

      for (const item of pending) {
        try {
          if (item.action === 'put') {
            const res = await fetch(`${this.getBaseUrl()}/api/${item.store}`, {
              method: 'POST',
              headers: this.getHeaders(),
              body: JSON.stringify(item.payload)
            });
            if (res.ok || res.status === 400) {
              await this.dequeueSync(item.id);
            } else if (res.status === 401 || res.status === 403) {
              this.handleSessionExpired();
              break;
            } else {
              break;
            }
          } else if (item.action === 'delete') {
            const res = await fetch(`${this.getBaseUrl()}/api/${item.store}/${item.payload}`, {
              method: 'DELETE',
              headers: this.getHeaders()
            });
            if (res.ok || res.status === 404) {
              await this.dequeueSync(item.id);
            } else if (res.status === 401 || res.status === 403) {
              this.handleSessionExpired();
              break;
            } else {
              break;
            }
          }
        } catch (netErr) {
          // Si falló la red, detener procesamiento para reintentar cuando se restablezca
          this.isServerOnline = false;
          break;
        }
      }
    } catch (err) {
      console.warn("Aviso procesando cola de sincronización:", err);
    } finally {
      this.isSyncingQueue = false;
    }
  }

  async put<T extends { id?: string }>(storeName: string, item: T): Promise<void> {
    if (!item || !item.id) return;

    // 1. Guardar localmente primero SIEMPRE (inmediato, < 1ms)
    try {
      const store = await this.getStore(storeName, 'readwrite');
      await new Promise<void>((resolve, reject) => {
        const request = store.put(item);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      // Si el elemento había sido marcado como eliminado anteriormente, quitar de tombstones
      await this.removeTombstone(storeName, item.id);
    } catch (e) {
      console.warn(`Error guardando localmente en ${storeName}:`, e);
    }

    // 2. Si hay conexión al servidor, intentar sincronizar de inmediato
    if (!this.isLocalMode() && this.isServerOnline) {
      fetch(`${this.getBaseUrl()}/api/${storeName}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(item)
      }).then(res => {
        if (!res.ok && res.status !== 401 && res.status !== 403) {
          // Encolar si el servidor devolvió un error recuperable
          this.enqueueSync({
            id: `put_${storeName}_${item.id}`,
            store: storeName,
            action: 'put',
            payload: item,
            timestamp: Date.now(),
            retries: 0
          });
        }
      }).catch(() => {
        this.enqueueSync({
          id: `put_${storeName}_${item.id}`,
          store: storeName,
          action: 'put',
          payload: item,
          timestamp: Date.now(),
          retries: 0
        });
      });
    } else if (!this.isLocalMode()) {
      // Encolar para cuando se recupere la conexión
      this.enqueueSync({
        id: `put_${storeName}_${item.id}`,
        store: storeName,
        action: 'put',
        payload: item,
        timestamp: Date.now(),
        retries: 0
      });
    }
  }

  async putMany<T extends { id?: string }>(storeName: string, items: T[]): Promise<void> {
    if (!items || items.length === 0) return;

    // Guardar en IndexedDB localmente de forma atómica
    try {
      await this.init();
      if (this.db && this.db.objectStoreNames.contains(storeName)) {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        for (const item of items) {
          store.put(item);
          if (item && item.id) {
            this.removeTombstone(storeName, item.id);
          }
        }
      }
    } catch (e) {
      console.warn(`Error guardando lote en ${storeName}:`, e);
    }

    // Sincronizar en segundo plano si hay servidor
    if (!this.isLocalMode() && this.isServerOnline) {
      fetch(`${this.getBaseUrl()}/api/${storeName}/bulk`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(items)
      }).catch(() => {
        items.forEach(item => {
          if (item && item.id) {
            this.enqueueSync({
              id: `put_${storeName}_${item.id}`,
              store: storeName,
              action: 'put',
              payload: item,
              timestamp: Date.now(),
              retries: 0
            });
          }
        });
      });
    } else if (!this.isLocalMode()) {
      items.forEach(item => {
        if (item && item.id) {
          this.enqueueSync({
            id: `put_${storeName}_${item.id}`,
            store: storeName,
            action: 'put',
            payload: item,
            timestamp: Date.now(),
            retries: 0
          });
        }
      });
    }
  }

  async batch(operations: Array<{ store: string; items: any[] }>): Promise<void> {
    if (!operations || operations.length === 0) return;

    // Guardar localmente
    try {
      await this.init();
      if (this.db) {
        operations.forEach(op => {
          if (this.db?.objectStoreNames.contains(op.store) && Array.isArray(op.items)) {
            const tx = this.db.transaction(op.store, 'readwrite');
            const store = tx.objectStore(op.store);
            op.items.forEach(item => store.put(item));
          }
        });
      }
    } catch (e) {
      console.warn("Error guardando lote local:", e);
    }

    // Enviar en segundo plano al backend
    if (!this.isLocalMode() && this.isServerOnline) {
      fetch(`${this.getBaseUrl()}/api/batch`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(operations)
      }).catch(() => {});
    }
  }

  async delete(storeName: string, id: string): Promise<void> {
    // 1. Eliminar localmente primero y registrar lápida (tombstone)
    try {
      const store = await this.getStore(storeName, 'readwrite');
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      await this.recordTombstone(storeName, id);
    } catch (e) {
      console.warn(`Error eliminando localmente de ${storeName}:`, e);
    }

    // 2. Sincronizar eliminación en segundo plano o encolar
    if (!this.isLocalMode() && this.isServerOnline) {
      fetch(`${this.getBaseUrl()}/api/${storeName}/${id}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      }).then(res => {
        if (!res.ok && res.status !== 404 && res.status !== 401 && res.status !== 403) {
          this.enqueueSync({
            id: `del_${storeName}_${id}`,
            store: storeName,
            action: 'delete',
            payload: id,
            timestamp: Date.now(),
            retries: 0
          });
        }
      }).catch(() => {
        this.enqueueSync({
          id: `del_${storeName}_${id}`,
          store: storeName,
          action: 'delete',
          payload: id,
          timestamp: Date.now(),
          retries: 0
        });
      });
    } else if (!this.isLocalMode()) {
      this.enqueueSync({
        id: `del_${storeName}_${id}`,
        store: storeName,
        action: 'delete',
        payload: id,
        timestamp: Date.now(),
        retries: 0
      });
    }
  }

  async clearAllData(): Promise<void> {
    await this.init();
    if (!this.db) return;

    if (!this.isLocalMode() && this.isServerOnline) {
      fetch(`${this.getBaseUrl()}/api/system/reset`, { 
        method: 'POST', 
        headers: this.getHeaders() 
      }).catch(() => {});
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(STORES, 'readwrite');
        STORES.forEach(storeName => {
          transaction.objectStore(storeName).clear();
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async exportBackup(): Promise<string> {
    await this.init();
    const BUSINESS_STORES = [
      'products', 'customers', 'suppliers', 'sales', 'purchases', 
      'settings', 'sellers', 'payments', 'expenses', 
      'movements', 'ingredients', 'recipes', 'promotions', 'customer_promotions'
    ];
    const backup: Record<string, any[]> = {};
    for (const storeName of BUSINESS_STORES) {
      let items = await this.getLocal(storeName);
      // Si local está vacío pero estamos conectados a un servidor backend (Termux), obtener del servidor
      if ((!items || items.length === 0) && !this.isLocalMode() && this.isServerOnline) {
        try {
          items = await this.getAll(storeName);
        } catch (e) {}
      }
      backup[storeName] = items || [];
    }
    return JSON.stringify(backup, null, 2);
  }

  async getBackupSummary(): Promise<{ totalRecords: number; details: string }> {
    await this.init();
    const BUSINESS_STORES = [
      'products', 'customers', 'suppliers', 'sales', 'purchases', 
      'settings', 'sellers', 'payments', 'expenses', 
      'movements', 'ingredients', 'recipes', 'promotions', 'customer_promotions'
    ];
    let totalRecords = 0;
    const parts: string[] = [];

    for (const storeName of BUSINESS_STORES) {
      const items = await this.getLocal(storeName);
      const count = items ? items.length : 0;
      totalRecords += count;
      if (count > 0) {
        parts.push(`${count} ${storeName}`);
      }
    }
    return {
      totalRecords,
      details: parts.slice(0, 4).join(', ') + (parts.length > 4 ? '...' : '')
    };
  }

  async importBackup(jsonString: string): Promise<{ success: boolean; totalRestored: number }> {
    const rawData = JSON.parse(jsonString);
    await this.init();
    if (!this.db) throw new Error("Base de datos no inicializada");

    const BUSINESS_STORES = [
      'products', 'customers', 'suppliers', 'sales', 'purchases', 
      'settings', 'sellers', 'payments', 'expenses', 
      'movements', 'ingredients', 'recipes', 'promotions', 'customer_promotions'
    ];

    // Soportar tanto formato directo { products: [...] } como empaquetado { data: ... }
    let data = rawData;
    if (rawData && !rawData.products && rawData.data) data = rawData.data;
    else if (rawData && !rawData.products && rawData.backup) data = rawData.backup;

    let totalRestored = 0;

    for (const storeName of BUSINESS_STORES) {
      if (Array.isArray(data[storeName])) {
        await new Promise<void>((resolve) => {
          try {
            const transaction = this.db!.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            store.clear();
            for (const item of data[storeName]) {
              store.put(item);
              totalRestored++;
            }
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => resolve();
          } catch (err) {
            resolve();
          }
        });

        // Si el backend en Termux/Servidor está online, replicar los registros
        if (!this.isLocalMode() && this.isServerOnline) {
          for (const item of data[storeName]) {
            if (item && item.id) {
              fetch(`${this.getBaseUrl()}/api/${storeName}`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(item)
              }).catch(() => {});
            }
          }
        }
      }
    }

    return { success: true, totalRestored };
  }
}

export const dbService = new DBService();
