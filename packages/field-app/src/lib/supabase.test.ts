import { afterEach, describe, expect, it, vi } from 'vitest';

import { supabase } from './supabase';

describe('supabase() client config guard (FS-B1-04)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are unset', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    // The field app must never create an unconfigured Supabase client — it
    // throws instead of silently talking to nowhere.
    expect(() => supabase()).toThrow(/VITE_SUPABASE/);
  });
});
