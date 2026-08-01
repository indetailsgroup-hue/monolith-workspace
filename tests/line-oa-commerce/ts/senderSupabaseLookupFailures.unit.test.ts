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

function query(result: QueryResult) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    limit: () => builder,
    or: () => builder,
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
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "rpc_claim_line_outbound_batch") {
        const isGroup = failingTable === "line_groups";
        return {
          data: [{
            id: "ob-lookup",
            claim_token: "claim-token",
            target_type: isGroup ? "group" : "user",
            target_id: isGroup ? "C-group" : "U-lookup",
            conversation_id: isGroup ? null : "conv-lookup",
            send_type: "push",
            template_key: "tpl-lookup",
            slot_values: {},
          }],
          error: null,
        };
      }
      recordCalls.push(args);
      return { data: [{ recorded: true }], error: null };
    },
    from(table: string) {
      return query(results[table]);
    },
    schema() {
      return {
        from: () => {
          let resultKey = "vault_by_name";
          const builder = {
            select: () => builder,
            eq(field: string) {
              resultKey = field === "name" ? "vault_by_name" : "vault_by_id";
              return builder;
            },
            limit: () => builder,
            maybeSingle: async () => results[resultKey],
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

  it.each(["vault_by_name", "vault_by_id"])(
    "throws on an operational %s lookup error instead of returning absent configuration",
    async (lookup) => {
      expect(factories.createSupabaseVaultTokenResolver).toBeTypeOf("function");
      const vault = factories.createSupabaseVaultTokenResolver!(fakeClient(lookup));

      await expect(vault.resolveAccessToken("token-ref")).rejects.toThrow(
        "database temporarily unavailable",
      );
    },
  );

  it("returns null only when both Vault lookups succeed with no row", async () => {
    expect(factories.createSupabaseVaultTokenResolver).toBeTypeOf("function");
    const vault = factories.createSupabaseVaultTokenResolver!(fakeClient());

    await expect(vault.resolveAccessToken("missing-ref")).resolves.toBeNull();
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
