export type IHashService = {
  hash: (value: string) => Promise<string>
  verify: (value: string, hash: string) => Promise<boolean>
}