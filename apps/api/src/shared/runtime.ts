/**
 * Runtime環境判定ユーティリティ
 *
 * NOTE:
 * env.NODE_ENV は import 時に固定されてしまうため、テスト内の一時変更が効かない。
 * ここは runtime で評価される process.env を直接参照する。
 */
export const isProdRuntime = (): boolean =>
  process.env.NODE_ENV === "production" || process.env.NODE_ENV === undefined;
