CREATE INDEX "obligations_contract_idx" ON "obligations" USING btree ("contract_id","kind");--> statement-breakpoint
CREATE INDEX "payments_obligation_idx" ON "payments" USING btree ("obligation_id");