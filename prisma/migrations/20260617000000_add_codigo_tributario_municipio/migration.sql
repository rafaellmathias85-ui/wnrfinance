-- AlterTable: add NFS-e GINFES-specific fields to ServiceFiscalRule
ALTER TABLE "ServiceFiscalRule" ADD COLUMN "codigoTributarioMunicipio" TEXT;
ALTER TABLE "ServiceFiscalRule" ADD COLUMN "regimeEspecialTributacao" INTEGER;
