import { describe, expect, it } from "vitest";
import * as senderModule from "../../../supabase/functions/line-outbound-sender/index";
import {
  createScrubbingLogger,
  processOutboundBatch,
  type LineMessagingClient,
  type SenderDataAccess,
  type VaultTokenResolver,
} from "../../../supabase/functions/line-outbound-sender/index";

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

function query(
  result: QueryResult,
  onEq: (column: string, value: unknown) => void = () => {},
  onOr: (filters: string) => void = () => {},
) {
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      onEq(column, value);
      return builder;
    },
    limit: () => builder,
    or: (filters: string) => {
      onOr(filters);
      return builder;
    },
    maybeSingle: async () => result,
    then: <TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return builder;
}

function fakeClient(
  failingTable?: string,
  resultOverrides: Record<string, QueryResult> = {},
) {
  const recordCalls: Array<Record<string, unknown>> = [];
  const vaultLookupFields: string[] = [];
  const lookupFilters: Array<{
    table: string;
    column: string;
    value: unknown;
  }> = [];
  const results: Record<string, QueryResult> = {
    line_oa_conversations: {
      data: { line_user_id: "U-lookup", vertical_context: "monolith" },
      error: null,
    },
    line_groups: { data: { vertical_context: "monolith" }, error: null },
    line_oa_channels: {
      data: { channel_access_token_ref: "token-ref" },
      error: null,
    },
    line_oa_message_templates: {
      data: [{
        template_key: "tpl-lookup",
        vertical_context: "monolith",
        body: "hello",
        is_active: true,
        message_kind: "text",
      }],
      error: null,
    },
    vault_by_name: { data: null, error: null },
    vault_by_id: { data: null, error: null },
    ...resultOverrides,
  };
  if (failingTable) {
    results[failingTable] = {
      data: null,
      error: { message: "database temporarily unavailable" },
    };
  }

  const client = {
    recordCalls,
    vaultLookupFields,
    lookupFilters,
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "rpc_claim_line_outbound_batch") {
        const isGroup = failingTable === "line_groups" ||
          Object.prototype.hasOwnProperty.call(resultOverrides, "line_groups");
        const templateRows = results.line_oa_message_templates.data;
        const claimedTemplateKey = Array.isArray(templateRows) && templateRows[0] &&
            typeof templateRows[0] === "object" && "template_key" in templateRows[0]
          ? String(templateRows[0].template_key)
          : "tpl-lookup";
        return {
          data: [{
            id: "ob-lookup",
            claim_token: "claim-token",
            target_type: isGroup ? "group" : "user",
            target_id: isGroup ? "C-group" : "U-lookup",
            conversation_id: isGroup ? null : "conv-lookup",
            send_type: "push",
            template_key: claimedTemplateKey,
            slot_values: {},
          }],
          error: null,
        };
      }
      recordCalls.push(args);
      return { data: [{ recorded: true }], error: null };
    },
    from(table: string) {
      return query(
        results[table],
        (column, value) => lookupFilters.push({ table, column, value }),
        (filters) => lookupFilters.push({ table, column: "or", value: filters }),
      );
    },
    schema() {
      return {
        from: () => {
          let resultKey = "vault_by_name";
          let lookupValue: unknown;
          const builder = {
            select: () => builder,
            eq(field: string, value: unknown) {
              vaultLookupFields.push(field);
              resultKey = field === "name" ? "vault_by_name" : "vault_by_id";
              lookupValue = value;
              return builder;
            },
            limit: () => builder,
            maybeSingle: async () => {
              if (
                resultKey === "vault_by_id" &&
                (typeof lookupValue !== "string" ||
                  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
                    .test(lookupValue))
              ) {
                return {
                  data: null,
                  error: { message: "invalid input syntax for type uuid" },
                };
              }
              return results[resultKey];
            },
          };
          return builder;
        },
      };
    },
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "https://signed" }, error: null }),
      }),
    },
  };
  return client;
}

type SenderFactories = {
  createSupabaseSenderDataAccess?: (client: unknown) => SenderDataAccess;
  createSupabaseVaultTokenResolver?: (client: unknown) => VaultTokenResolver;
};

const factories = senderModule as unknown as SenderFactories;
const successfulLine: LineMessagingClient = { send: async () => ({ ok: true }) };

describe("line-outbound-sender Supabase lookup failures", () => {
  it("sends an unbound-group bind prompt with the monolith fallback", async () => {
    expect(factories.createSupabaseSenderDataAccess).toBeTypeOf("function");
    const client = fakeClient(undefined, {
      line_groups: { data: null, error: null },
      line_oa_message_templates: {
        data: [{
          template_key: "tpl_inst_bind_prompt",
          vertical_context: null,
          body: "bind this group",
          is_active: true,
          message_kind: "text",
        }],
        error: null,
      },
    });
    const data = factories.createSupabaseSenderDataAccess!(client);
    const lineCalls: Array<Parameters<LineMessagingClient["send"]>[0]> = [];

    const summary = await processOutboundBatch(
      {
        data,
        vault: { resolveAccessToken: async () => "resolved-token" },
        line: {
          async send(request) {
            lineCalls.push(request);
            return { ok: true };
          },
        },
        logger: createScrubbingLogger({ info: () => {}, error: () => {} }),
      },
      { batchSize: 1 },
    );

    expect(summary.results[0]).toEqual({
      outboundId: "ob-lookup",
      status: "sent",
    });
    expect(lineCalls).toHaveLength(1);
    expect(lineCalls[0]).toMatchObject({
      endpoint: "push",
      to: "C-group",
      messages: [{ type: "text", text: "bind this group" }],
    });
    expect(client.lookupFilters).toContainEqual({
      table: "line_oa_channels",
      column: "vertical_context",
      value: "monolith",
    });
    expect(client.lookupFilters).toContainEqual({
      table: "line_oa_message_templates",
      column: "template_key",
      value: "tpl_inst_bind_prompt",
    });
    expect(client.lookupFilters).toContainEqual({
      table: "line_oa_message_templates",
      column: "or",
      value: "vertical_context.eq.monolith,vertical_context.is.null",
    });
    expect(client.recordCalls).toHaveLength(1);
    expect(client.recordCalls[0]).toMatchObject({
      p_status: "sent",
      p_claim_token: "claim-token",
    });
  });

  it.each([
    "line_oa_conversations",
    "line_groups",
    "line_oa_channels",
    "line_oa_message_templates",
  ])("records a %s query error as transient so the claimed row re-pends", async (table) => {
    expect(factories.createSupabaseSenderDataAccess).toBeTypeOf("function");
    const client = fakeClient(table);
    const data = factories.createSupabaseSenderDataAccess!(client);

    const summary = await processOutboundBatch(
      {
        data,
        vault: { resolveAccessToken: async () => "resolved-token" },
        line: successfulLine,
        logger: createScrubbingLogger({ info: () => {}, error: () => {} }),
      },
      { batchSize: 1 },
    );

    expect(summary.results[0]).toMatchObject({
      status: "failed",
      failureClass: "transient",
    });
    expect(client.recordCalls).toHaveLength(1);
    expect(client.recordCalls[0]).toMatchObject({
      p_status: "failed",
      p_failure_class: "transient",
      p_claim_token: "claim-token",
    });
  });

  it.each([
    { lookup: "vault_by_name", ref: "token-ref" },
    { lookup: "vault_by_id", ref: "a4000000-0000-4000-8000-000000000001" },
  ])(
    "throws on an operational $lookup lookup error instead of returning absent configuration",
    async ({ lookup, ref }) => {
      expect(factories.createSupabaseVaultTokenResolver).toBeTypeOf("function");
      const vault = factories.createSupabaseVaultTokenResolver!(fakeClient(lookup));

      await expect(vault.resolveAccessToken(ref)).rejects.toThrow(
        "database temporarily unavailable",
      );
    },
  );

  it("records a missing non-UUID Vault name as permanent without probing the id column", async () => {
    expect(factories.createSupabaseVaultTokenResolver).toBeTypeOf("function");
    expect(factories.createSupabaseSenderDataAccess).toBeTypeOf("function");
    const client = fakeClient();
    const vault = factories.createSupabaseVaultTokenResolver!(client);
    const data = factories.createSupabaseSenderDataAccess!(client);

    const summary = await processOutboundBatch(
      {
        data,
        vault,
        line: successfulLine,
        logger: createScrubbingLogger({ info: () => {}, error: () => {} }),
      },
      { batchSize: 1 },
    );

    expect(summary.results[0]).toEqual({
      outboundId: "ob-lookup",
      status: "failed",
      reason: "channel_access_token_unresolved",
      failureClass: "permanent",
    });
    expect(client.vaultLookupFields).toEqual(["name"]);
    expect(client.recordCalls[0]).toMatchObject({
      p_status: "failed",
      p_failure_class: "permanent",
    });
  });

  it("keeps genuinely absent conversation configuration permanent when a later lookup also errors", async () => {
    expect(factories.createSupabaseSenderDataAccess).toBeTypeOf("function");
    const client = fakeClient("line_oa_channels", {
      line_oa_conversations: { data: null, error: null },
    });
    const data = factories.createSupabaseSenderDataAccess!(client);

    const summary = await processOutboundBatch(
      {
        data,
        vault: { resolveAccessToken: async () => "resolved-token" },
        line: successfulLine,
        logger: createScrubbingLogger({ info: () => {}, error: () => {} }),
      },
      { batchSize: 1 },
    );

    expect(summary.results[0]).toMatchObject({
      status: "failed",
      reason: "conversation_enrichment_missing",
      failureClass: "permanent",
    });
    expect(client.recordCalls[0]).toMatchObject({
      p_failure_class: "permanent",
    });
  });
});
