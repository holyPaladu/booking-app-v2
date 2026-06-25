import type { ConfigSchema, InferConfig } from './config.types'

export class ConfigService<T extends ConfigSchema> {
  private readonly store: Map<string, string>

  constructor(schema: T) {
    this.store = new Map()
    this.load(schema)
  }

  private load(schema: T): void {
    const missing: string[] = []

    for (const [name, def] of Object.entries(schema)) {
      const value = Bun.env[def.key] ?? def.default

      if (value === undefined) {
        if (def.required !== false) {
          missing.push(def.key)
        }
        continue
      }

      this.store.set(name, value)
    }

    if (missing.length > 0) {
      throw new Error(`[ConfigService] Missing required env variables: ${missing.join(', ')}`)
    }
  }

  get<K extends keyof InferConfig<T>>(key: K): string {
    const value = this.store.get(key as string)
    if (value === undefined) {
      throw new Error(`[ConfigService] Key "${String(key)}" not found`)
    }
    return value
  }

  getNumber<K extends keyof InferConfig<T>>(key: K): number {
    return Number(this.get(key))
  }

  getBoolean<K extends keyof InferConfig<T>>(key: K): boolean {
    return this.get(key) === 'true'
  }

  // для дебага
  toObject(): Record<string, string> {
    return Object.fromEntries(this.store)
  }
}

export function createConfigService<T extends ConfigSchema>(schema: T): ConfigService<T> {
  return new ConfigService(schema)
}
