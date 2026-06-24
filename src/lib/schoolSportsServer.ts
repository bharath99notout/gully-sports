import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerAuth } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SCHOOL_DEFAULT_CLASSES, type SchoolGender, type SchoolResultMetric } from '@/lib/schoolSports';

export type SchoolMemberRole = 'admin' | 'teacher' | 'scorer';

export type SchoolMember = {
  id: string;
  school_id: string;
  user_id: string;
  role: SchoolMemberRole;
  created_at: string;
  profile?: { id: string; name: string | null; phone: string | null; avatar_url: string | null } | null;
};

export type SchoolMembership = {
  role: SchoolMemberRole;
  school: School;
};

export type School = {
  id: string;
  name: string;
  logo_url: string | null;
  created_by: string;
  created_at: string;
};

export type SchoolHouse = {
  id: string;
  school_id: string;
  name: string;
  color: string | null;
  sort_order: number;
};

export type SchoolClass = {
  id: string;
  school_id: string;
  name: string;
  sort_order: number;
};

export type SchoolStudent = {
  id: string;
  school_id: string;
  profile_id: string | null;
  house_id: string | null;
  class_id: string | null;
  name: string;
  class_label: string | null;
  gender: SchoolGender;
  created_at: string;
  house?: { id: string; name: string; color: string | null } | null;
  schoolClass?: { id: string; name: string } | null;
  profile?: { id: string; name: string | null; avatar_url: string | null } | null;
};

export type SchoolMeet = {
  id: string;
  school_id: string;
  name: string;
  meet_date: string;
  status: 'draft' | 'live' | 'completed';
  created_at: string;
};

export type SchoolMeetEvent = {
  id: string;
  school_id: string;
  meet_id: string;
  event_key: string;
  name: string;
  event_type: 'track' | 'field';
  result_metric: SchoolResultMetric;
  gender_category: SchoolGender;
  class_id: string | null;
  class_group: string | null;
  sort_order: number;
  schoolClass?: { id: string; name: string } | null;
};

export type SchoolEventResult = {
  id: string;
  school_id: string;
  meet_id: string;
  event_id: string;
  student_id: string;
  result_value: number | null;
  rank: number | null;
  medal: 'gold' | 'silver' | 'bronze' | null;
  points: number;
  notes: string | null;
  student?: SchoolStudent | null;
};

export type SchoolWorkspace = {
  school: School | null;
  role: SchoolMemberRole | null;
  canEdit: boolean;
  canManageAccess: boolean;
  schoolOptions: SchoolMembership[];
  houses: SchoolHouse[];
  classes: SchoolClass[];
  students: SchoolStudent[];
  meets: SchoolMeet[];
  members: SchoolMember[];
  studentsError: string | null;
};

export async function getSchoolWorkspace(schoolId?: string | null): Promise<SchoolWorkspace> {
  const { supabase, user } = await getServerAuth();
  if (!user) return emptyWorkspace();

  const schoolOptions = await getSchoolMembershipsForUser(supabase, user.id);
  const membership = pickSchoolMembership(schoolOptions, schoolId);
  const school = membership?.school ?? null;
  if (!membership || !school) return { ...emptyWorkspace(), schoolOptions };
  const role = membership.role;

  const [{ data: houses }, { data: meets }] = await Promise.all([
    supabase
      .from('school_houses')
      .select('id, school_id, name, color, sort_order')
      .eq('school_id', school.id)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('school_meets')
      .select('id, school_id, name, meet_date, status, created_at')
      .eq('school_id', school.id)
      .order('meet_date', { ascending: false })
      .limit(20),
  ]);
  const normalizedHouses = (houses ?? []) as SchoolHouse[];
  const normalizedClasses = await fetchSchoolClasses(supabase, school.id);
  const studentResult = await fetchSchoolStudents(supabase, school.id, normalizedHouses, normalizedClasses, 'created_at');
  const members = role === 'admin' ? await fetchSchoolMembers(school.id) : [];

  return {
    school,
    role,
    canEdit: canEditSchool(role),
    canManageAccess: role === 'admin',
    schoolOptions,
    houses: normalizedHouses,
    classes: normalizedClasses,
    students: studentResult.students,
    meets: (meets ?? []) as SchoolMeet[],
    members,
    studentsError: studentResult.error,
  };
}

export async function getSchoolMeet(meetId: string) {
  const { supabase, user } = await getServerAuth();
  if (!user) return null;

  const { data: meet } = await supabase
    .from('school_meets')
    .select('id, school_id, name, meet_date, status, created_at')
    .eq('id', meetId)
    .maybeSingle();
  if (!meet) return null;

  const [{ data: school }, { data: houses }, eventResponse, resultResponse] = await Promise.all([
    supabase.from('schools').select('id, name, logo_url, created_by, created_at').eq('id', meet.school_id).maybeSingle(),
    supabase.from('school_houses').select('id, school_id, name, color, sort_order').eq('school_id', meet.school_id).order('sort_order'),
    supabase.from('school_meet_events').select('id, school_id, meet_id, event_key, name, event_type, result_metric, gender_category, class_id, class_group, sort_order').eq('meet_id', meetId).order('sort_order'),
    supabase
      .from('school_event_results')
      .select('id, school_id, meet_id, event_id, student_id, result_value, rank, medal, points, notes, student:school_students(id, school_id, profile_id, house_id, class_id, name, class_label, gender, created_at, house:school_houses(id, name, color))')
      .eq('meet_id', meetId),
  ]);
  let events = eventResponse.data;
  if (eventResponse.error && isMissingClassSchemaError(eventResponse.error.message)) {
    const fallback = await supabase
      .from('school_meet_events')
      .select('id, school_id, meet_id, event_key, name, event_type, result_metric, gender_category, class_group, sort_order')
      .eq('meet_id', meetId)
      .order('sort_order');
    events = fallback.data?.map(event => ({ ...event, class_id: null })) ?? null;
  }
  let results: unknown = resultResponse.data;
  if (resultResponse.error && isMissingClassSchemaError(resultResponse.error.message)) {
    const fallback = await supabase
      .from('school_event_results')
      .select('id, school_id, meet_id, event_id, student_id, result_value, rank, medal, points, notes, student:school_students(id, school_id, profile_id, house_id, name, class_label, gender, created_at, house:school_houses(id, name, color))')
      .eq('meet_id', meetId);
    results = fallback.data;
  }
  const normalizedClasses = await fetchSchoolClasses(supabase, meet.school_id);
  const classById = new Map(normalizedClasses.map(row => [row.id, row]));
  const role = await getSchoolRoleForUser(supabase, meet.school_id, user.id);

  return {
    school: school as School | null,
    meet: meet as SchoolMeet,
    role,
    canEdit: canEditSchool(role),
    houses: (houses ?? []) as SchoolHouse[],
    events: ((events ?? []) as SchoolMeetEvent[]).map(event => ({
      ...event,
      schoolClass: event.class_id ? classById.get(event.class_id) ?? null : null,
    })),
    results: normalizeResults(results),
  };
}

export async function getSchoolEvent(eventId: string) {
  const { supabase, user } = await getServerAuth();
  if (!user) return null;

  const eventResult = await supabase
    .from('school_meet_events')
    .select('id, school_id, meet_id, event_key, name, event_type, result_metric, gender_category, class_id, class_group, sort_order')
    .eq('id', eventId)
    .maybeSingle();
  let event = eventResult.data;
  if (eventResult.error && isMissingClassSchemaError(eventResult.error.message)) {
    const fallback = await supabase
      .from('school_meet_events')
      .select('id, school_id, meet_id, event_key, name, event_type, result_metric, gender_category, class_group, sort_order')
      .eq('id', eventId)
      .maybeSingle();
    event = fallback.data ? { ...fallback.data, class_id: null } : null;
  }
  if (!event) return null;

  const [{ data: school }, { data: meet }, { data: houses }, resultResponse] = await Promise.all([
    supabase.from('schools').select('id, name, logo_url, created_by, created_at').eq('id', event.school_id).maybeSingle(),
    supabase.from('school_meets').select('id, school_id, name, meet_date, status, created_at').eq('id', event.meet_id).maybeSingle(),
    supabase.from('school_houses').select('id, school_id, name, color, sort_order').eq('school_id', event.school_id).order('sort_order'),
    supabase
      .from('school_event_results')
      .select('id, school_id, meet_id, event_id, student_id, result_value, rank, medal, points, notes, student:school_students(id, school_id, profile_id, house_id, class_id, name, class_label, gender, created_at, house:school_houses(id, name, color))')
      .eq('event_id', eventId)
      .order('rank', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
  ]);
  let results: unknown = resultResponse.data;
  if (resultResponse.error && isMissingClassSchemaError(resultResponse.error.message)) {
    const fallback = await supabase
      .from('school_event_results')
      .select('id, school_id, meet_id, event_id, student_id, result_value, rank, medal, points, notes, student:school_students(id, school_id, profile_id, house_id, name, class_label, gender, created_at, house:school_houses(id, name, color))')
      .eq('event_id', eventId)
      .order('rank', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    results = fallback.data;
  }
  const normalizedClasses = await fetchSchoolClasses(supabase, event.school_id);
  const role = await getSchoolRoleForUser(supabase, event.school_id, user.id);
  const studentResult = await fetchSchoolStudents(
    supabase,
    event.school_id,
    (houses ?? []) as SchoolHouse[],
    normalizedClasses,
    'name',
    event.gender_category as SchoolGender,
    event.class_id as string | null,
  );
  const classById = new Map(normalizedClasses.map(row => [row.id, row]));

  return {
    school: school as School | null,
    meet: meet as SchoolMeet | null,
    role,
    canEdit: canEditSchool(role),
    event: {
      ...(event as SchoolMeetEvent),
      schoolClass: event.class_id ? classById.get(event.class_id) ?? null : null,
    },
    students: studentResult.students,
    results: normalizeResults(results),
    studentsError: studentResult.error,
  };
}

export async function getFirstSchoolForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<School | null> {
  const membership = await getFirstSchoolMembershipForUser(supabase, userId);
  return membership?.school ?? null;
}

export async function getFirstSchoolMembershipForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<SchoolMembership | null> {
  const memberships = await getSchoolMembershipsForUser(supabase, userId);
  return memberships[0] ?? null;
}

export async function getSchoolMembershipForUser(
  supabase: SupabaseClient,
  userId: string,
  schoolId: string,
): Promise<SchoolMembership | null> {
  const memberships = await getSchoolMembershipsForUser(supabase, userId);
  return memberships.find(membership => membership.school.id === schoolId) ?? null;
}

export async function getSchoolMembershipsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<SchoolMembership[]> {
  const { data: membership } = await supabase
    .from('school_members')
    .select('role, school:schools(id, name, logo_url, created_by, created_at)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return ((membership ?? []) as Array<{ role?: string | null; school?: School | School[] | null }>)
    .map(row => {
      const raw = row.school;
      const school = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
      if (!school) return null;
      return {
        role: normalizeSchoolRole(row.role),
        school,
      };
    })
    .filter((row): row is SchoolMembership => Boolean(row));
}

export async function getSchoolRoleForUser(
  supabase: SupabaseClient,
  schoolId: string,
  userId: string,
): Promise<SchoolMemberRole | null> {
  const { data } = await supabase
    .from('school_members')
    .select('role')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .maybeSingle();
  return data ? normalizeSchoolRole((data as { role?: string | null }).role) : null;
}

export function canEditSchool(role: SchoolMemberRole | null) {
  return role === 'admin' || role === 'teacher';
}

export function schoolRoleLabel(role: SchoolMemberRole | null) {
  if (role === 'admin') return 'Admin';
  if (role === 'teacher') return 'Edit';
  if (role === 'scorer') return 'View';
  return 'No access';
}

function normalizeSchoolRole(role: string | null | undefined): SchoolMemberRole {
  if (role === 'admin' || role === 'teacher' || role === 'scorer') return role;
  return 'scorer';
}

function emptyWorkspace(): SchoolWorkspace {
  return {
    school: null,
    role: null,
    canEdit: false,
    canManageAccess: false,
    schoolOptions: [],
    houses: [],
    classes: [],
    students: [],
    meets: [],
    members: [],
    studentsError: null,
  };
}

function pickSchoolMembership(memberships: SchoolMembership[], schoolId?: string | null) {
  if (schoolId) {
    const selected = memberships.find(membership => membership.school.id === schoolId);
    if (selected) return selected;
  }
  return memberships[0] ?? null;
}

type SchoolStudentRow = Omit<SchoolStudent, 'house' | 'profile'>;

async function fetchSchoolMembers(schoolId: string): Promise<SchoolMember[]> {
  try {
    const admin = createAdminClient();
    const { data: members, error } = await admin
      .from('school_members')
      .select('id, school_id, user_id, role, created_at')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('[schoolSports] member fetch failed', error.message);
      return [];
    }

    const rows = (members ?? []) as SchoolMember[];
    const userIds = rows.map(member => member.user_id);
    const { data: profiles, error: profileError } = userIds.length
      ? await admin
        .from('profiles')
        .select('id, name, phone, avatar_url')
        .in('id', userIds)
      : { data: [], error: null };
    if (profileError) {
      console.warn('[schoolSports] member profile fetch failed', profileError.message);
    }

    const profileById = new Map(
      ((profiles ?? []) as NonNullable<SchoolMember['profile']>[]).map(profile => [profile.id, profile]),
    );
    return rows.map(member => ({
      ...member,
      role: normalizeSchoolRole(member.role),
      profile: profileById.get(member.user_id) ?? null,
    }));
  } catch (err) {
    console.warn('[schoolSports] member fetch failed', err instanceof Error ? err.message : err);
    return [];
  }
}

async function fetchSchoolClasses(supabase: SupabaseClient, schoolId: string): Promise<SchoolClass[]> {
  const { data, error } = await supabase
    .from('school_classes')
    .select('id, school_id, name, sort_order')
    .eq('school_id', schoolId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (!error) return (data ?? []) as SchoolClass[];
  if (!isMissingClassSchemaError(error.message)) {
    console.warn('[schoolSports] class fetch failed', error.message);
  }
  return SCHOOL_DEFAULT_CLASSES.map((name, index) => ({
    id: `legacy:${name}`,
    school_id: schoolId,
    name,
    sort_order: index,
  }));
}

async function fetchSchoolStudents(
  supabase: SupabaseClient,
  schoolId: string,
  houses: SchoolHouse[],
  classes: SchoolClass[],
  orderBy: 'created_at' | 'name',
  gender?: SchoolGender,
  classId?: string | null,
): Promise<{ students: SchoolStudent[]; error: string | null }> {
  const legacyClassName = classId?.startsWith('legacy:') ? classId.slice('legacy:'.length) : null;
  let query = supabase
    .from('school_students')
    .select('id, school_id, profile_id, house_id, class_id, name, class_label, gender, created_at')
    .eq('school_id', schoolId);
  if (gender) {
    query = query.eq('gender', gender);
  }
  if (classId && !legacyClassName) {
    query = query.eq('class_id', classId);
  }
  if (legacyClassName) {
    query = query.eq('class_label', legacyClassName);
  }

  query = orderBy === 'name'
    ? query.order('name', { ascending: true })
    : query.order('created_at', { ascending: false }).limit(80);

  let { data: rows, error } = await query;
  if (error && isMissingClassSchemaError(error.message)) {
    let fallback = supabase
      .from('school_students')
      .select('id, school_id, profile_id, house_id, name, class_label, gender, created_at')
      .eq('school_id', schoolId);
    if (gender) fallback = fallback.eq('gender', gender);
    if (legacyClassName) fallback = fallback.eq('class_label', legacyClassName);
    fallback = orderBy === 'name'
      ? fallback.order('name', { ascending: true })
      : fallback.order('created_at', { ascending: false }).limit(80);
    const fallbackResult = await fallback;
    rows = fallbackResult.data?.map(row => ({ ...row, class_id: null })) ?? null;
    error = fallbackResult.error;
  }
  if (error) {
    console.warn('[schoolSports] student fetch failed', error.message);
    return { students: [], error: error.message };
  }

  const studentRows = (rows ?? []) as SchoolStudentRow[];
  const profileIds = [...new Set(studentRows.map(row => row.profile_id).filter(Boolean) as string[])];
  const profileById = new Map<string, NonNullable<SchoolStudent['profile']>>();
  if (profileIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, avatar_url')
      .in('id', profileIds);
    if (profileError) {
      console.warn('[schoolSports] linked profile fetch failed', profileError.message);
    } else {
      for (const profile of profiles ?? []) {
        profileById.set(profile.id, profile);
      }
    }
  }

  const houseById = new Map(houses.map(house => [house.id, house]));
  const classById = new Map(classes.map(schoolClass => [schoolClass.id, schoolClass]));
  return {
    error: null,
    students: studentRows.map(row => ({
      ...row,
      house: row.house_id ? houseById.get(row.house_id) ?? null : null,
      schoolClass: row.class_id
        ? classById.get(row.class_id) ?? null
        : classes.find(schoolClass => schoolClass.name.toLowerCase() === (row.class_label ?? '').toLowerCase()) ?? null,
      profile: row.profile_id ? profileById.get(row.profile_id) ?? null : null,
    })),
  };
}

function isMissingClassSchemaError(message: string) {
  return message.includes('school_classes') ||
    message.includes('class_id') ||
    message.includes('Could not find') && message.includes('class');
}

function normalizeResults(raw: unknown): SchoolEventResult[] {
  return ((raw ?? []) as Array<SchoolEventResult & {
    student?: SchoolEventResult['student'] | SchoolEventResult['student'][];
  }>).map(row => ({
    ...row,
    student: Array.isArray(row.student) ? row.student[0] ?? null : row.student ?? null,
    result_value: row.result_value == null ? null : Number(row.result_value),
    points: Number(row.points ?? 0),
  }));
}
