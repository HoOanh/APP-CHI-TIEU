import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      try {
        // Dynamic import to avoid Edge runtime crash with libsql file: URL
        const { getDb } = await import('@/lib/db');
        const db = await getDb();
        await db.execute({
          sql: `INSERT INTO users (email, name, avatar) VALUES (?, ?, ?)
                ON CONFLICT(email) DO UPDATE SET name = ?, avatar = ?, updated_at = datetime('now')`,
          args: [user.email, user.name || '', user.image || '', user.name || '', user.image || ''],
        });
      } catch (error) {
        console.error('Failed to upsert user:', error);
        return false;
      }
      return true;
    },
    async session({ session }) {
      if (session.user?.email) {
        try {
          const { getDb } = await import('@/lib/db');
          const db = await getDb();
          const result = await db.execute({
            sql: 'SELECT id FROM users WHERE email = ?',
            args: [session.user.email],
          });
          if (result.rows[0]) {
            session.user.id = String(result.rows[0].id);
          }
        } catch (error) {
          console.error('Failed to hydrate session user:', error);
        }
      }
      return session;
    },
  },
});
