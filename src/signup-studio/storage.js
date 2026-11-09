import { BlobPreconditionFailedError, get, list, put } from '@vercel/blob';

export function blobSignupStore(token, environment) {
  const root = `sign-up-studio/v1/${environment}/`;
  return {
    async read(path) {
      const result = await get(root + path, {
        access: 'private', token, useCache: false, abortSignal: AbortSignal.timeout(7000),
      });
      if (!result) return null;
      if (!result.stream || !result.blob.etag) throw new Error('Sign-up data could not be read consistently.');
      return { event: await new Response(result.stream).json(), etag: result.blob.etag };
    },

    async write(path, event, etag) {
      const options = {
        access: 'private', token, addRandomSuffix: false, allowOverwrite: !!etag,
        contentType: 'application/json', abortSignal: AbortSignal.timeout(7000),
      };
      try {
        await put(root + path, JSON.stringify(event), etag ? { ...options, ifMatch: etag } : options);
        return true;
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) return false;
        if (!etag && /blob already exists/i.test(error.message || '')) return false;
        throw error;
      }
    },

    async list(prefix) {
      const paths = [];
      let cursor;
      do {
        const page = await list({ prefix: root + prefix, limit: 100, cursor, token, abortSignal: AbortSignal.timeout(7000) });
        paths.push(...page.blobs.map(blob => blob.pathname.slice(root.length)));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return paths;
    },
  };
}
