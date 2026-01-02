// キャッシュのポート（インターフェース）
// 将来Redisなどに置き換え可能なように、インターフェースを定義

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

