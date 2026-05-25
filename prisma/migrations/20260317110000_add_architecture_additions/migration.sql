-- Story 2.3: New Roles
-- Add new role values to UserRole enum (idempotent check)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SPV_MANAGER' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'UserRole')) THEN
    ALTER TYPE "UserRole" ADD VALUE 'SPV_MANAGER';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SETTLEMENT_OPS' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'UserRole')) THEN
    ALTER TYPE "UserRole" ADD VALUE 'SETTLEMENT_OPS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MARKET_OPS' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'UserRole')) THEN
    ALTER TYPE "UserRole" ADD VALUE 'MARKET_OPS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'COMPLIANCE_OFFICER' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'UserRole')) THEN
    ALTER TYPE "UserRole" ADD VALUE 'COMPLIANCE_OFFICER';
  END IF;
END $$;

-- Story 2.1: Instrument-Level Feature Config
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "feature_config" JSONB;

-- Story 2.2: Market Layer Enums
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT', 'RFQ');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_CHECKS', 'OPEN', 'MATCHED', 'PARTIALLY_FILLED', 'CANCELLED', 'ORDER_REJECTED', 'ORDER_EXPIRED');
CREATE TYPE "TradeStatus" AS ENUM ('TRADE_PENDING', 'SETTLING', 'SETTLED', 'TRADE_FAILED');
CREATE TYPE "SettlementStatus" AS ENUM ('SETTLEMENT_PENDING', 'PROCESSING', 'SETTLEMENT_COMPLETED', 'SETTLEMENT_FAILED');

-- Story 2.2: Orders table
CREATE TABLE "orders" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "type" "OrderType" NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "price" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_CHECKS',
    "filled_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- Story 2.2: Trades table
CREATE TABLE "trades" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "buy_order_id" TEXT NOT NULL,
    "sell_order_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "TradeStatus" NOT NULL DEFAULT 'TRADE_PENDING',
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- Story 2.2: Settlement records table
CREATE TABLE "settlement_records" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "trade_id" TEXT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'SETTLEMENT_PENDING',
    "dvp_completed" BOOLEAN NOT NULL DEFAULT false,
    "fail_reason" TEXT,
    "completed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "settlement_records_pkey" PRIMARY KEY ("id")
);

-- Story 2.2: Liquidity config table
CREATE TABLE "liquidity_configs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'none',
    "min_order_size" DECIMAL(18,6),
    "max_order_size" DECIMAL(18,6),
    "tick_size" DECIMAL(18,6),
    "trading_window_start" TEXT,
    "trading_window_end" TEXT,
    "allowed_countries" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "liquidity_configs_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "settlement_records_trade_id_key" ON "settlement_records"("trade_id");
CREATE UNIQUE INDEX "liquidity_configs_opportunity_id_key" ON "liquidity_configs"("opportunity_id");

-- Indexes for orders
CREATE INDEX "orders_tenant_id_idx" ON "orders"("tenant_id");
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");
CREATE INDEX "orders_opportunity_id_idx" ON "orders"("opportunity_id");
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- Indexes for trades
CREATE INDEX "trades_tenant_id_idx" ON "trades"("tenant_id");
CREATE INDEX "trades_opportunity_id_idx" ON "trades"("opportunity_id");
CREATE INDEX "trades_status_idx" ON "trades"("status");

-- Indexes for settlement_records
CREATE INDEX "settlement_records_tenant_id_idx" ON "settlement_records"("tenant_id");
CREATE INDEX "settlement_records_status_idx" ON "settlement_records"("status");

-- Indexes for liquidity_configs
CREATE INDEX "liquidity_configs_tenant_id_idx" ON "liquidity_configs"("tenant_id");

-- Foreign keys for orders
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys for trades
ALTER TABLE "trades" ADD CONSTRAINT "trades_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trades" ADD CONSTRAINT "trades_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trades" ADD CONSTRAINT "trades_buy_order_id_fkey" FOREIGN KEY ("buy_order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trades" ADD CONSTRAINT "trades_sell_order_id_fkey" FOREIGN KEY ("sell_order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys for settlement_records
ALTER TABLE "settlement_records" ADD CONSTRAINT "settlement_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_records" ADD CONSTRAINT "settlement_records_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys for liquidity_configs
ALTER TABLE "liquidity_configs" ADD CONSTRAINT "liquidity_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "liquidity_configs" ADD CONSTRAINT "liquidity_configs_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
