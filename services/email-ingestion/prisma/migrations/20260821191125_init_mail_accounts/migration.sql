-- CreateEnum
CREATE TYPE "mail_provider" AS ENUM ('GMAIL', 'ZOHO');

-- CreateEnum
CREATE TYPE "account_status" AS ENUM ('ACTIVE', 'REAUTH_REQUIRED', 'DISABLED');

-- CreateTable
CREATE TABLE "mail_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "mail_provider" NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "email_address" TEXT NOT NULL,
    "status" "account_status" NOT NULL DEFAULT 'ACTIVE',
    "access_token_enc" TEXT NOT NULL,
    "access_token_expires" TIMESTAMPTZ(3) NOT NULL,
    "refresh_token_enc" TEXT,
    "scopes" TEXT[],
    "sync_cursor" TEXT,
    "last_synced_at" TIMESTAMPTZ(3),
    "last_sync_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mail_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mail_accounts_user_id_idx" ON "mail_accounts"("user_id");

-- CreateIndex
CREATE INDEX "mail_accounts_status_idx" ON "mail_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "mail_accounts_user_id_provider_provider_account_id_key" ON "mail_accounts"("user_id", "provider", "provider_account_id");
