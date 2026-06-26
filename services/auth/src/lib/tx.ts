import type { SqlClient, TxClient } from '@booking/shared'

// Исполнитель SQL: либо обычный клиент, либо транзакция. Repo-методы принимают
// его опционально — по умолчанию закрытый в фабрике `sql`, в транзакции — `tx`.
export type Executor = SqlClient | TxClient

// Граница транзакции как порт: прод — withTransaction(sql, ...), тест — pass-through.
export type TxRunner = <T>(work: (tx: Executor) => Promise<T>) => Promise<T>
