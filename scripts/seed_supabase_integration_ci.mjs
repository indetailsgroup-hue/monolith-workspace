import { createClient } from '@supabase/supabase-js';

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TEST_ORG_A_ID',
  'TEST_ORG_B_ID',
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const orgAId = process.env.TEST_ORG_A_ID;
const orgBId = process.env.TEST_ORG_B_ID;
const password = process.env.TEST_ORG_A_USER_PASS ?? 'TestPa$$0rg4';
const emailA = process.env.TEST_ORG_A_USER_EMAIL ?? 'org-a-user@monolith-test.local';
const emailB = process.env.TEST_ORG_B_USER_EMAIL ?? 'org-b-user@monolith-test.local';

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

async function upsertOrganization(orgId, name, slug) {
  const { error } = await admin.from('organizations').upsert({
    org_id: orgId,
    name,
    slug,
    plan: 'ENTERPRISE',
    status: 'ACTIVE',
    max_users: 999,
    max_jobs_per_month: 9999,
  }, { onConflict: 'org_id' });
  if (error) throw new Error(`seed organization ${name}: ${error.message}`);
}

async function findUser(email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`list users: ${error.message}`);
    const user = data.users.find((candidate) => candidate.email === email);
    if (user) return user;
    if (data.users.length < 100) break;
  }
  return null;
}

async function ensureUser(email) {
  const existing = await findUser(email);
  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`update user ${email}: ${error.message}`);
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`create user ${email}: ${error?.message ?? 'no user'}`);
  return data.user;
}

async function upsertMembership(orgId, user, email) {
  const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { roles: ['admin'], org_id: orgId },
  });
  if (metadataError) throw new Error(`seed user metadata ${email}: ${metadataError.message}`);

  const { error } = await admin.from('org_members').upsert({
    org_id: orgId,
    user_id: user.id,
    email,
    display_name: email.split('@')[0],
    role: 'ADMIN',
    is_active: true,
  }, { onConflict: 'org_id,user_id' });
  if (error) throw new Error(`seed membership ${email}: ${error.message}`);
}

await upsertOrganization(orgAId, 'Integration Org A', 'integration-org-a');
await upsertOrganization(orgBId, 'Integration Org B', 'integration-org-b');

const userA = await ensureUser(emailA);
const userB = await ensureUser(emailB);
await upsertMembership(orgAId, userA, emailA);
await upsertMembership(orgBId, userB, emailB);

console.log(`Seeded integration organizations and users: ${orgAId}, ${orgBId}`);
