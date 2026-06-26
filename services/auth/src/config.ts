import { createConfigService } from '@booking/shared'

// Схема — ключи объекта это то, по чему ты делаешь .get()
// key — это имя переменной окружения
export const cfg = createConfigService({
  db_url: { key: 'DB_URL', required: true },
  jwt_secret: { key: 'JWT_SECRET', required: true },
  jwt_expiry: { key: 'JWT_EXPIRY', default: '15m' },
  port: { key: 'PORT', default: '3000' },
  node_env: { key: 'NODE_ENV', default: 'development' },
  argon_memory: { key: 'ARGON_MEMORY', default: '65536' },
  argon_time_cost: { key: 'ARGON_TIME_COST', default: '3' },
  outbox_poll_ms: { key: 'OUTBOX_POLL_MS', default: '2000' },
})
