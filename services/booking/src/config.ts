import { createConfigService } from '@booking/shared'

export const cfg = createConfigService({
  db_url: { key: 'DB_URL', required: true },
  jwt_secret: { key: 'JWT_SECRET', required: true },
  port: { key: 'PORT', default: '3001' },
  node_env: { key: 'NODE_ENV', default: 'development' },
})
