import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      pwRole: string | null;
      pwApp: string | null;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    pwRole: string | null;
    pwApp: string | null;
  }
}
