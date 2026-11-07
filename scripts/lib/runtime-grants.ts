import type {PoolClient} from "pg";

/** Repeat the same runtime privileges after migrations in demo and isolated DBs. */
export async function grantRuntimePrivileges(client:Pick<PoolClient,"query">){
 await client.query("GRANT USAGE ON SCHEMA public TO rent2go_app");
 await client.query("GRANT SELECT,INSERT,UPDATE ON app_actor,partner_application,agency,private_file,app_notification TO rent2go_app");
 await client.query("GRANT SELECT,INSERT ON partner_revision,partner_revision_file,partner_review,app_audit TO rent2go_app");
 await client.query("GRANT SELECT,INSERT,UPDATE ON app_request_budget TO rent2go_app");
 await client.query(`DO $$ BEGIN
  IF to_regclass('public.platform_policy') IS NOT NULL THEN GRANT SELECT,INSERT ON platform_policy_revision,platform_policy_command TO rent2go_app; GRANT SELECT,UPDATE ON platform_policy TO rent2go_app; END IF;
  IF to_regclass('public.governance_notification') IS NOT NULL THEN GRANT SELECT,INSERT ON governance_notification TO rent2go_app; END IF;
  IF to_regclass('public.account_governance_command') IS NOT NULL THEN GRANT SELECT,INSERT ON account_governance_command TO rent2go_app; END IF;
  IF to_regclass('public.privacy_case') IS NOT NULL THEN
   GRANT SELECT,INSERT ON privacy_case,privacy_case_event,privacy_case_command,account_governance_event TO rent2go_app;
   GRANT SELECT,INSERT,UPDATE ON privacy_case_state TO rent2go_app;
  END IF;
  IF to_regclass('public.background_worker') IS NOT NULL THEN
   GRANT SELECT,INSERT,UPDATE ON background_worker TO rent2go_app;
   GRANT SELECT,INSERT ON background_worker_run TO rent2go_app;
  END IF;
  IF to_regclass('public.platform_account') IS NOT NULL THEN
   GRANT SELECT,INSERT ON platform_account,platform_remittance_command,platform_remittance,platform_remittance_source,platform_remittance_cancel,platform_remittance_attempt,platform_remittance_review,platform_remittance_resolution,platform_remittance_receipt,platform_incoming_reference,platform_agency_credit,platform_credit_application,platform_credit_use,platform_credit_allocation,remittance_notification TO rent2go_app;
   GRANT UPDATE(version) ON platform_account TO rent2go_app;
  END IF;
  IF to_regclass('public.booking_closed_credit') IS NOT NULL THEN
   GRANT SELECT,INSERT ON booking_closed_credit_command,booking_closed_credit,booking_closed_credit_decision,booking_closed_credit_cancel,booking_closed_credit_post,booking_revenue_credit,booking_closed_refund_link TO rent2go_app;
  END IF;
  IF to_regclass('public.owner_account') IS NOT NULL THEN
   GRANT SELECT,INSERT ON owner_account,owner_withdrawal_command,owner_withdrawal,owner_withdrawal_decision,owner_withdrawal_cancel,owner_payout_attempt,owner_payout_resolution,owner_payout,owner_account_entry,finance_notification TO rent2go_app;
   GRANT UPDATE(version) ON owner_account TO rent2go_app;
   GRANT UPDATE(read_at) ON finance_notification TO rent2go_app;
  END IF;
  IF to_regclass('public.agency_outgoing_reference') IS NOT NULL THEN
   GRANT SELECT,INSERT ON agency_outgoing_reference TO rent2go_app;
  END IF;
  IF to_regclass('public.notification_read_receipt') IS NOT NULL THEN
   GRANT SELECT,INSERT ON vehicle_notification,notification_read_receipt TO rent2go_app;
  END IF;
  IF to_regclass('public.booking_ocr_job') IS NOT NULL THEN
   GRANT SELECT,INSERT ON booking_ocr_command,booking_ocr_consent,booking_ocr_job,booking_ocr_result,booking_ocr_review TO rent2go_app;
   GRANT UPDATE(dispatch_at,ended_at) ON booking_ocr_job TO rent2go_app;
  END IF;
  IF to_regclass('public.email_message') IS NOT NULL THEN
   GRANT SELECT,INSERT ON email_preference,email_message,email_attempt,email_result TO rent2go_app;
   GRANT UPDATE(email,enabled,version,updated_at) ON email_preference TO rent2go_app;
   GRANT UPDATE(dispatch_at) ON email_attempt TO rent2go_app;
   -- PostgreSQL row locks require an UPDATE privilege; the immutable trigger
   -- still rejects every actual update, including this identity column.
   GRANT UPDATE(id) ON email_message TO rent2go_app;
  END IF;
  IF to_regprocedure('public.rent2go_current_credential_digest(text)') IS NOT NULL THEN
   GRANT EXECUTE ON FUNCTION rent2go_current_credential_digest(text) TO rent2go_app;
  END IF;
  IF to_regclass('public.booking_assessment') IS NOT NULL THEN
   GRANT SELECT,INSERT ON booking_assessment_command,booking_assessment,booking_assessment_decision TO rent2go_app;
  END IF;
  IF to_regclass('public.booking_settlement') IS NOT NULL THEN
   GRANT SELECT,INSERT ON booking_settlement_command,booking_settlement,booking_settlement_decision,booking_settlement_payment_attempt,booking_financial_close,booking_revenue_entry TO rent2go_app;
  END IF;
  IF to_regclass('public.booking_owner_allocation_decision') IS NOT NULL THEN
   GRANT SELECT,INSERT ON booking_owner_allocation_command,booking_owner_allocation_decision TO rent2go_app;
  END IF;
  IF to_regclass('public.booking_refund_request') IS NOT NULL THEN
   GRANT SELECT,INSERT ON booking_refund_command,booking_refund_request,booking_refund_decision,booking_refund_cancel,booking_refund_attempt,booking_refund_resolution,booking_refund_payment TO rent2go_app;
  END IF;
  IF to_regclass('public.booking_refund_reference') IS NOT NULL THEN
   GRANT SELECT,INSERT ON booking_refund_reference TO rent2go_app;
  END IF;
  IF to_regclass('public.booking_cancellation_request') IS NOT NULL THEN
   GRANT SELECT,INSERT ON booking_cancellation_command,booking_cancellation_request,booking_cancellation_decision TO rent2go_app;
  END IF;
  IF to_regclass('public.booking_inspection') IS NOT NULL THEN
   GRANT SELECT,INSERT ON booking_fulfillment_command,booking_inspection_file,booking_inspection,booking_inspection_photo,booking_inspection_ack,booking_fulfillment_event,booking_actual_occupation TO rent2go_app;
   GRANT UPDATE(closed_at,available_at) ON booking_actual_occupation TO rent2go_app;
  END IF;
  IF to_regclass('public.booking_payment_account') IS NOT NULL THEN
   GRANT SELECT,INSERT ON booking_payment_account,booking_payment_command,booking_payment_attempt,booking_payment_decision,booking_payment_collection,booking_hold_commitment TO rent2go_app;
  END IF;
  IF to_regclass('public.booking_agreement') IS NOT NULL THEN
   GRANT SELECT,INSERT ON booking_agreement,booking_agreement_signature,booking_agreement_event TO rent2go_app;
  END IF;
  IF to_regclass('public.booking_quotation') IS NOT NULL THEN
   GRANT SELECT,INSERT ON booking_quotation,booking_quotation_line,booking_hold_resource,booking_hold_seat,booking_quotation_decision,booking_hold TO rent2go_app;
   GRANT UPDATE(released_at,release_reason) ON booking_hold TO rent2go_app;
  END IF;
  IF to_regclass('public.booking_requirement_file') IS NOT NULL THEN
   GRANT SELECT,INSERT ON booking_requirement_file,booking_requirement_submission,booking_requirement_selection,booking_requirement_decision TO rent2go_app;
  END IF;
  IF to_regclass('public.booking_request') IS NOT NULL THEN
   GRANT SELECT,INSERT,UPDATE ON booking_request,booking_notification TO rent2go_app;
   GRANT SELECT,INSERT ON booking_request_line,booking_event,booking_checkout_command TO rent2go_app;
  END IF;
  IF to_regclass('public.booking_cart') IS NOT NULL THEN GRANT SELECT,INSERT,UPDATE ON booking_cart,cart_item TO rent2go_app; END IF;
  IF to_regclass('public.agency_member') IS NOT NULL THEN GRANT SELECT,INSERT,UPDATE ON agency_member TO rent2go_app; END IF;
  IF to_regclass('public.vehicle_offer') IS NOT NULL THEN
   GRANT SELECT,INSERT ON physical_vehicle TO rent2go_app;
   GRANT SELECT,INSERT,UPDATE ON vehicle_offer,vehicle_file TO rent2go_app;
   GRANT SELECT,INSERT ON vehicle_revision,vehicle_agreement,vehicle_event,vehicle_revision_file TO rent2go_app;
  END IF;
  IF to_regclass('public.tour_package') IS NOT NULL THEN
   GRANT SELECT,INSERT,UPDATE ON tour_package,tour_file,tour_schedule TO rent2go_app;
   GRANT SELECT,INSERT ON tour_revision,tour_revision_file TO rent2go_app;
  END IF;
  IF to_regclass('public.resource') IS NOT NULL THEN GRANT SELECT,INSERT,UPDATE ON agency_driver,resource,resource_occupation,vehicle_maintenance TO rent2go_app; END IF;
 END $$`);
}
