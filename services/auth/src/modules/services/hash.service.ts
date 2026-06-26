import { IHashService } from "@modules/ports/hash.port";
import { cfg } from "src/config";

export const hashService = (): IHashService => {
  const hashConfig = {
    algorithm: "argon2id",
    memoryCost: cfg.getNumber('argon_memory'),
    timeCost: cfg.getNumber('argon_time_cost'),
  } as const

  return {
    hash: (value) => Bun.password.hash(value, hashConfig),
    verify: (value, hash) => Bun.password.verify(value, hash),
  }
}