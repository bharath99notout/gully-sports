import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Use – GullySports',
  description: 'Terms governing your use of GullySports.',
};

const LAST_UPDATED = 'May 8, 2026';

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 text-gray-200">
      <Link href="/" className="text-sm text-emerald-400 hover:underline">← Back</Link>

      <h1 className="text-3xl font-bold text-white mt-6 mb-2">Terms of Use</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: {LAST_UPDATED}</p>

      <Section title="What this is">
        <p>
          GullySports is a free-to-use amateur sports scoring and player-profile
          app. By using it you agree to these terms. They&apos;re short on
          purpose — read them.
        </p>
      </Section>

      <Section title="Your account">
        <ul className="list-disc pl-6 space-y-2">
          <li>You must be at least 13 years old to use GullySports.</li>
          <li>You&apos;re responsible for what happens under your account.</li>
          <li>Use a real name. One account per person.</li>
          <li>
            We may suspend or delete accounts that abuse the system —
            spam, harassment, fake matches, attempts to manipulate the
            leaderboard, or impersonation.
          </li>
        </ul>
      </Section>

      <Section title="What you can do">
        <ul className="list-disc pl-6 space-y-2">
          <li>Score your own matches and events.</li>
          <li>Add other players to matches you organize.</li>
          <li>View public leaderboards and profiles.</li>
          <li>Share your profile and match results.</li>
        </ul>
      </Section>

      <Section title="What you can't do">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            Submit fake matches, fabricate scores, or otherwise inflate
            statistics.
          </li>
          <li>
            Harass, threaten, or post offensive content directed at other
            users.
          </li>
          <li>
            Scrape, copy, or redistribute large amounts of data from the
            service.
          </li>
          <li>
            Try to break the service — exploiting vulnerabilities, attempting
            unauthorized access, etc.
          </li>
          <li>
            Use the service for anything illegal or for commercial purposes
            without our written permission.
          </li>
        </ul>
      </Section>

      <Section title="Match data accuracy">
        <p>
          Stats and leaderboards reflect what users enter. We do not verify
          the accuracy of any individual match. Disputes between players over
          scores should be resolved between the players or the event host.
          The trust workflow inside the app helps you confirm or dispute
          matches you were tagged in.
        </p>
      </Section>

      <Section title="Service availability">
        <p>
          We provide GullySports &ldquo;as-is&rdquo;. We don&apos;t guarantee
          uptime, accuracy, or that the service will continue indefinitely.
          We may change features, take the service offline for maintenance, or
          discontinue it entirely.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the fullest extent allowed by law, we are not liable for any
          indirect, incidental, special, or consequential damages arising
          from your use of GullySports. Total liability for any claim is
          limited to ₹100 (one hundred rupees).
        </p>
      </Section>

      <Section title="Termination">
        <p>
          You can stop using GullySports at any time. Email us to delete your
          account. We can suspend or terminate your access for violating
          these terms.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms as the app evolves. Continuing to use
          the service after a change means you accept the updated terms.
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
