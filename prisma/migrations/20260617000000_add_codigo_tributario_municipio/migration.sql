-- AlterTable: add NFS-e GINFES-specific fields to ServiceFiscalRule
-- Table is mapped to "regras_fiscais_servico" via @@map in schema.prisma
ALTER TABLE "regras_fiscais_servico" ADD COLUMN IF NOT EXISTS "codigoTributarioMunicipio" TEXT;
ALTER TABLE "regras_fiscais_servico" ADD COLUMN IF NOT EXISTS "regimeEspecialTributacao" INTEGER;
