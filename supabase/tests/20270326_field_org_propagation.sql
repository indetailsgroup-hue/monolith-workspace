-- R1: derive field write ownership from authoritative parents.
-- Canonical migrations + pgTAP. All fixtures and writes roll back. No disabled
-- triggers, replica mode, tenant defaults, mocked RPCs, or external transport.
-- These are attribution/provenance tests, not a claim that the existing broad
-- governance/site/membership RPC predicates implement complete org isolation.
BEGIN;
SELECT plan(68);

CREATE TEMP TABLE field_org_results (label text PRIMARY KEY, result jsonb);
GRANT ALL ON field_org_results TO authenticated;
DO $$ BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated', pg_my_temp_schema()::regnamespace::text);
END $$;
INSERT INTO public.organizations (org_id,name,slug) VALUES
 ('a1260000-0000-0000-0000-000000000001','R1 field A','pgtap-r1-field-a'),
 ('b1260000-0000-0000-0000-000000000001','R1 field B','pgtap-r1-field-b');
INSERT INTO auth.users (id,email) VALUES
 ('a1260000-0000-0000-0000-000000000011','r1-field@test.local'),
 ('b1260000-0000-0000-0000-000000000012','r1-field-other@test.local');
INSERT INTO public.org_members (org_id,user_id,email,role,is_active) VALUES
 ('a1260000-0000-0000-0000-000000000001','a1260000-0000-0000-0000-000000000011','r1-field@test.local','ADMIN',true),
 ('b1260000-0000-0000-0000-000000000001','b1260000-0000-0000-0000-000000000012','r1-field-other@test.local','VIEWER',true);
-- A final synthetic step avoids depending on the number of seeded steps.
INSERT INTO public.process_model (canonical_order,process_step,sub_process_group,requires_approval)
 SELECT coalesce(max(canonical_order),0)+1,'Installation','Field',false FROM public.process_model;
INSERT INTO public.work_item (id,org_id,site_code,current_step,current_order) VALUES
 ('a1260000-0000-0000-0000-000000000021','a1260000-0000-0000-0000-000000000001','R1-FIELD-A','Installation',(SELECT max(canonical_order) FROM public.process_model)),
 ('b1260000-0000-0000-0000-000000000021','b1260000-0000-0000-0000-000000000001','R1-FIELD-B','Installation',0);
INSERT INTO public.installation_projects (id,org_id,work_item_id,site_code,name) VALUES
 ('a1260000-0000-0000-0000-000000000031','a1260000-0000-0000-0000-000000000001','a1260000-0000-0000-0000-000000000021','R1-FIELD-A','R1 A'),
 ('a1260000-0000-0000-0000-000000000032','a1260000-0000-0000-0000-000000000001',null,'R1-FIELD-QC','R1 QC'),
 ('a1260000-0000-0000-0000-000000000033','a1260000-0000-0000-0000-000000000001',null,'R1-FIELD-ACCEPT','R1 acceptance'),
 ('a1260000-0000-0000-0000-000000000034','a1260000-0000-0000-0000-000000000001',null,'R1-FIELD-AMB','R1 ambiguous A'),
 ('b1260000-0000-0000-0000-000000000034','b1260000-0000-0000-0000-000000000001',null,'R1-FIELD-AMB','R1 ambiguous B'),
 ('b1260000-0000-0000-0000-000000000031','b1260000-0000-0000-0000-000000000001','b1260000-0000-0000-0000-000000000021','R1-FIELD-B','R1 B'),
 ('a1260000-0000-0000-0000-000000000035','a1260000-0000-0000-0000-000000000001',null,'R1-FIELD-A','R1 second house with the same site owner');
INSERT INTO public.installation_rooms (id,org_id,project_id,site_code,room_type,display_name) VALUES
 ('a1260000-0000-0000-0000-000000000041','a1260000-0000-0000-0000-000000000001','a1260000-0000-0000-0000-000000000031','R1-FIELD-A','kitchen','R1 room without photo'),
 ('b1260000-0000-0000-0000-000000000041','b1260000-0000-0000-0000-000000000001','b1260000-0000-0000-0000-000000000031','R1-FIELD-B','kitchen','R1 foreign room');
SELECT lives_ok($$ INSERT INTO public.line_groups (id,org_id,line_group_id,project_id,site_code,group_type,status) VALUES
 ('a1260000-0000-0000-0000-000000000051','a1260000-0000-0000-0000-000000000001','R1-FIELD-CUSTOMER','a1260000-0000-0000-0000-000000000033','R1-FIELD-ACCEPT','customer','active') $$,'Normal customer-group binding preserves welcome document links, outbound and audit');
-- Explicitly owned seed rows isolate acceptance/immutability tests from the
-- expected issue/QC write failures; they do not replace results of tested RPCs.
INSERT INTO public.installation_issues (id,org_id,project_id,site_code,description) VALUES
 ('a1260000-0000-0000-0000-000000000061','a1260000-0000-0000-0000-000000000001','a1260000-0000-0000-0000-000000000033','R1-FIELD-ACCEPT','R1 seeded punch');
INSERT INTO public.installation_audit_log (id,org_id,project_id,site_code,event_type) VALUES
 ('a1260000-0000-0000-0000-000000000071','a1260000-0000-0000-0000-000000000001','a1260000-0000-0000-0000-000000000031','R1-FIELD-A','r1_fixture');
DO $$ BEGIN
 PERFORM set_config('request.jwt.claim.sub','a1260000-0000-0000-0000-000000000011',true);
 PERFORM set_config('request.jwt.claims','{"sub":"a1260000-0000-0000-0000-000000000011","role":"authenticated","org_id":"a1260000-0000-0000-0000-000000000001","app_metadata":{"roles":["admin"],"site_codes":["R1-FIELD-A","R1-FIELD-QC","R1-FIELD-ACCEPT","R1-FIELD-AMB","R1-FIELD-B"]}}',true);
END $$;

SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO pg_temp.field_org_results VALUES ('issue',public.rpc_field_raise_issue('a1260000-0000-0000-0000-000000000031','material','R1 actual raised issue')) $$,'Raise issue persists through normal issue and audit writes');
SELECT lives_ok($$ INSERT INTO pg_temp.field_org_results VALUES ('t0',public.rpc_field_t0_snapshot('a1260000-0000-0000-0000-000000000031','{"ready":false}'::jsonb)) $$,'Incomplete T0 remains a soft warning and is audited');
SELECT throws_ok($$ SELECT public.rpc_field_submit_qc_inspection('a1260000-0000-0000-0000-000000000032',false,'','r1-empty') $$,'23514',null,'Failed QC still requires notes');
SELECT lives_ok($$ INSERT INTO pg_temp.field_org_results VALUES ('qc',public.rpc_field_submit_qc_inspection('a1260000-0000-0000-0000-000000000032',false,'R1 real QC defect','r1-org-qc')) $$,'QC capture, verification, promotion, inspection, issue and audit all persist');
SELECT lives_ok($$ INSERT INTO pg_temp.field_org_results VALUES ('qc-repeat',public.rpc_field_submit_qc_inspection('a1260000-0000-0000-0000-000000000032',false,'R1 real QC defect','r1-org-qc')) $$,'Repeated QC key is idempotent');
RESET ROLE;
SELECT is((SELECT org_id::text FROM public.installation_issues WHERE description LIKE '%R1 actual raised issue'),'a1260000-0000-0000-0000-000000000001','Raised issue takes project ownership');
SELECT is((SELECT count(*)::integer FROM public.installation_audit_log WHERE project_id='a1260000-0000-0000-0000-000000000031' AND event_type='issue_raised' AND org_id='a1260000-0000-0000-0000-000000000001'),1,'Issue audit takes the same owner');
SELECT is((SELECT result->>'complete' FROM field_org_results WHERE label='t0'),'false','T0 incompleteness does not become a halt');
SELECT is((SELECT count(*)::integer FROM public.installation_audit_log WHERE project_id='a1260000-0000-0000-0000-000000000031' AND event_type IN ('t0_snapshot','t0_without_photos') AND org_id='a1260000-0000-0000-0000-000000000001'),2,'T0 and missing-photo audits both receive ownership');
SELECT is((SELECT count(*)::integer FROM public.qc_inspections WHERE project_id='a1260000-0000-0000-0000-000000000032' AND org_id='a1260000-0000-0000-0000-000000000001'),1,'QC creates exactly one inspection owned by project');
SELECT is((SELECT count(*)::integer FROM public.installation_issues WHERE description='QC: R1 real QC defect' AND org_id='a1260000-0000-0000-0000-000000000001'),1,'Failed QC creates exactly one correctly owned punch issue');
SELECT is((SELECT org_id::text FROM public.capture_artifact WHERE idempotency_key='qc-r1-org-qc'),'a1260000-0000-0000-0000-000000000001','QC capture derives the unique site owner before linking');
SELECT ok(coalesce((SELECT count(*)>=3 AND bool_and(a.org_id=c.org_id) FROM public.capture_audit_log a JOIN public.capture_artifact c ON c.id=a.capture_artifact_id WHERE c.idempotency_key='qc-r1-org-qc'),false),'QC ingest, verify and emit audit records inherit artifact ownership');
SELECT is((SELECT result->>'already' FROM field_org_results WHERE label='qc-repeat'),'true','Repeated QC returns already without duplicate effects');

SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.rpc_request_customer_acceptance('a1260000-0000-0000-0000-000000000033','PM override cannot bypass punch') $$,'23514',null,'Unresolved punch still blocks acceptance even with override');
SELECT lives_ok($$ SELECT public.rpc_field_resolve_issue('a1260000-0000-0000-0000-000000000061') $$,'Existing resolve action remains available');
SELECT throws_ok($$ SELECT public.rpc_request_customer_acceptance('a1260000-0000-0000-0000-000000000033') $$,'23514',null,'Acceptance still requires QC pass or authorized reason');
RESET ROLE;
INSERT INTO public.qc_inspections (org_id,project_id,site_code,result,notes) VALUES
 ('a1260000-0000-0000-0000-000000000001','a1260000-0000-0000-0000-000000000033','R1-FIELD-ACCEPT','pass','R1 isolated acceptance fixture');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO pg_temp.field_org_results VALUES ('accept',jsonb_build_object('id',public.rpc_request_customer_acceptance('a1260000-0000-0000-0000-000000000033'))) $$,'Acceptance creates approval, real outbound queue and audit');
SELECT lives_ok($$ INSERT INTO pg_temp.field_org_results VALUES ('accept-repeat',jsonb_build_object('id',public.rpc_request_customer_acceptance('a1260000-0000-0000-0000-000000000033'))) $$,'Pending acceptance remains idempotent');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.installation_approvals WHERE project_id='a1260000-0000-0000-0000-000000000033' AND org_id='a1260000-0000-0000-0000-000000000001'),1,'Approval receives project owner exactly once');
SELECT is((SELECT count(*)::integer FROM public.line_oa_outbound_messages WHERE target_id='R1-FIELD-CUSTOMER' AND template_key='tpl_inst_approval_request' AND org_id='a1260000-0000-0000-0000-000000000001' AND status='pending'),1,'Acceptance queue row receives bound group project owner exactly once');
SELECT is((SELECT count(*)::integer FROM public.installation_audit_log WHERE project_id='a1260000-0000-0000-0000-000000000033' AND event_type='customer_acceptance_requested' AND org_id='a1260000-0000-0000-0000-000000000001'),1,'Acceptance audit receives project owner');
SELECT ok((SELECT result->>'id' FROM field_org_results WHERE label='accept') IS NOT NULL AND (SELECT result FROM field_org_results WHERE label='accept')=(SELECT result FROM field_org_results WHERE label='accept-repeat'),'Repeated acceptance returns the same approval');

SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO pg_temp.field_org_results VALUES ('close',public.rpc_field_close_house('a1260000-0000-0000-0000-000000000031','r1-org-close')) $$,'Authorized close house traverses capture and workflow completion');
RESET ROLE;
SELECT is((SELECT status::text FROM public.work_item WHERE id='a1260000-0000-0000-0000-000000000021'),'completed','Close house completes the linked work item');
SELECT is((SELECT result->>'rooms_without_proof' FROM field_org_results WHERE label='close'),'1','Missing room photo remains a soft warning');
SELECT is((SELECT org_id::text FROM public.capture_artifact WHERE idempotency_key='field-close-r1-org-close'),'a1260000-0000-0000-0000-000000000001','Close capture inherits project/work-item owner');
SELECT is((SELECT count(*)::integer FROM public.workflow_audit_log WHERE work_item_id='a1260000-0000-0000-0000-000000000021' AND event_type='work_item_complete' AND org_id='a1260000-0000-0000-0000-000000000001'),1,'Workflow completion audit inherits work-item owner');
SELECT is((SELECT count(*)::integer FROM public.installation_audit_log WHERE project_id='a1260000-0000-0000-0000-000000000031' AND event_type='house_closed' AND org_id='a1260000-0000-0000-0000-000000000001'),1,'House-close audit receives project owner');

-- Integrity checks intentionally run as the test owner to exercise triggers
-- independently of client grants. They do not grant extra production access.
SELECT throws_ok($$ INSERT INTO public.installation_issues(org_id,project_id,site_code,description) VALUES ('b1260000-0000-0000-0000-000000000001','a1260000-0000-0000-0000-000000000031','R1-FIELD-A','wrong explicit owner') $$,'23514',null,'Issue rejects explicit owner conflicting with project');
SELECT throws_ok($$ INSERT INTO public.installation_issues(project_id,room_id,site_code,description) VALUES ('a1260000-0000-0000-0000-000000000031','b1260000-0000-0000-0000-000000000041','R1-FIELD-A','wrong room parent') $$,'23514',null,'Issue rejects a room belonging to another project');
SELECT throws_ok($$ INSERT INTO public.installation_issues(project_id,site_code,description) VALUES ('a1260000-0000-0000-0000-000000000031','R1-FIELD-B','wrong site') $$,'23514',null,'Project attribution rejects a contradictory site');
SELECT throws_ok($$ UPDATE public.installation_issues SET org_id='b1260000-0000-0000-0000-000000000001',project_id='b1260000-0000-0000-0000-000000000031',site_code='R1-FIELD-B' WHERE id='a1260000-0000-0000-0000-000000000061' $$,'23514',null,'Changing both parent and owner cannot move an existing issue across organizations');
SELECT throws_ok($$ INSERT INTO public.installation_approvals(org_id,project_id,subject,channel) VALUES ('b1260000-0000-0000-0000-000000000001','a1260000-0000-0000-0000-000000000031','customer_acceptance','line') $$,'23514',null,'Approval rejects conflicting explicit owner');
SELECT throws_ok($$ INSERT INTO public.qc_inspections(org_id,project_id,result) VALUES ('b1260000-0000-0000-0000-000000000001','a1260000-0000-0000-0000-000000000031','pass') $$,'23514',null,'QC rejects conflicting explicit owner');
SELECT throws_ok($$ INSERT INTO public.installation_audit_log(org_id,project_id,event_type) VALUES ('b1260000-0000-0000-0000-000000000001','a1260000-0000-0000-0000-000000000031','wrong_owner') $$,'23514',null,'Installation audit rejects conflicting explicit owner');
SELECT throws_ok($$ UPDATE public.installation_audit_log SET event_type='changed' WHERE id='a1260000-0000-0000-0000-000000000071' $$,'23001',null,'Existing installation audit remains append-only on update');
SELECT throws_ok($$ DELETE FROM public.installation_audit_log WHERE id='a1260000-0000-0000-0000-000000000071' $$,'23001',null,'Existing installation audit remains append-only on delete');
SELECT throws_ok($$ INSERT INTO public.line_oa_outbound_messages(org_id,send_type,status,template_key,slot_values,target_type,target_id) VALUES ('b1260000-0000-0000-0000-000000000001','push','pending','tpl_inst_approval_request','{}','group','R1-FIELD-CUSTOMER') $$,'23514',null,'Group outbound rejects a tenant conflicting with its bound project');
SELECT throws_ok($$ INSERT INTO public.line_oa_outbound_messages(org_id,send_type,status,template_key,slot_values,target_type,target_id) VALUES ('a1260000-0000-0000-0000-000000000001','push','pending','tpl_inst_issue_alert','{}','group','R1-FIELD-CUSTOMER') $$,'23514',null,'Existing customer-group audience guard remains effective');

SELECT throws_ok($$ SELECT public.rpc_capture_ingest('qc_inspection','app','app://r1/amb','r1-org-amb','R1-FIELD-AMB') $$,'23514',null,'Site-only capture rejects two distinct project owners');
SELECT throws_ok($$ SELECT public.rpc_capture_ingest('qc_inspection','app','app://r1/missing','r1-org-missing','R1-FIELD-UNKNOWN') $$,'23514',null,'Site-only capture rejects missing owner without JWT or sentinel fallback');
SELECT lives_ok($$ INSERT INTO pg_temp.field_org_results VALUES ('capture',jsonb_build_object('id',public.rpc_capture_ingest('qc_inspection','app','app://r1/unique','r1-org-unique','R1-FIELD-A'))) $$,'Site-only capture accepts multiple projects sharing one distinct owner');
SELECT is((SELECT org_id::text FROM public.capture_artifact WHERE idempotency_key='r1-org-unique'),'a1260000-0000-0000-0000-000000000001','Unique-site capture receives its parent owner');
SELECT throws_ok($$ SELECT public.rpc_capture_ingest('qc_inspection','app','app://r1/reuse','r1-org-unique','R1-FIELD-B') $$,'23514',null,'Reusing a capture key in another organization cannot return the first artifact');
SELECT is((SELECT count(*)::integer FROM public.capture_artifact WHERE idempotency_key IN ('r1-org-amb','r1-org-missing')),0,'Rejected site-only ingests leave no artifact');
SELECT throws_ok($$ INSERT INTO public.workflow_audit_log(event_type,site_code,performed_by) VALUES ('r1_ambiguous','R1-FIELD-AMB','r1-fixture') $$,'23514',null,'Site-only workflow audit rejects ambiguous ownership');
SELECT throws_ok($$ INSERT INTO public.workflow_audit_log(org_id,event_type,work_item_id,site_code,performed_by) VALUES ('b1260000-0000-0000-0000-000000000001','r1_conflict','a1260000-0000-0000-0000-000000000021','R1-FIELD-A','r1-fixture') $$,'23514',null,'Workflow audit cannot override its work-item owner');

-- Approved fixture isolates promote's parent consistency checks from ingest.
INSERT INTO public.capture_artifact(id,org_id,capture_type,source,principal,site_code,raw_uri,idempotency_key,status,corrected_fields) VALUES
 ('a1260000-0000-0000-0000-000000000081','a1260000-0000-0000-0000-000000000001','qc_inspection','app','r1-fixture','R1-FIELD-A','app://r1/linked','r1-org-linked','approved','{"project_id":"a1260000-0000-0000-0000-000000000031","result":"pass"}');
SELECT throws_ok($$ SELECT public.rpc_capture_promote('a1260000-0000-0000-0000-000000000081','installation_project','b1260000-0000-0000-0000-000000000031') $$,'23514',null,'Promotion cannot link an owned capture to a foreign project');
SELECT throws_ok($$ SELECT public.rpc_capture_promote('a1260000-0000-0000-0000-000000000081','work_item','b1260000-0000-0000-0000-000000000021') $$,'23514',null,'Payload project and linked work item must agree on owner');
SELECT is((SELECT status::text FROM public.capture_artifact WHERE id='a1260000-0000-0000-0000-000000000081'),'approved','Rejected promotions leave approved capture unchanged');
SELECT throws_ok($$ UPDATE public.capture_artifact SET org_id='b1260000-0000-0000-0000-000000000001',site_code='R1-FIELD-B',corrected_fields='{"project_id":"b1260000-0000-0000-0000-000000000031"}' WHERE id='a1260000-0000-0000-0000-000000000081' $$,'23514',null,'Updating provenance and owner together cannot move a capture across organizations');
SELECT throws_ok($$ INSERT INTO public.capture_audit_log(org_id,event_type,capture_artifact_id,actor) VALUES ('b1260000-0000-0000-0000-000000000001','ingest','a1260000-0000-0000-0000-000000000081','r1-fixture') $$,'23514',null,'Capture audit rejects an explicit owner conflicting with its artifact');

-- Site labels can be reused later. An existing owner's unrelated lifecycle
-- transition must not be re-attributed from the now-ambiguous site label.
INSERT INTO public.installation_projects(id,org_id,site_code,name) VALUES
 ('b1260000-0000-0000-0000-000000000035','b1260000-0000-0000-0000-000000000001','R1-FIELD-A','R1 later reuse of an existing site label');
SELECT lives_ok($$ SELECT public.rpc_capture_verify((SELECT id FROM public.capture_artifact WHERE idempotency_key='r1-org-unique'),'approved',true,0,'R1 established ownership','{"project_id":"a1260000-0000-0000-0000-000000000031","result":"pass"}'::jsonb) $$,'Existing capture can be verified after a second organization reuses its site label');
SELECT is((SELECT org_id::text FROM public.capture_artifact WHERE idempotency_key='r1-org-unique'),'a1260000-0000-0000-0000-000000000001','Later site ambiguity does not reassign established capture ownership');

-- Shared tables also accept explicitly owned records outside the field-parent
-- path. Exercise their real INSERT triggers, retaining the supplied owner.
-- Each lives_ok contains its own persisted-owner check so a failure is a TAP
-- assertion instead of aborting the remainder of this transaction.
INSERT INTO public.capture_type_config(capture_type,org_id,field_schema,commit_target) VALUES
 ('r1_parentless_compat','a1260000-0000-0000-0000-000000000001','{}','evidence_only');
SELECT lives_ok($$ DO $compat$ DECLARE v_owner uuid; BEGIN
 INSERT INTO public.capture_artifact(id,org_id,capture_type,source,principal,raw_uri,idempotency_key) VALUES
  ('a1260000-0000-0000-0000-000000000082','a1260000-0000-0000-0000-000000000001','r1_parentless_compat','app','r1-explicit-owner','app://r1/nonfield','r1-parentless-capture');
 SELECT org_id INTO v_owner FROM public.capture_artifact WHERE id='a1260000-0000-0000-0000-000000000082';
 IF v_owner IS DISTINCT FROM 'a1260000-0000-0000-0000-000000000001'::uuid THEN
  RAISE EXCEPTION 'Parentless capture did not retain its supplied organization';
 END IF;
 END $compat$ $$,'Explicitly owned non-field capture remains writable and keeps its owner');
SELECT lives_ok($$ DO $compat$ DECLARE v_owner uuid; BEGIN
 INSERT INTO public.capture_audit_log(id,org_id,event_type,actor) VALUES
  ('a1260000-0000-0000-0000-000000000083','a1260000-0000-0000-0000-000000000001','failure','r1-explicit-owner');
 SELECT org_id INTO v_owner FROM public.capture_audit_log WHERE id='a1260000-0000-0000-0000-000000000083';
 IF v_owner IS DISTINCT FROM 'a1260000-0000-0000-0000-000000000001'::uuid THEN
  RAISE EXCEPTION 'Pre-artifact audit did not retain its supplied organization';
 END IF;
 END $compat$ $$,'Explicitly owned capture failure can be audited before an artifact exists');
SELECT lives_ok($$ DO $compat$ DECLARE v_owner uuid; BEGIN
 INSERT INTO public.workflow_audit_log(id,org_id,event_type,performed_by) VALUES
  ('a1260000-0000-0000-0000-000000000084','a1260000-0000-0000-0000-000000000001','r1_nonfield_event','r1-explicit-owner');
 SELECT org_id INTO v_owner FROM public.workflow_audit_log WHERE id='a1260000-0000-0000-0000-000000000084';
 IF v_owner IS DISTINCT FROM 'a1260000-0000-0000-0000-000000000001'::uuid THEN
  RAISE EXCEPTION 'Parentless workflow audit did not retain its supplied organization';
 END IF;
 END $compat$ $$,'Explicitly owned workflow audit remains writable without a work item or site');
SELECT lives_ok($$ DO $compat$ DECLARE v_owner uuid; BEGIN
 INSERT INTO public.installation_audit_log(id,org_id,event_type,performed_by) VALUES
  ('a1260000-0000-0000-0000-000000000085','a1260000-0000-0000-0000-000000000001','r1_nonproject_event','r1-explicit-owner');
 SELECT org_id INTO v_owner FROM public.installation_audit_log WHERE id='a1260000-0000-0000-0000-000000000085';
 IF v_owner IS DISTINCT FROM 'a1260000-0000-0000-0000-000000000001'::uuid THEN
  RAISE EXCEPTION 'Parentless installation audit did not retain its supplied organization';
 END IF;
 END $compat$ $$,'Explicitly owned installation audit remains writable without a project');

-- Archived internal groups keep normal triggers active without invoking the
-- customer-only welcome flow. Outbound must reject inconsistent stored parent
-- metadata even when the proposed outbound org correctly matches the project.
INSERT INTO public.line_groups(id,org_id,line_group_id,project_id,site_code,group_type,status) VALUES
 ('a1260000-0000-0000-0000-000000000052','b1260000-0000-0000-0000-000000000001','R1-FIELD-BAD-GROUP-ORG','a1260000-0000-0000-0000-000000000031','R1-FIELD-A','internal','archived'),
 ('a1260000-0000-0000-0000-000000000053','a1260000-0000-0000-0000-000000000001','R1-FIELD-BAD-GROUP-SITE','a1260000-0000-0000-0000-000000000031','R1-FIELD-B','internal','archived');
SELECT throws_ok($$ INSERT INTO public.line_oa_outbound_messages(org_id,send_type,status,template_key,slot_values,target_type,target_id) VALUES
 ('a1260000-0000-0000-0000-000000000001','push','pending','tpl_inst_issue_alert','{}','group','R1-FIELD-BAD-GROUP-ORG') $$,'23514',null,'Outbound rejects a group organization conflicting with its project');
SELECT throws_ok($$ INSERT INTO public.line_oa_outbound_messages(org_id,send_type,status,template_key,slot_values,target_type,target_id) VALUES
 ('a1260000-0000-0000-0000-000000000001','push','pending','tpl_inst_issue_alert','{}','group','R1-FIELD-BAD-GROUP-SITE') $$,'23514',null,'Outbound rejects a group site conflicting with its project');

-- The existing get_user_org_id helper resolves earliest active membership,
-- not a selected-org JWT claim. Use a real different member and verify the
-- effective identity; selected-org/multiple-membership semantics are unchanged.
DO $$ BEGIN
 PERFORM set_config('request.jwt.claim.sub','b1260000-0000-0000-0000-000000000012',true);
 PERFORM set_config('request.jwt.claims','{"sub":"b1260000-0000-0000-0000-000000000012","role":"authenticated","org_id":"b1260000-0000-0000-0000-000000000001","app_metadata":{"roles":[],"site_codes":[]}}',true);
END $$;
SET LOCAL ROLE authenticated;
SELECT is(auth.uid()::text,'b1260000-0000-0000-0000-000000000012','Isolation fixture uses the distinct organization B user');
SELECT is(public.get_user_org_id()::text,'b1260000-0000-0000-0000-000000000001','Existing membership resolver identifies organization B before visibility check');
SELECT throws_ok($$ SELECT public.rpc_field_raise_issue('a1260000-0000-0000-0000-000000000031','material','denied') $$,'42501',null,'Caller without governance, site access or membership still cannot raise an issue');
SELECT throws_ok($$ SELECT public.rpc_field_close_house('a1260000-0000-0000-0000-000000000031','denied') $$,'42501',null,'Caller without existing field access still cannot close a house');
SELECT is((SELECT count(*)::integer FROM public.installation_issues WHERE id='a1260000-0000-0000-0000-000000000061'),0,'Existing org SELECT policy hides the owned issue from a member of another organization');
RESET ROLE;
SELECT is((SELECT org_id::text FROM public.installation_issues WHERE id='a1260000-0000-0000-0000-000000000061'),'a1260000-0000-0000-0000-000000000001','Rejected ownership changes leave the original tenant intact');

SELECT * FROM finish();
ROLLBACK;
