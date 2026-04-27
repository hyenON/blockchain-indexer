-- CreateTable
CREATE TABLE "chains" (
    "chain_id" INTEGER NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "finality_depth" INTEGER NOT NULL,

    CONSTRAINT "chains_pkey" PRIMARY KEY ("chain_id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "number" BIGINT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "hash" VARCHAR(66) NOT NULL,
    "parent_hash" VARCHAR(66) NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "gas_used" BIGINT NOT NULL,
    "gas_limit" BIGINT NOT NULL,
    "base_fee_per_gas" BIGINT NOT NULL,
    "is_reorged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("number","chain_id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "hash" VARCHAR(66) NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "block_number" BIGINT NOT NULL,
    "block_hash" VARCHAR(66) NOT NULL,
    "from_address" VARCHAR(42) NOT NULL,
    "to_address" VARCHAR(42),
    "value" DECIMAL(78,0) NOT NULL,
    "gas" BIGINT NOT NULL,
    "input" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "transaction_index" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "token_transfers" (
    "id" BIGSERIAL NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "tx_hash" VARCHAR(66) NOT NULL,
    "block_number" BIGINT NOT NULL,
    "contract_address" VARCHAR(42) NOT NULL,
    "from_address" VARCHAR(42) NOT NULL,
    "to_address" VARCHAR(42) NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "log_index" INTEGER NOT NULL,

    CONSTRAINT "token_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs" (
    "id" BIGSERIAL NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "tx_hash" VARCHAR(66) NOT NULL,
    "block_number" BIGINT NOT NULL,
    "contract_address" VARCHAR(42) NOT NULL,
    "topic0" VARCHAR(66) NOT NULL,
    "data" TEXT NOT NULL,
    "log_index" INTEGER NOT NULL,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_status" (
    "id" BIGSERIAL NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "last_synced_block" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "error_message" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_status_pkey" PRIMARY KEY ("id")
);
