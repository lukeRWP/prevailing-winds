import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';

/**
 * Map Entra security group object IDs to PW roles.
 * Admin group checked first; then per-app groups (AUTH_ENTRA_GROUP_*).
 */
function resolveRole(groups: string[]): { role: 'admin' | 'app'; app?: string } | null {
  const adminGroupId = process.env.AUTH_ENTRA_ADMIN_GROUP_ID;

  if (adminGroupId && groups.includes(adminGroupId)) {
    return { role: 'admin' };
  }

  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^AUTH_ENTRA_GROUP_(.+)$/);
    if (match && value && groups.includes(value)) {
      return { role: 'app', app: match[1].toLowerCase() };
    }
  }

  return null;
}

/**
 * Resolve the actual API bearer token from server-side env vars.
 * Called by proxy routes at request time — never serialized into the JWT.
 */
export function resolveApiToken(role: string | null, app?: string | null): string | null {
  if (role === 'admin') {
    return process.env.ADMIN_TOKEN || null;
  }
  if (role === 'app' && app) {
    return process.env[`APP_TOKEN_${app.toUpperCase()}`] || null;
  }
  return null;
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      authorization: {
        params: {
          scope: 'openid profile email',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  callbacks: {
    jwt({ token, account, profile }) {
      if (account && profile) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const groups: string[] = (profile as any).groups || [];

        // Detect group overage (>200 groups, Entra omits claim)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!groups.length && (profile as any)._claim_names?.groups) {
          token.pwRole = null;
          token.pwApp = null;
          return token;
        }

        const resolved = resolveRole(groups);
        if (resolved) {
          token.pwRole = resolved.role;
          token.pwApp = resolved.app || null;
        } else {
          token.pwRole = null;
          token.pwApp = null;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.name = (profile as any).name || (profile as any).preferred_username;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.email = (profile as any).email;
      }
      return token;
    },
    session({ session, token }) {
      session.user.pwRole = token.pwRole as string | null;
      session.user.pwApp = token.pwApp as string | null;
      return session;
    },
    authorized({ auth: session }) {
      if (!session?.user?.pwRole) {
        return false;
      }
      return true;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
});
