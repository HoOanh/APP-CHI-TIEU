import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user }) {
      if (!user) return token;
      if (!user.email) return null;
      const { getDb } = await import('@/lib/db');
      const db = await getDb();
      const result = await db.execute({
        sql: `INSERT INTO users (email, name, avatar) VALUES (?, ?, ?)
              ON CONFLICT(email) DO UPDATE SET name = excluded.name, avatar = excluded.avatar,
                updated_at = datetime('now')
              RETURNING id`,
        args: [user.email, user.name || '', user.image || ''],
      });
      token.accountId = String(result.rows[0].id);
      return token;
    },
    async session({ session, token }) {
      if (typeof token.accountId === 'string') {
        session.user.id = token.accountId;
        return session;
      }
      if (session.user?.email) {
        try {
          const { getDb } = await import('@/lib/db');
          const db = await getDb();
          const result = await db.execute({
            sql: 'SELECT id FROM users WHERE email = ?',
            args: [session.user.email],
          });
          if (result.rows[0]) session.user.id = String(result.rows[0].id);
        } catch (error) {
          console.error('Failed to hydrate legacy session user:', error);
        }
      }
      return session;
    },
  },
});
