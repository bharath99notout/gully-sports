import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy – GullySports',
  description: 'How GullySports collects, uses, and protects your data.',
};

const LAST_UPDATED = 'May 8, 2026';

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 text-gray-200">
      <Link href="/" className="text-sm text-emerald-400 hover:underline">← Back</Link>

      <h1 className="text-3xl font-bold text-white mt-6 mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: {LAST_UPDATED}</p>

      <Section title="Who we are">
        <p>
          GullySports (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is an amateur sports
          scoring and player-profile app. We&apos;re a small independent project,
          not a registered company. You can reach us at{' '}
          <a href="mailto:bharathhandady@gmail.com" className="text-emerald-400 hover:underline">
            bharathhandady@gmail.com
          </a>.
        </p>
      </Section>

      <Section title="What data we collect">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Account info:</strong> name, phone number (for OTP login),
            email address (optional), and profile picture (if you upload one).
          </li>
          <li>
            <strong>Match & player data:</strong> matches you create or play in,
            scores, team rosters, player statistics, events you host or join.
          </li>
          <li>
            <strong>Technical data:</strong> our hosting and database providers
            (Vercel and Supabase) automatically log IP addresses and request
            metadata for security and abuse prevention. We do not use this for
            tracking or advertising.
          </li>
          <li>
            <strong>What we do NOT collect:</strong> location, contacts,
            calendar, photos beyond what you upload, device identifiers,
            advertising IDs, or analytics across other apps.
          </li>
        </ul>
      </Section>

      <Section title="How we use your data">
        <ul className="list-disc pl-6 space-y-2">
          <li>To run your account and authenticate you (OTP login).</li>
          <li>To show your match history, statistics, and player profile.</li>
          <li>To let other players see your public profile, scores, and leaderboard rank.</li>
          <li>To run the trust workflow that confirms match results.</li>
          <li>To debug and improve the app.</li>
        </ul>
        <p className="mt-3">
          We do <strong>not</strong> sell your data. We do <strong>not</strong> show ads.
          We do <strong>not</strong> use your data to train AI models.
        </p>
      </Section>

      <Section title="Who we share data with">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Supabase</strong> (database, authentication, file storage):
            stores your account and match data on our behalf.{' '}
            <a href="https://supabase.com/privacy" target="_blank" rel="noreferrer"
              className="text-emerald-400 hover:underline">Supabase privacy policy</a>.
          </li>
          <li>
            <strong>Vercel</strong> (hosting): serves the app and logs requests.{' '}
            <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noreferrer"
              className="text-emerald-400 hover:underline">Vercel privacy policy</a>.
          </li>
        </ul>
        <p className="mt-3">We do not share your data with anyone else.</p>
      </Section>

      <Section title="Public vs. private data">
        <p>
          By design, GullySports is a social sports app. The following are{' '}
          <strong>visible to other users</strong> who view your profile or shared
          match links:
        </p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>Your name and avatar</li>
          <li>Matches you played in, scores, and team membership</li>
          <li>Your aggregate stats and leaderboard position</li>
        </ul>
        <p className="mt-3">
          Your phone number, email address, and login activity are{' '}
          <strong>private</strong> and never shown to other users.
        </p>
      </Section>

      <Section title="Your rights">
        <ul className="list-disc pl-6 space-y-2">
          <li>You can edit your name and avatar from your profile at any time.</li>
          <li>
            You can delete your account by emailing us at{' '}
            <a href="mailto:bharathhandady@gmail.com" className="text-emerald-400 hover:underline">
              bharathhandady@gmail.com
            </a>. We&apos;ll remove your profile and personal data within 30 days.
          </li>
          <li>
            Match data you participated in may be retained in aggregate (without
            your name) so that other players&apos; histories remain consistent.
          </li>
        </ul>
      </Section>

      <Section title="Children">
        <p>
          GullySports is intended for users aged 13 and older. We do not
          knowingly collect data from children under 13. If you believe a child
          has signed up, contact us and we&apos;ll remove the account.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Authentication uses secure phone OTP and short-lived session tokens.
          Data in transit is encrypted via HTTPS. Data at rest is stored by
          Supabase under their security practices.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We may update this policy as the app evolves. Material changes will be
          announced inside the app. The &ldquo;Last updated&rdquo; date at the
          top reflects the most recent revision.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions? Email{' '}
          <a href="mailto:bharathhandady@gmail.com" className="text-emerald-400 hover:underline">
            bharathhandady@gmail.com
          </a>.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold text-white mb-3">{title}</h2>
      <div className="text-sm text-gray-300 leading-relaxed space-y-2">
        {children}
      </div>
    </section>
  );
}
