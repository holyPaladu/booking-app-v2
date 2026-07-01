import { AsyncLocalStorage } from 'node:async_hooks'
import { type SqlClient, type TxClient, withTransaction } from '@booking/shared'

// Исполнитель SQL: либо пул, либо активная транзакция.
export type Executor = SqlClient | TxClient

// Ambient-провайдер executor'а: репо в начале метода зовут `const sql = db()` и
// получают текущий tx (если код исполняется внутри `runTx`) или базовый пул, затем
// пишут запрос как `sql\`...\``. Никакого протаскивания `exec`/`tx` по слоям.
export type Db = () => Executor

// Граница транзакции: всё, что вызвано внутри `work()` — по любой цепочке
// service→service→repo — видит один и тот же tx через ambient-контекст.
export type TxRunner = <T>(work: () => Promise<T>) => Promise<T>

// Создаёт связку { db, runTx } поверх `sql`. Контекст транзакции живёт в
// AsyncLocalStorage: `runTx` кладёт tx в стор на время `work`, `db()` его читает.
export function createTx(sql: SqlClient): { db: Db; runTx: TxRunner } {
  const store = new AsyncLocalStorage<TxClient>()

  const db: Db = () => store.getStore() ?? sql

  const runTx: TxRunner = <T>(work: () => Promise<T>) =>
    withTransaction(sql, (tx) => store.run(tx, work)) as Promise<T>

  return { db, runTx }
}
