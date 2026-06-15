-- CreateTable: pf_budget
CREATE TABLE "pf_budget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "group" TEXT NOT NULL,
    "subgroup" TEXT NOT NULL,
    "planned" DECIMAL(12,2) NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "pf_budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable: pf_transaction
CREATE TABLE "pf_transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "group" TEXT NOT NULL,
    "subgroup" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pf_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable: pf_savings_bucket
CREATE TABLE "pf_savings_bucket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pf_savings_bucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable: pf_savings_entry
CREATE TABLE "pf_savings_entry" (
    "id" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pf_savings_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pf_budget_userId_year_month_group_subgroup_key" ON "pf_budget"("userId", "year", "month", "group", "subgroup");
CREATE INDEX "pf_budget_userId_year_month_idx" ON "pf_budget"("userId", "year", "month");

CREATE INDEX "pf_transaction_userId_date_idx" ON "pf_transaction"("userId", "date");
CREATE INDEX "pf_transaction_userId_group_idx" ON "pf_transaction"("userId", "group");

CREATE INDEX "pf_savings_bucket_userId_idx" ON "pf_savings_bucket"("userId");

CREATE INDEX "pf_savings_entry_bucketId_idx" ON "pf_savings_entry"("bucketId");
CREATE INDEX "pf_savings_entry_userId_date_idx" ON "pf_savings_entry"("userId", "date");

-- AddForeignKey
ALTER TABLE "pf_budget" ADD CONSTRAINT "pf_budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pf_transaction" ADD CONSTRAINT "pf_transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pf_savings_bucket" ADD CONSTRAINT "pf_savings_bucket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pf_savings_entry" ADD CONSTRAINT "pf_savings_entry_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "pf_savings_bucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pf_savings_entry" ADD CONSTRAINT "pf_savings_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
