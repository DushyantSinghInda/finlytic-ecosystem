-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "provider_message_id" TEXT NOT NULL,
    "provider_thread_id" TEXT,
    "subject" TEXT,
    "from_address" TEXT,
    "from_name" TEXT,
    "to_addresses" TEXT[],
    "sent_at" TIMESTAMPTZ(3) NOT NULL,
    "snippet" TEXT,
    "labels" TEXT[],
    "size_bytes" INTEGER,
    "has_attachments" BOOLEAN NOT NULL DEFAULT false,
    "raw_object_key" TEXT NOT NULL,
    "body_text_key" TEXT,
    "ingested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_account_id_sent_at_idx" ON "messages"("account_id", "sent_at");

-- CreateIndex
CREATE INDEX "messages_from_address_idx" ON "messages"("from_address");

-- CreateIndex
CREATE UNIQUE INDEX "messages_account_id_provider_message_id_key" ON "messages"("account_id", "provider_message_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "mail_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
