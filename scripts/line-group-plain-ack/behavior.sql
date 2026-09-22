-- Run after fixture.sql + migration in an empty, disposable database.
INSERT INTO public.line_groups VALUES
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','contract-active',NULL,'internal','active',NULL),
 ('22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','contract-archived',NULL,'internal','archived',NULL);
DO $$
DECLARE event jsonb; result record; outcome text;
BEGIN
 event := '{"webhookEventId":"contract-1","type":"message","source":{"groupId":"contract-active","userId":"fixture-user"},"message":{"type":"text","text":"private test body"}}';
 SELECT * INTO result FROM public.rpc_ingest_line_webhook(jsonb_build_object('events',jsonb_build_array(event))::text,'fixture','fixture');
 IF result.events_processed <> 1 OR NOT result.accepted THEN RAISE EXCEPTION 'ack not processed: %',result; END IF;
 IF (SELECT count(*) FROM public.line_oa_outbound_messages) <> 1 THEN RAISE EXCEPTION 'expected one ack'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.line_oa_outbound_messages WHERE org_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND template_key='tpl_inst_group_ack' AND slot_values='{}') THEN RAISE EXCEPTION 'ack tenant/content mismatch'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.line_oa_inbound_messages WHERE webhook_event_id='contract-1' AND payload='{}') THEN RAISE EXCEPTION 'metadata-only receipt missing'; END IF;
 SELECT * INTO result FROM public.rpc_ingest_line_webhook(jsonb_build_object('events',jsonb_build_array(event))::text,'fixture','fixture');
 IF result.events_duplicate <> 1 OR (SELECT count(*) FROM public.line_oa_outbound_messages) <> 1 THEN RAISE EXCEPTION 'redelivery duplicated ack'; END IF;
 outcome := public.fn_line_handle_group_event(jsonb_set(event,'{source,groupId}','"contract-archived"'),'installation','fixture');
 IF outcome <> 'plain_archived_ignored' THEN RAISE EXCEPTION 'archived group changed: %',outcome; END IF;
 outcome := public.fn_line_handle_group_event(jsonb_set(event,'{source,groupId}','"contract-unbound"'),'installation','fixture');
 IF outcome <> 'plain_unbound_ignored' THEN RAISE EXCEPTION 'unbound group changed: %',outcome; END IF;
 outcome := public.fn_line_handle_group_event(jsonb_set(event,'{message,type}','"sticker"'),'installation','fixture');
 IF outcome <> 'plain_ignored' THEN RAISE EXCEPTION 'media changed: %',outcome; END IF;
 outcome := public.fn_line_handle_group_event(jsonb_set(event,'{message,text}','"#ปัญหา"'),'installation','fixture');
 IF outcome <> 'issue_empty_ignored' THEN RAISE EXCEPTION 'command precedence changed: %',outcome; END IF;
 IF (SELECT count(*) FROM public.line_oa_outbound_messages) <> 1 THEN RAISE EXCEPTION 'ignored events produced ack'; END IF;
 RAISE NOTICE 'PASS: bound ack, tenant, privacy, sequential dedupe, archived, unbound, media, command precedence';
END $$;
ROLLBACK;
