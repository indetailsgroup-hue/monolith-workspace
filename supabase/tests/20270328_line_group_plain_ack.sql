-- Full canonical schema: real FPR tables, audience and organization triggers.
-- No LINE transport and no mocked database functions. All writes roll back.
BEGIN;
SELECT plan(13);
INSERT INTO public.organizations(org_id,name,slug) VALUES
 ('ac280000-0000-0000-0000-000000000001','Ack contract','pgtap-ack-contract');
INSERT INTO public.installation_projects(id,org_id,site_code,name) VALUES
 ('ac280000-0000-0000-0000-000000000002','ac280000-0000-0000-0000-000000000001','ACK-CONTRACT','Ack contract');
INSERT INTO public.line_groups(org_id,line_group_id,project_id,site_code,group_type,status) VALUES
 ('ac280000-0000-0000-0000-000000000001','ACK-CONTRACT-GROUP','ac280000-0000-0000-0000-000000000002','ACK-CONTRACT','internal','active');
CREATE FUNCTION pg_temp.event(p_type text,p_text text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('webhookEventId','ack-contract-'||p_type,'type','message',
   'source',jsonb_build_object('groupId','ACK-CONTRACT-GROUP','userId','ack-contract-user'),
   'message',jsonb_build_object('id','ack-contract-photo','type',p_type,'text',p_text))
$$;
SELECT is(public.fn_line_handle_group_event(pg_temp.event('text','private ordinary text'),'installation','contract'),
 'plain_ack_staged','Ordinary text stages acknowledgement through real triggers');
SELECT is((SELECT count(*)::int FROM public.line_oa_outbound_messages WHERE target_id='ACK-CONTRACT-GROUP' AND template_key='tpl_inst_group_ack'),1,'One plain acknowledgement');
SELECT is((SELECT org_id::text FROM public.line_oa_outbound_messages WHERE target_id='ACK-CONTRACT-GROUP' AND template_key='tpl_inst_group_ack'),
 'ac280000-0000-0000-0000-000000000001','Acknowledgement has project organization');
SELECT is((SELECT slot_values FROM public.line_oa_outbound_messages WHERE target_id='ACK-CONTRACT-GROUP' AND template_key='tpl_inst_group_ack'),
 '{}'::jsonb,'Acknowledgement stores no message content');
SELECT is(public.fn_line_handle_group_event(pg_temp.event('image',''),'installation','contract'),
 'fpr_photo_intercepted','FPR image path still intercepts');
SELECT is((SELECT state::text FROM public.fpr_line_session WHERE line_group_id='ACK-CONTRACT-GROUP'),
 'await_confirm','Image creates FPR session');
UPDATE public.fpr_line_session SET state='await_amount' WHERE line_group_id='ACK-CONTRACT-GROUP';
SELECT is(public.fn_line_handle_group_event(pg_temp.event('text','invalid'),'installation','contract'),
 'fpr_amount_invalid','Invalid amount reprompts instead of ordinary ack');
SELECT is(public.fn_line_handle_group_event(pg_temp.event('text','1500'),'installation','contract'),
 'fpr_amount_captured','FPR captures valid amount');
SELECT is((SELECT state::text FROM public.fpr_line_session WHERE line_group_id='ACK-CONTRACT-GROUP'),
 'await_workitem','FPR advances to workitem');
SELECT is(public.fn_line_handle_group_event(pg_temp.event('text','#ผูก already ทีม'),'installation','contract'),
 'bind_already_bound','Existing bind command retains precedence');
SELECT is(public.fn_line_handle_group_event(pg_temp.event('text','#ปัญหา contract issue'),'installation','contract'),
 'issue_created','Existing issue command persists through real triggers');
SELECT is((SELECT count(*)::int FROM public.installation_issues WHERE project_id='ac280000-0000-0000-0000-000000000002' AND description='contract issue'),1,'Issue command created one issue');
SELECT is((SELECT count(*)::int FROM public.line_oa_outbound_messages WHERE target_id='ACK-CONTRACT-GROUP' AND template_key='tpl_inst_group_ack'),1,'FPR and commands do not also produce ordinary ack');
SELECT * FROM finish();
ROLLBACK;
