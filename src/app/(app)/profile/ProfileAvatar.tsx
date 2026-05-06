import AvatarUpload from '@/components/AvatarUpload';

/**
 * Compact avatar tile for the profile header. Visual style matches
 * AthleteCard's placeholder — same emerald→teal gradient — so users see
 * the same identity across dashboard / public profile / settings.
 */
export default function ProfileAvatar({
  userId, name, avatarUrl,
}: {
  userId: string;
  name: string;
  avatarUrl: string | null | undefined;
}) {
  const initial = (name?.trim()?.[0] ?? 'P').toUpperCase();
  return (
    <div className="relative w-16 h-16 shrink-0">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          className="w-16 h-16 rounded-full object-cover border-4 border-gray-900"
        />
      ) : (
        <div className="w-16 h-16 rounded-full border-4 border-gray-900 bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center font-bold text-white text-2xl">
          {initial}
        </div>
      )}
      <div className="absolute -bottom-1 -right-1">
        <AvatarUpload userId={userId} />
      </div>
    </div>
  );
}
