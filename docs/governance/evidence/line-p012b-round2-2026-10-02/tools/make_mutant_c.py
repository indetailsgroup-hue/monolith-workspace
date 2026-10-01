"""Write mutant C of 0199: the step-1 missing-identity check removed (exactly 7 lines),
nothing else changed. Used only by the fail-closed suite through -v p012_migration;
never placed in supabase/migrations. usage: python make_mutant_c.py <repo> <out-file>"""
import sys
from pathlib import Path

src = (Path(sys.argv[1]) / "supabase/migrations/0199_line_oa_restrict_definer_execute.sql").read_text(encoding="utf-8")
old = """  select array_agg(sig order by sig) into v_problems
  from (select split_part(x, '=', 1) as sig from unnest(v_matrix) x) m
  where to_regprocedure('public.' || sig) is null;
  if cardinality(v_problems) > 0 then
    raise exception 'B12: matrix identity missing: %', array_to_string(v_problems, ', ')
      using errcode = 'object_not_in_prerequisite_state';
  end if;
"""
assert src.count(old) == 1
Path(sys.argv[2]).write_text(src.replace(old, ""), encoding="utf-8", newline="\n")
print("mutant C written:", sys.argv[2])
