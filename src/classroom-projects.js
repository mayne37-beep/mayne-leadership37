import { createClient } from '@supabase/supabase-js';
import { AUTH_KEY, AUTH_URL } from './lms/model.js';

const SUMMARY = 'id,name,slide_count,revision,created_at,updated_at';
const MAX_PROJECT_BYTES = 40 * 1024 * 1024;
const CONFLICT = 'This project changed on another device or tab. Open its latest version or save your edits as a copy.';

function checked({ data, error, status }) {
  if (!error) return data;
  if (status === 401) throw new Error('Your sign-in expired. Sign in again to open your website projects.');
  if (status === 413 || error.code === '23514') {
    throw new Error('The website could not save this project. Try reducing its image sizes or save a browser copy.');
  }
  throw new Error('Website projects are temporarily unavailable. Try again in a moment.');
}

export function openWebsiteProjects(onAccount) {
  const client = createClient(AUTH_URL, AUTH_KEY, {
    auth: { storageKey: 'mayne-classroom-project-auth', detectSessionInUrl: false },
    db: { timeout: 30000 },
  });
  client.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => onAccount(session?.user ?? null), 0);
  });

  const table = () => client.from('crs_saved_projects');
  const owned = (query, userId, id) => query.eq('user_id', userId).eq('id', id);
  const summary = (userId, id) => owned(table().select(SUMMARY), userId, id).maybeSingle();

  async function write(userId, id, changes, revision, skipExisting = false) {
    const nextRevision = crypto.randomUUID();
    const values = { ...changes, revision: nextRevision };
    const result = revision
      ? await owned(table().update(values), userId, id).eq('revision', revision).select(SUMMARY).maybeSingle()
      : await table().insert({ ...values, user_id: userId, id }).select(SUMMARY).single();
    if (result.data && !result.error) return result.data;

    // A retry can encounter the row already committed by this request.
    if (result.error?.code === '23505' || result.status === 0 || result.status >= 500) {
      const latest = (await summary(userId, id)).data;
      if (latest?.revision === nextRevision) return latest;
      if (latest && skipExisting) return { ...latest, alreadyExists: true };
      if (latest && !revision) throw new Error(CONFLICT);
    }
    checked(result);
    throw new Error(CONFLICT);
  }

  return {
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw new Error('Could not sign out. Try again.');
    },
    async list(userId) {
      return checked(await table().select(SUMMARY).eq('user_id', userId)
        .order('updated_at', { ascending: false }).order('id').limit(500));
    },
    async get(userId, id) {
      const record = checked(await owned(table().select(`${SUMMARY},project`), userId, id).maybeSingle());
      if (!record) throw new Error('This website project is no longer available. Refresh My Projects.');
      return record;
    },
    async save(userId, { id, name, project }, revision, { skipExisting = false } = {}) {
      if (new Blob([JSON.stringify(project)]).size > MAX_PROJECT_BYTES) {
        throw new Error('Website projects can be up to 40 MB. Reduce image sizes or save a browser copy.');
      }
      return write(userId, id, { name, project }, revision, skipExisting);
    },
    rename: (userId, { id, revision }, name) => write(userId, id, { name }, revision),
    async remove(userId, { id, revision }) {
      const record = checked(await owned(table().delete(), userId, id).eq('revision', revision).select('id').maybeSingle());
      if (!record && checked(await summary(userId, id))) throw new Error(CONFLICT);
    },
  };
}
