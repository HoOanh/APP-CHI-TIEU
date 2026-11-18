import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';

const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_CLIENT_ID !== 'your-google-client-id' &&
  process.env.GOOGLE_CLIENT_SECRET !== 'your-google-client-secret',
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: 'Email và mật khẩu',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mật khẩu', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string'
          ? credentials.email.trim().toLowerCase()
          : '';
        const password = typeof credentials?.password === 'string'
          ? credentials.password
          : '';
        if (!email || !password) return null;

        const [{ getDb }, { verifyPassword }] = await Promise.all([
          import('@/lib/db'),
          import('@/lib/password'),
        ]);
        const db = await getDb();
        const result = await db.execute({
          sql: 'SELECT id, email, name, avatar, password_hash FROM users WHERE email = ?',
          args: [email],
        });
        const row = result.rows[0];
        const passwordHash = row?.password_hash ? String(row.password_hash) : '';
        if (!row || !passwordHash || !(await verifyPassword(password, passwordHash))) {
          return null;
        }

        return {
          id: String(row.id),
          email: String(row.email),
          name: String(row.name || row.email),
          image: String(row.avatar || ''),
        };
      },
    }),
    ...(googleConfigured
      ? [Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        })]
      : []),
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
