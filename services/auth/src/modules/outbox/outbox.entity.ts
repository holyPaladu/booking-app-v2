// Задание на доставку внешнего side-effect (письмо). Пишется в ТУ ЖЕ транзакцию,
// что и регистрация, — воркер разбирает его после коммита.
export type OutboxJob = {
  topic: string
  payload: Record<string, unknown>
}

export type OutboxRow = {
  id: string
  topic: string
  payload: Record<string, unknown>
}
