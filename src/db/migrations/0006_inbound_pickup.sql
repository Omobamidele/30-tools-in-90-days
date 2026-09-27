ALTER TYPE "public"."pickup_source" ADD VALUE 'EMAIL';--> statement-breakpoint
CREATE TABLE "pickup_inbound" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"clause_id" uuid NOT NULL,
	"token" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"allowed_sender_domain" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_received_at" timestamp with time zone,
	"last_result" jsonb
);
--> statement-breakpoint
ALTER TABLE "pickup_inbound" ADD CONSTRAINT "pickup_inbound_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_inbound" ADD CONSTRAINT "pickup_inbound_clause_id_clauses_id_fk" FOREIGN KEY ("clause_id") REFERENCES "public"."clauses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_inbound" ADD CONSTRAINT "pickup_inbound_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pickup_inbound_token_idx" ON "pickup_inbound" USING btree ("token");--> statement-breakpoint
CREATE INDEX "pickup_inbound_clause_idx" ON "pickup_inbound" USING btree ("clause_id");