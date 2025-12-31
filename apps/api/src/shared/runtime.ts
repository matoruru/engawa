/**
 * Runtime環境判定ユーティリティ
 *
 * NOTE:
 * env.NODE_ENV は import 時に固定されてしまうため、テスト内の一時変更が効かない。
 * ここは runtime で評価される process.env を直接参照する。
 *
 * テスト環境でも開発用機能を使えるように、NODE_ENV が未設定または "test" の場合も開発環境として扱う。
 */
export const isDevRuntime = (): boolean => {
  const nodeEnv = process.env.NODE_ENV;
  return nodeEnv === "development" || nodeEnv === undefined || nodeEnv === "test";
};
