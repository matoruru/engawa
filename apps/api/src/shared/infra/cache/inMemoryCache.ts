// インメモリキャッシュの実装
import type { CacheStore } from "./cachePort";

type CacheEntry<T> = {
  value: T;
  expiresAt: number | null;
};

export const makeInMemoryCache = (): CacheStore => {
  const store = new Map<string, CacheEntry<unknown>>();

  // 期限切れエントリを定期的にクリーンアップ
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt !== null && entry.expiresAt < now) {
        store.delete(key);
      }
    }
  }, 60000); // 1分ごとにクリーンアップ

  return {
    get: async <T>(key: string): Promise<T | null> => {
      const entry = store.get(key);
      if (!entry) return null;

      // 期限切れチェック
      if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }

      return entry.value as T;
    },

    set: async <T>(
      key: string,
      value: T,
      ttlSeconds?: number,
    ): Promise<void> => {
      const expiresAt =
        ttlSeconds !== undefined
          ? Date.now() + ttlSeconds * 1000
          : null;

      store.set(key, { value, expiresAt });
    },

    delete: async (key: string): Promise<void> => {
      store.delete(key);
    },

    clear: async (): Promise<void> => {
      store.clear();
    },
  };
};

