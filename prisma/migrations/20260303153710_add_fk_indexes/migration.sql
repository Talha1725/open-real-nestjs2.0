-- CreateIndex
CREATE INDEX "distributions_tenant_id_idx" ON "distributions"("tenant_id");

-- CreateIndex
CREATE INDEX "distributions_holding_id_idx" ON "distributions"("holding_id");

-- CreateIndex
CREATE INDEX "holdings_tenant_id_idx" ON "holdings"("tenant_id");

-- CreateIndex
CREATE INDEX "holdings_user_id_idx" ON "holdings"("user_id");

-- CreateIndex
CREATE INDEX "holdings_opportunity_id_idx" ON "holdings"("opportunity_id");

-- CreateIndex
CREATE INDEX "holdings_investment_request_id_idx" ON "holdings"("investment_request_id");

-- CreateIndex
CREATE INDEX "investment_requests_user_id_idx" ON "investment_requests"("user_id");

-- CreateIndex
CREATE INDEX "investment_requests_opportunity_id_idx" ON "investment_requests"("opportunity_id");

-- CreateIndex
CREATE INDEX "issuer_orgs_tenant_id_idx" ON "issuer_orgs"("tenant_id");

-- CreateIndex
CREATE INDEX "issuer_orgs_representative_user_id_idx" ON "issuer_orgs"("representative_user_id");

-- CreateIndex
CREATE INDEX "kyb_applications_tenant_id_idx" ON "kyb_applications"("tenant_id");

-- CreateIndex
CREATE INDEX "kyb_applications_issuer_org_id_idx" ON "kyb_applications"("issuer_org_id");

-- CreateIndex
CREATE INDEX "kyb_applications_reviewed_by_idx" ON "kyb_applications"("reviewed_by");

-- CreateIndex
CREATE INDEX "opportunities_tenant_id_idx" ON "opportunities"("tenant_id");

-- CreateIndex
CREATE INDEX "opportunities_issuer_org_id_idx" ON "opportunities"("issuer_org_id");

-- CreateIndex
CREATE INDEX "opportunities_reviewed_by_idx" ON "opportunities"("reviewed_by");

-- CreateIndex
CREATE INDEX "opportunity_documents_tenant_id_idx" ON "opportunity_documents"("tenant_id");

-- CreateIndex
CREATE INDEX "opportunity_documents_opportunity_id_idx" ON "opportunity_documents"("opportunity_id");

-- CreateIndex
CREATE INDEX "payment_instructions_tenant_id_idx" ON "payment_instructions"("tenant_id");

-- CreateIndex
CREATE INDEX "statements_tenant_id_idx" ON "statements"("tenant_id");

-- CreateIndex
CREATE INDEX "statements_holding_id_idx" ON "statements"("holding_id");

-- CreateIndex
CREATE INDEX "support_tickets_tenant_id_idx" ON "support_tickets"("tenant_id");

-- CreateIndex
CREATE INDEX "support_tickets_user_id_idx" ON "support_tickets"("user_id");

-- CreateIndex
CREATE INDEX "verifications_tenant_id_idx" ON "verifications"("tenant_id");

-- CreateIndex
CREATE INDEX "verifications_user_id_idx" ON "verifications"("user_id");

-- CreateIndex
CREATE INDEX "verifications_reviewed_by_idx" ON "verifications"("reviewed_by");
