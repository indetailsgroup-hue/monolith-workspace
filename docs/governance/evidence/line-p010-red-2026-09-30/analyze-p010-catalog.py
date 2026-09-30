"""P0-10 catalog analysis. Reads the unaligned catalog capture, writes a summary.

Input: psql -A -F US -R RS -P footer=on output of catalog-checklist.sql.
Pure text processing of captured bytes; it never connects to a database.
Usage: analyze-p010-catalog.py <unaligned-output> > 08-analysis.txt
"""
import json
import re
import sys
from collections import defaultdict

US, RS = "\x1f", "\x1e"
TABLES = [
    "line_oa_channels", "line_oa_conversations", "line_oa_inbound_messages",
    "line_oa_outbound_messages", "line_oa_customer_identity", "line_oa_message_templates",
    "line_oa_orders", "line_oa_audit_log",
]
ROLES = ["anon", "authenticated", "service_role", "authenticator", "postgres"]
CLIENTS = ["anon", "authenticated", "service_role"]
WRITES = ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]
# The 20 candidate names from the read-only source assessment (discovery list).
CANDIDATES = sorted([
    "line_oa_resolve_customer_identity", "rpc_evaluate_identity_merge_candidate",
    "rpc_ingest_line_webhook", "rpc_resolve_conversation_site", "rpc_send_line_outbound",
    "rpc_claim_line_outbound_batch", "rpc_record_line_send_result", "rpc_create_line_order",
    "rpc_sync_line_forecast", "rpc_sweep_line_session_timeouts", "fn_line_handle_group_event",
    "fn_prod_curated", "rpc_request_customer_acceptance", "fn_welcome_on_group_bind",
    "rpc_field_assign_lead", "rpc_field_close_lead", "fn_lead_followup_sweep",
    "rpc_field_shop_drawing_revision", "rpc_field_send_photo_to_customer",
    "rpc_field_set_lead_source",
])
ACL_CODES = {"a": "INSERT", "r": "SELECT", "w": "UPDATE", "d": "DELETE", "D": "TRUNCATE",
             "x": "REFERENCES", "t": "TRIGGER", "m": "MAINTAIN"}


def parse(path):
    text = open(path, encoding="utf-8").read()
    sets = []
    for chunk in re.split(r"\((\d+) rows?\)\r?\n", text)[:-1:2]:
        # Drop psql command tags (BEGIN/SET) that precede a result header.
        while re.match(r"^[A-Z][A-Z ]*\r?\n", chunk):
            chunk = re.sub(r"^[A-Z][A-Z ]*\r?\n", "", chunk, count=1)
        records = chunk.split(RS)
        if records and records[-1] == "":
            records.pop()
        header = records[0].split(US)
        rows = [dict(zip(header, r.split(US))) for r in records[1:]]
        sets.append((tuple(header), rows))
    counts = [int(n) for n in re.findall(r"\((\d+) rows?\)\r?\n", text)]
    for (h, rows), n in zip(sets, counts):
        if len(rows) != n:
            sys.exit(f"parse error: set {h[:2]} has {len(rows)} rows, footer says {n}")
    return sets


def find(sets, *prefix):
    hits = [rows for h, rows in sets if h[:len(prefix)] == prefix]
    if len(hits) != 1:
        sys.exit(f"expected exactly one result set starting {prefix}; got {len(hits)}")
    return hits[0]


def acl_entries(acl):
    """Parse a PostgreSQL aclitem[] text into {grantee: set(privileges)}."""
    out = defaultdict(set)
    if not acl:
        return out
    for item in acl.strip("{}").split(","):
        item = item.strip('"')
        grantee, _, rest = item.partition("=")
        privs = rest.split("/")[0]
        for code in privs.replace("*", ""):
            out[grantee or "PUBLIC"].add(ACL_CODES.get(code, code))
    return out


def base_name(regprocedure):
    name = regprocedure.split("(")[0]
    return name.split(".")[-1].strip('"')


def main():
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    sets = parse(sys.argv[1])
    p = print
    ctx = find(sets, "version", "current_user")[0]
    table_acl = find(sets, "relation", "owner")
    eff = find(sets, "rolname", "relation")
    col_acl = find(sets, "relation", "attname")
    members = find(sets, "member", "granted_role")
    roles = {r["rolname"]: r for r in find(sets, "rolname", "rolsuper")}
    cand = find(sets, "routine", "owner", "prosecdef")
    owner_rights = find(sets, "routine", "owner", "relation")
    defacl = find(sets, "creator_role", "namespace")
    triggers = find(sets, "attached_relation", "tgname")
    rewrites = find(sets, "target", "dependent")

    p("P0-10 catalog analysis (derived from 04b-catalog-output-unaligned.txt; no DB access)")
    p(f"server: {ctx['version']}")
    p(f"captured as current_user={ctx['current_user']} session_user={ctx['session_user']}")
    p(f"result sets parsed: {len(sets)}")
    p()

    # A. Tables
    p("== A. Target tables: owner, RLS, direct ACL write grants ==")
    towner, direct = {}, defaultdict(lambda: defaultdict(set))
    for r in table_acl:
        t = r["relation"].split(".")[-1]
        towner[t] = r["owner"]
        direct[t][r["grantee"]].add(r["privilege_type"])
        rls = (r["relrowsecurity"], r["relforcerowsecurity"])
        direct[t]["__rls__"] = {f"rls={rls[0]} force={rls[1]}"}
    missing_tables = [t for t in TABLES if t not in towner]
    p(f"tables found: {len(towner)}/8; missing: {missing_tables or 'none'}")
    for t in TABLES:
        if t not in towner:
            continue
        p(f"- {t}: owner={towner[t]} {next(iter(direct[t]['__rls__']))}")
        for g in sorted(k for k in direct[t] if k != "__rls__"):
            w = sorted(set(WRITES) & direct[t][g])
            other = sorted(direct[t][g] - set(WRITES))
            p(f"    {g:15} writes={','.join(w) or '-':30} other={','.join(other) or '-'}")
    pub = [t for t in TABLES if set(WRITES) & direct[t].get("PUBLIC", set())]
    p(f"PUBLIC holds a direct write grant on: {pub or 'none'}")
    p()

    # B. Effective privileges
    p("== B. Effective privileges (has_table_privilege / has_any_column_privilege) ==")
    e = {(r["rolname"], r["relation"].split(".")[-1], r["privilege"]): r for r in eff}
    p("role            table                          SEL INS UPD DEL TRU | colINS colUPD")
    for role in ROLES:
        for t in TABLES:
            cells = [e.get((role, t, v), {}).get("effective_table_privilege", "?") for v in ["SELECT"] + WRITES]
            ci = e.get((role, t, "INSERT"), {}).get("any_column_privilege", "?")
            cu = e.get((role, t, "UPDATE"), {}).get("any_column_privilege", "?")
            p(f"{role:15} {t:30} " + " ".join(f"{c:3}" for c in cells) + f" | {ci:6} {cu:6}")
    writers = sorted({(r, t) for (r, t, v), row in e.items() if v in WRITES and row["effective_table_privilege"] == "t"})
    by_role = defaultdict(list)
    for r, t in writers:
        by_role[r].append(t)
    for role in ROLES:
        p(f"effective write on target tables — {role}: {len(by_role[role])}/8")
    p()

    # C. Column ACLs
    p("== C. Column-level ACLs on target tables ==")
    if not col_acl:
        p("none (no attacl set on any column of the 8 tables)")
    for r in col_acl:
        p(f"- {r['relation']}.{r['attname']}: {r['attacl']}")
    p()

    # D. Roles and membership
    p("== D. Role attributes and membership edges ==")
    fowners = sorted({r["owner"] for r in cand})
    towners = sorted(set(towner.values()))
    interest = sorted(set(ROLES) | set(fowners) | set(towners))
    for name in interest:
        r = roles.get(name)
        if r:
            p(f"- {name}: super={r['rolsuper']} inherit={r['rolinherit']} bypassrls={r['rolbypassrls']} login={r['rolcanlogin']}")
        else:
            p(f"- {name}: ROLE NOT PRESENT")
    p("membership edges touching these roles (member -> granted_role [admin/inherit/set]):")
    for m in members:
        if m["member"] in interest or m["granted_role"] in interest:
            p(f"  {m['member']} -> {m['granted_role']} [{m['admin_option']}/{m['inherit_option']}/{m['set_option']}]")
    p()

    # E. The 20 named candidates
    p("== E. The 20 candidate writer names: catalog identity, owner, security, EXECUTE ==")
    byname = defaultdict(lambda: defaultdict(dict))
    meta = {}
    for r in cand:
        byname[base_name(r["routine"])][r["routine"]][r["rolname"]] = r["effective_execute"]
        meta[r["routine"]] = r
    found = [n for n in CANDIDATES if n in byname]
    p(f"names found in catalog candidate set: {len(found)}/20; missing: {[n for n in CANDIDATES if n not in byname] or 'none'}")
    overloads = 0
    for n in CANDIDATES:
        for sig, ex in sorted(byname.get(n, {}).items()):
            overloads += 1
            m = meta[sig]
            exe = " ".join(f"{k}={ex.get(k, '?')}" for k in ROLES)
            p(f"- {sig}")
            p(f"    owner={m['owner']} secdef={m['prosecdef']} config={m['proconfig'] or '-'} acl={m['proacl'] or 'NULL(default)'}")
            p(f"    EXECUTE: {exe}")
    p(f"identities (incl. overloads) for the 20 names: {overloads}")
    sigs20 = [s for n in CANDIDATES for s in byname.get(n, {})]
    p("owners of the 20: " + str(sorted({meta[s]["owner"] for s in sigs20}))
      + f"; SECURITY DEFINER: {sum(meta[s]['prosecdef'] == 't' for s in sigs20)}/{len(sigs20)}")
    for role in ROLES:
        can = [base_name(s) for s in sigs20 if byname[base_name(s)][s].get(role) == "t"]
        p(f"EXECUTE on the 20 — {role}: {len(can)}/{len(sigs20)}"
          + (f" (not: {sorted(set(CANDIDATES) - set(can))})" if 0 < len(can) < len(sigs20) else ""))
    pub_x = [s for s in sigs20 if "X" in acl_entries(meta[s]["proacl"]).get("PUBLIC", set())]
    p(f"PUBLIC EXECUTE among the 20: {pub_x or 'none'}")
    others = sorted(set(meta) - {s for n in CANDIDATES for s in byname.get(n, {})})
    sd = sum(meta[s]["prosecdef"] == "t" for s in others)
    p(f"other text-matched routines (mention line_oa_ or call known writers; readers included): {len(others)} "
      f"(secdef={sd}, invoker={len(others) - sd})")
    for s in others:
        p(f"    {s} owner={meta[s]['owner']} secdef={meta[s]['prosecdef']}")
    p()

    # F. Definer owner rights vs source of the right
    p("== F. SECURITY DEFINER owners: rights on target tables and where they come from ==")
    rights = defaultdict(dict)
    for r in owner_rights:
        rights[(r["owner"], r["relation"].split(".")[-1])][r["privilege"]] = r["owner_has_privilege"]
    definer_owners = sorted({o for o, _ in rights})
    p(f"distinct owners of text-matched SECURITY DEFINER routines: {definer_owners}")
    for o in definer_owners:
        for t in TABLES:
            got = rights.get((o, t), {})
            for v in WRITES:
                val = got.get(v, "?")
                if o == towner.get(t):
                    src = "table owner (ownership)"
                elif roles.get(o, {}).get("rolsuper") == "t":
                    src = "superuser attribute"
                elif v in direct[t].get(o, set()):
                    src = "direct grant"
                elif v in direct[t].get("PUBLIC", set()):
                    src = "PUBLIC grant"
                elif val == "t":
                    via = [m["granted_role"] for m in members
                           if m["member"] == o and v in direct[t].get(m["granted_role"], set())]
                    src = "MEMBERSHIP ONLY via " + (",".join(via) or "indirect chain")
                else:
                    src = "none"
                if val != "t" or not src.startswith("table owner"):
                    p(f"- {o} {t} {v}: has={val} source={src}")
        own_all = all(o == towner.get(t) for t in TABLES)
        p(f"- {o}: owns all 8 target tables = {own_all}")
    dependent = [(o, t, v) for (o, t), g in rights.items() for v in WRITES
                 if g.get(v) == "t" and o != towner.get(t) and roles.get(o, {}).get("rolsuper") != "t"
                 and v not in direct[t].get(o, set()) and v not in direct[t].get("PUBLIC", set())]
    p(f"definer write rights that depend only on role membership: {dependent or 'none'}")
    lacking = [(o, t, v) for (o, t), g in rights.items() for v in ("INSERT", "UPDATE") if g.get(v) != "t"]
    p(f"definer owners lacking INSERT/UPDATE on a target table: {lacking or 'none'}")
    p()

    # G. Default ACLs
    p("== G. Default ACLs (recurrence risk for future objects) ==")
    for r in defacl:
        ent = acl_entries(r["defaclacl"])
        flag = [g for g in CLIENTS if g in ent and set(WRITES) & ent[g]]
        p(f"- creator={r['creator_role']} ns={r['namespace']} type={r['defaclobjtype']} acl={r['defaclacl']}"
          + (f"  <- grants writes to {flag}" if flag and r["defaclobjtype"] == "r" else ""))
    p()

    # H. Triggers
    p("== H. Triggers (on target tables, or routines that mention targets/known writers) ==")
    on_target = [r for r in triggers if r["attached_relation"].split(".")[-1] in TABLES]
    elsewhere = [r for r in triggers if r not in on_target]
    p(f"on target tables: {len(on_target)} (internal={sum(r['tgisinternal'] == 't' for r in on_target)}); "
      f"on other tables: {len(elsewhere)}")
    for r in triggers:
        p(f"- {r['attached_relation']} {r['tgname']} enabled={r['tgenabled']} internal={r['tgisinternal']} "
          f"routine={r['routine']} owner={r['routine_owner']} secdef={r['prosecdef']}")
    p()

    # I. Views and rules
    p("== I. Views / rules depending on target tables, with ACL and effective rights ==")
    if not rewrites:
        p("none (no view, materialized view or rule depends on the 8 tables in this catalog)")
    for r in rewrites:
        rights_json = json.loads(r["effective_role_privileges"]) if r["effective_role_privileges"] else []
        w = [x["role"] for x in rights_json if x["role"] in CLIENTS
             and (x["insert"] or x["update"] or x["delete"] or x["truncate"])]
        p(f"- {r['target']} <- {r['dependent']} kind={r['relkind']} rule={r['rulename']} depth={r['depth']} "
          f"owner={r['owner']} options={r['reloptions'] or '-'} acl={r['relation_acl'] or 'NULL(default)'}")
        p(f"    client roles with effective write privilege on it: {w or 'none'}")


if __name__ == "__main__":
    main()
