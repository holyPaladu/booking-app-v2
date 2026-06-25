export type ConfigSchema = Record<
  string,
  {
    key: string // env variable name
    default?: string
    required?: boolean
  }
>

// Из схемы извлекаем ключи для типизации
export type InferConfig<T extends ConfigSchema> = {
  [K in keyof T]: string
}
