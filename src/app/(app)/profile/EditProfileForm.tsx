'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { Profile } from '@/types';

export default function EditProfileForm({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('profiles').update({ name, phone }).eq('id', user!.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <Input
        label="Name"
        value={name}
        onChange={e => setName(e.target.value)}
        required
      />
      <Input
        label="Phone (optional)"
        type="tel"
        value={phone}
        onChange={e => setPhone(e.target.value)}
        placeholder="+91 9876543210"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving} size="md">
          Save Changes
        </Button>
        {saved && <span className="text-sm text-emerald-400">Saved!</span>}
      </div>
    </form>
  );
}
