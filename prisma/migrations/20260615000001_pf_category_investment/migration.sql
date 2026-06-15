-- CreateTable: pf_category
CREATE TABLE "pf_category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "subgroup" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL DEFAULT '#64748B',
    CONSTRAINT "pf_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable: pf_investment
CREATE TABLE "pf_investment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "horizon" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currentValue" DECIMAL(12,2) NOT NULL,
    "rate" DECIMAL(8,4),
    "rateIndex" TEXT,
    "liquidity" TEXT NOT NULL DEFAULT 'no_vencimento',
    "riskLevel" TEXT NOT NULL DEFAULT 'moderado',
    "purchaseDate" DATE NOT NULL,
    "maturityDate" DATE,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pf_investment_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "pf_category_userId_group_subgroup_key" ON "pf_category"("userId", "group", "subgroup");
CREATE INDEX "pf_category_userId_group_idx" ON "pf_category"("userId", "group");
CREATE INDEX "pf_investment_userId_horizon_idx" ON "pf_investment"("userId", "horizon");
CREATE INDEX "pf_investment_userId_idx" ON "pf_investment"("userId");

-- ForeignKeys
ALTER TABLE "pf_category" ADD CONSTRAINT "pf_category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pf_investment" ADD CONSTRAINT "pf_investment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
