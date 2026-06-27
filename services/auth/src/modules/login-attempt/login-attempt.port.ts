import type { Executor } from '@lib/tx'

export type ILoginAttemptRepo = {
  record(
    identifier: string,
    ipAddress: string | null,
    success: boolean,
    exec?: Executor,
  ): Promise<void>
  countRecent(identifier: string, windowMs: number, exec?: Executor): Promise<number>
  countRecentByIp(ipAddress: string, windowMs: number, exec?: Executor): Promise<number>
}

export type ILoginAttemptService = {
  record(
    identifier: string,
    ipAddress: string | null,
    success: boolean,
    exec?: Executor,
  ): Promise<void>
  checkLimit(identifier: string, ipAddress: string | null): Promise<void>
}
