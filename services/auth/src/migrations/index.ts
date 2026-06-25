import type { SqlClient } from '@booking/shared'
import { type Migration, applyMigrations } from '@booking/shared'

export function runMigrations(sql: SqlClient): Promise<void> {
  return applyMigrations(sql, MIGRATIONS)
}

const MIGRATIONS: Migration[] = [
  {
    version: '001_create_users',
    up: async (sql) => {
      await sql`
          CREATE TYPE user_status AS ENUM (
            'active',
            'inactive',
            'banned',
            'pending_verification'
          )
        `

      await sql`
          CREATE TABLE users (
            id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
            email           VARCHAR(255) NOT NULL,
            email_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
            phone           VARCHAR(20),
            phone_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
            password_hash   TEXT         NOT NULL,
            status          user_status  NOT NULL DEFAULT 'pending_verification',
            banned_reason   TEXT,
            banned_at       TIMESTAMPTZ,
            banned_by       UUID,
            token_version   INTEGER      NOT NULL DEFAULT 0,
            deleted_at      TIMESTAMPTZ,
            deleted_by      UUID,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

            CONSTRAINT users_email_format CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
            CONSTRAINT users_phone_format CHECK (phone IS NULL OR phone ~ '^\+[1-9]\d{6,14}$')
          )
        `

      await sql`
          CREATE UNIQUE INDEX idx_users_email_active
              ON users (email) WHERE deleted_at IS NULL
        `
      await sql`
          CREATE UNIQUE INDEX idx_users_phone_active
              ON users (phone) WHERE deleted_at IS NULL AND phone IS NOT NULL
        `
      await sql`CREATE INDEX idx_users_status     ON users (status)`
      await sql`CREATE INDEX idx_users_deleted_at ON users (deleted_at) WHERE deleted_at IS NOT NULL`
    },
  },

  {
    version: '002_create_rbac',
    up: async (sql) => {
      await sql`
          CREATE TABLE permissions (
            id          SERIAL      PRIMARY KEY,
            action      VARCHAR(50) NOT NULL,
            resource    VARCHAR(50) NOT NULL,
            description TEXT,

            CONSTRAINT permissions_unique UNIQUE (action, resource)
          )
        `
      await sql`
          CREATE TABLE roles (
            id          SERIAL      PRIMARY KEY,
            name        VARCHAR(50) NOT NULL,
            description TEXT,
            is_default  BOOLEAN     NOT NULL DEFAULT FALSE,

            CONSTRAINT roles_name_unique UNIQUE (name)
          )
        `
      await sql`
          CREATE TABLE role_permissions (
            role_id       INTEGER NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
            permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,

            PRIMARY KEY (role_id, permission_id)
          )
        `
      await sql`
          CREATE TABLE user_roles (
            user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role_id    INTEGER     NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            granted_by UUID        REFERENCES users(id) ON DELETE SET NULL,

            PRIMARY KEY (user_id, role_id)
          )
        `
      await sql`CREATE INDEX idx_user_roles_user_id       ON user_roles (user_id)`
      await sql`CREATE INDEX idx_role_permissions_role_id ON role_permissions (role_id)`

      await sql`
          INSERT INTO permissions (action, resource, description) VALUES
            ('*',      '*',        'Full access to everything'),
            ('read',   '*',        'Read access to all resources'),
            ('create', 'bookings', 'Create bookings'),
            ('read',   'bookings', 'Read bookings'),
            ('update', 'bookings', 'Update bookings'),
            ('delete', 'bookings', 'Delete bookings'),
            ('create', 'rooms',    'Create rooms'),
            ('read',   'rooms',    'Read rooms'),
            ('update', 'rooms',    'Update rooms'),
            ('delete', 'rooms',    'Delete rooms'),
            ('ban',    'users',    'Ban and unban users'),
            ('read',   'users',    'Read user profiles'),
            ('delete', 'users',    'Delete user accounts'),
            ('manage', 'roles',    'Grant and revoke roles')
        `

      await sql`
          INSERT INTO roles (name, description, is_default) VALUES
            ('user',      'Default role assigned on registration', TRUE),
            ('moderator', 'Can moderate content and manage users',  FALSE),
            ('admin',     'Full platform access',                   FALSE)
        `

      await sql`
          INSERT INTO role_permissions (role_id, permission_id)
          SELECT r.id, p.id FROM roles r
          CROSS JOIN permissions p
          WHERE
            (r.name = 'user'      AND p.action = 'read' AND p.resource = '*')       OR
            (r.name = 'moderator' AND p.action = 'read' AND p.resource = '*')       OR
            (r.name = 'moderator' AND p.action = 'ban'  AND p.resource = 'users')   OR
            (r.name = 'moderator' AND p.action = 'read' AND p.resource = 'users')   OR
            (r.name = 'admin'     AND p.action = '*'    AND p.resource = '*')
        `
    },
  },

  {
    version: '003_create_sessions',
    up: async (sql) => {
      await sql`
          CREATE TABLE sessions (
            id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            refresh_token_hash TEXT        NOT NULL,
            token_version      INTEGER     NOT NULL,
            user_agent         TEXT,
            ip_address         INET,
            device_name        VARCHAR(100),
            expires_at         TIMESTAMPTZ NOT NULL,
            last_used_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT sessions_token_hash_unique UNIQUE (refresh_token_hash)
          )
        `
      await sql`CREATE INDEX idx_sessions_user_id    ON sessions (user_id)`
      await sql`CREATE INDEX idx_sessions_expires_at ON sessions (expires_at)`
    },
  },

  {
    version: '004_create_verification_tokens',
    up: async (sql) => {
      await sql`
          CREATE TYPE verification_type AS ENUM (
            'email_confirm',
            'phone_confirm',
            'password_reset',
            'two_factor_setup'
          )
        `
      await sql`
          CREATE TYPE verification_channel AS ENUM (
            'email',
            'sms'
          )
        `
      await sql`
          CREATE TABLE verification_tokens (
            id           UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id      UUID                 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type         verification_type    NOT NULL,
            channel      verification_channel NOT NULL,
            identifier   VARCHAR(255)         NOT NULL,
            token_hash   TEXT                 NOT NULL,
            attempts     SMALLINT             NOT NULL DEFAULT 0,
            max_attempts SMALLINT             NOT NULL DEFAULT 5,
            used         BOOLEAN              NOT NULL DEFAULT FALSE,
            used_at      TIMESTAMPTZ,
            expires_at   TIMESTAMPTZ          NOT NULL,
            created_at   TIMESTAMPTZ          NOT NULL DEFAULT NOW(),

            CONSTRAINT vt_token_hash_unique UNIQUE (token_hash),
            CONSTRAINT vt_used_consistency CHECK (
              (used = FALSE AND used_at IS NULL) OR
              (used = TRUE  AND used_at IS NOT NULL)
            )
          )
        `
      await sql`CREATE INDEX idx_vt_user_id    ON verification_tokens (user_id)`
      await sql`CREATE INDEX idx_vt_type       ON verification_tokens (type)`
      await sql`CREATE INDEX idx_vt_expires_at ON verification_tokens (expires_at)`
      await sql`
          CREATE UNIQUE INDEX idx_vt_one_active_per_type
            ON verification_tokens (user_id, type)
            WHERE used = FALSE
        `
    },
  },

  {
    version: '005_create_audit_log',
    up: async (sql) => {
      await sql`
          CREATE TYPE audit_event AS ENUM (
            'login_success',
            'login_failed',
            'logout',
            'token_refreshed',
            'password_changed',
            'password_reset_requested',
            'password_reset_completed',
            'email_verified',
            'phone_verified',
            'two_factor_enabled',
            'two_factor_disabled',
            'account_banned',
            'account_unbanned',
            'account_deleted',
            'role_granted',
            'role_revoked',
            'sessions_revoked_all'
          )
        `
      await sql`
          CREATE TABLE audit_log (
            id         BIGSERIAL   PRIMARY KEY,
            user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
            event      audit_event NOT NULL,
            ip_address INET,
            user_agent TEXT,
            metadata   JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `
      await sql`CREATE INDEX idx_audit_user_id    ON audit_log (user_id)`
      await sql`CREATE INDEX idx_audit_event      ON audit_log (event)`
      await sql`CREATE INDEX idx_audit_created_at ON audit_log (created_at DESC)`
      await sql`CREATE INDEX idx_audit_metadata   ON audit_log USING gin (metadata)`
    },
  },

  {
    version: '006_create_triggers',
    up: async (sql) => {
      await sql`
          CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
          BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
          END;
        $$ LANGUAGE plpgsql
        `
      await sql`
          CREATE TRIGGER trg_users_updated_at
          BEFORE UPDATE ON users
          FOR EACH ROW EXECUTE FUNCTION set_updated_at()
        `
    },
  },

  {
    version: '007_create_two_factor',
    up: async (sql) => {
      await sql`
        CREATE TABLE two_factor_secrets (
          user_id     UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          secret_enc  TEXT        NOT NULL,           -- encrypted TOTP secret
          enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
          confirmed_at TIMESTAMPTZ,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      await sql`
        CREATE TABLE two_factor_recovery_codes (
          id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          code_hash  TEXT        NOT NULL,
          used_at    TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT tfrc_code_hash_unique UNIQUE (code_hash)
        )
      `
      await sql`CREATE INDEX idx_tfrc_user_id ON two_factor_recovery_codes (user_id)`
      await sql`
        CREATE TRIGGER trg_2fa_updated_at
        BEFORE UPDATE ON two_factor_secrets
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
      `
    },
  },

  {
    version: '008_create_login_attempts',
    up: async (sql) => {
      await sql`
        CREATE TABLE login_attempts (
          id         BIGSERIAL   PRIMARY KEY,
          identifier VARCHAR(255) NOT NULL,  -- email or phone tried
          ip_address INET,
          success    BOOLEAN     NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      // window lookups for throttling: "failed attempts for X in last N minutes"
      await sql`CREATE INDEX idx_login_attempts_identifier ON login_attempts (identifier, created_at DESC)`
      await sql`CREATE INDEX idx_login_attempts_ip         ON login_attempts (ip_address, created_at DESC)`
    },
  },
]