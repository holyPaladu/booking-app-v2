import { createConfigService } from '@booking/shared'

// Схема — ключи объекта это то, по чему ты делаешь .get()
// key — это имя переменной окружения
export const cfg = createConfigService({
  db_url: { key: 'DB_URL', required: true },
  jwt_secret: { key: 'JWT_SECRET', required: true },
  jwt_expiry: { key: 'JWT_EXPIRY', default: '15m' },
  refresh_ttl_days: { key: 'REFRESH_TTL_DAYS', default: '30' },
  port: { key: 'PORT', default: '3000' },
  node_env: { key: 'NODE_ENV', default: 'development' },
  argon_memory: { key: 'ARGON_MEMORY', default: '65536' },
  argon_time_cost: { key: 'ARGON_TIME_COST', default: '3' },
  outbox_poll_ms: { key: 'OUTBOX_POLL_MS', default: '2000' },

  // 2FA (TOTP). enc_key — base64 от 32 байт (AES-256) для шифрования секрета в покое.
  two_factor_enc_key: { key: 'TWO_FACTOR_ENC_KEY', required: true },
  two_factor_issuer: { key: 'TWO_FACTOR_ISSUER', default: 'BookingApp' },
  two_factor_window: { key: 'TWO_FACTOR_WINDOW', default: '1' },
  recovery_codes_count: { key: 'RECOVERY_CODES_COUNT', default: '10' },
  two_factor_challenge_ttl: { key: 'TWO_FACTOR_CHALLENGE_TTL', default: '5m' },
})
