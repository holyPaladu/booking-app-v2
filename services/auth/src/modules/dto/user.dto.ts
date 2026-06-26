import { t } from 'elysia'

export const userModels = {
  'user.get-by-id': t.Object({
    id: t.String({ format: 'uuid' })
  })
}