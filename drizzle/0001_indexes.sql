CREATE INDEX "enrollments_class_idx" ON "enrollments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "module_progress_module_idx" ON "module_progress" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "submissions_module_idx" ON "submissions" USING btree ("module_id");