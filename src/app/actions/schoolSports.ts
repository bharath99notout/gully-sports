'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerAuth } from '@/lib/supabase/server';
import {
  SCHOOL_DEFAULT_CLASSES,
  SCHOOL_DEFAULT_HOUSES,
  SCHOOL_EVENT_TEMPLATES,
  medalForRank,
  pointsForRank,
  type SchoolGender,
} from '@/lib/schoolSports';
import {
  canEditSchool,
  getFirstSchoolMembershipForUser,
  getSchoolMembershipForUser,
  getSchoolRoleForUser,
  type SchoolMemberRole,
} from '@/lib/schoolSportsServer';

type ActionResult<T = void> =
  | { ok: true; data: T extends void ? undefined : T }
  | { ok: false; error: string };

function cleanName(value: unknown, fallback = '') {
  return String(value ?? fallback).trim().replace(/\s+/g, ' ');
}

function parseHouses(raw: string) {
  const names = raw
    .split(',')
    .map(item => cleanName(item))
    .filter(Boolean);
  const unique = [...new Set(names)];
  return unique.length > 0 ? unique.slice(0, 8) : SCHOOL_DEFAULT_HOUSES;
}

function parseClasses(raw: string) {
  const names = raw
    .split(',')
    .map(item => cleanName(item))
    .filter(Boolean);
  const unique = [...new Set(names)];
  return unique.length > 0 ? unique.slice(0, 20) : SCHOOL_DEFAULT_CLASSES;
}

async function requireSchool(schoolId?: string | null) {
  const { supabase, user } = await getServerAuth();
  if (!user) return { supabase, user: null, school: null, error: 'Sign in to continue' };
  const selectedSchoolId = cleanName(schoolId);
  const membership = selectedSchoolId
    ? await getSchoolMembershipForUser(supabase, user.id, selectedSchoolId)
    : await getFirstSchoolMembershipForUser(supabase, user.id);
  if (!membership?.school) return { supabase, user, school: null, role: null, error: 'Create a school first' };
  return { supabase, user, school: membership.school, role: membership.role, error: null };
}

async function requireEditableSchool(schoolId?: string | null) {
  const result = await requireSchool(schoolId);
  if (!result.user || !result.school) return result;
  if (!canEditSchool(result.role)) {
    return { ...result, error: 'You only have view access for this school' };
  }
  return result;
}

async function requireSchoolAdmin(schoolId?: string | null) {
  const result = await requireSchool(schoolId);
  if (!result.user || !result.school) return result;
  if (result.role !== 'admin') {
    return { ...result, error: 'Only school admins can manage access' };
  }
  return result;
}

function normalizeAccessRole(role: string | null | undefined): Exclude<SchoolMemberRole, 'admin'> {
  return role === 'teacher' ? 'teacher' : 'scorer';
}

export async function createSchool(input: {
  name: string;
  housesCsv?: string;
  classesCsv?: string;
}): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await getServerAuth();
  if (!user) return { ok: false, error: 'Sign in to continue' };

  const name = cleanName(input.name);
  if (!name) return { ok: false, error: 'School name is required' };

  const schoolId = randomUUID();
  const { error: schoolErr } = await supabase
    .from('schools')
    .insert({ id: schoolId, name, created_by: user.id });
  if (schoolErr) return { ok: false, error: schoolErr.message };

  const { error: memberErr } = await supabase
    .from('school_members')
    .insert({ school_id: schoolId, user_id: user.id, role: 'admin' });
  if (memberErr) return { ok: false, error: memberErr.message };

  const houses = parseHouses(input.housesCsv ?? '');
  const { error: houseErr } = await supabase
    .from('school_houses')
    .insert(houses.map((house, index) => ({
      school_id: schoolId,
      name: house,
      sort_order: index,
    })));
  if (houseErr) return { ok: false, error: houseErr.message };

  const classes = parseClasses(input.classesCsv ?? '');
  const { error: classErr } = await supabase
    .from('school_classes')
    .insert(classes.map((className, index) => ({
      school_id: schoolId,
      name: className,
      sort_order: index,
    })));
  if (classErr && !isMissingClassSchemaError(classErr.message)) return { ok: false, error: classErr.message };

  revalidatePath('/school');
  revalidatePath('/school/setup');
  return { ok: true, data: { id: schoolId } };
}

export async function addSchoolStudent(input: {
  schoolId?: string | null;
  name: string;
  classId?: string | null;
  gender?: SchoolGender;
  houseId?: string | null;
  profileId?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const { supabase, user, school, error } = await requireEditableSchool(input.schoolId);
  if (!user || !school) return { ok: false, error: error ?? 'Create a school first' };
  if (error) return { ok: false, error };

  const name = cleanName(input.name);
  if (!name) return { ok: false, error: 'Student name is required' };
  if (input.gender !== 'boys' && input.gender !== 'girls') {
    return { ok: false, error: 'Select Boys or Girls for the student category' };
  }
  const gender = input.gender;
  const profileId = cleanName(input.profileId);
  const classId = cleanName(input.classId);
  if (!classId) return { ok: false, error: 'Select a class for the student' };
  const legacyClassName = classId.startsWith('legacy:') ? classId.slice('legacy:'.length) : null;

  const { data: schoolClass, error: classErr } = legacyClassName
    ? { data: { id: null, name: legacyClassName }, error: null }
    : await supabase
      .from('school_classes')
      .select('id, name')
      .eq('school_id', school.id)
      .eq('id', classId)
      .maybeSingle();
  if (classErr && !isMissingClassSchemaError(classErr.message)) return { ok: false, error: classErr.message };
  if (!schoolClass) return { ok: false, error: 'Class not found for this school' };

  if (input.houseId) {
    const { data: house } = await supabase
      .from('school_houses')
      .select('id')
      .eq('school_id', school.id)
      .eq('id', input.houseId)
      .maybeSingle();
    if (!house) return { ok: false, error: 'House not found for this school' };
  }

  if (profileId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('id', profileId)
      .maybeSingle();
    if (!profile) return { ok: false, error: 'Select an existing GullySports profile' };

    const { data: existingStudent } = await supabase
      .from('school_students')
      .select('id, name')
      .eq('school_id', school.id)
      .eq('profile_id', profile.id)
      .maybeSingle();
    if (existingStudent) {
      return {
        ok: false,
        error: `${existingStudent.name || profile.name || 'This profile'} is already added to this school`,
      };
    }
  }

  const insertRow = {
    school_id: school.id,
    name,
    class_id: schoolClass.id,
    class_label: schoolClass.name,
    gender,
    house_id: input.houseId || null,
    profile_id: profileId || null,
    created_by: user.id,
  };
  let { data, error: insertErr } = await supabase
    .from('school_students')
    .insert(insertRow)
    .select('id')
    .single();
  if (insertErr && isMissingClassSchemaError(insertErr.message)) {
    const legacyInsert = await supabase
      .from('school_students')
      .insert({
        school_id: school.id,
        name,
        class_label: schoolClass.name,
        gender,
        house_id: input.houseId || null,
        profile_id: profileId || null,
        created_by: user.id,
      })
      .select('id')
      .single();
    data = legacyInsert.data;
    insertErr = legacyInsert.error;
  }
  if (insertErr || !data) return { ok: false, error: insertErr?.message ?? 'Could not add student' };

  revalidatePath('/school');
  return { ok: true, data: { id: data.id } };
}

export async function addSchoolMember(input: {
  schoolId?: string | null;
  profileId: string;
  role: 'teacher' | 'scorer';
}): Promise<ActionResult> {
  const { user, school, error } = await requireSchoolAdmin(input.schoolId);
  if (!user || !school) return { ok: false, error: error ?? 'Create a school first' };
  if (error) return { ok: false, error };

  const profileId = cleanName(input.profileId);
  if (!profileId) return { ok: false, error: 'Select a user to add' };
  if (profileId === user.id) return { ok: false, error: 'You already have admin access' };

  const role = normalizeAccessRole(input.role);
  const admin = createAdminClient();
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id')
    .eq('id', profileId)
    .maybeSingle();
  if (profileErr) return { ok: false, error: profileErr.message };
  if (!profile) return { ok: false, error: 'User profile not found' };

  const { error: memberErr } = await admin
    .from('school_members')
    .upsert({
      school_id: school.id,
      user_id: profileId,
      role,
    }, { onConflict: 'school_id,user_id' });
  if (memberErr) return { ok: false, error: memberErr.message };

  revalidatePath('/school');
  return { ok: true, data: undefined };
}

export async function updateSchoolMemberRole(input: {
  schoolId?: string | null;
  memberId: string;
  role: 'teacher' | 'scorer';
}): Promise<ActionResult> {
  const { user, school, error } = await requireSchoolAdmin(input.schoolId);
  if (!user || !school) return { ok: false, error: error ?? 'Create a school first' };
  if (error) return { ok: false, error };

  const admin = createAdminClient();
  const { data: member, error: readErr } = await admin
    .from('school_members')
    .select('id, school_id, user_id, role')
    .eq('id', input.memberId)
    .eq('school_id', school.id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!member) return { ok: false, error: 'Member not found' };
  if (member.user_id === user.id || member.role === 'admin') {
    return { ok: false, error: 'Admin access cannot be changed here' };
  }

  const { error: updateErr } = await admin
    .from('school_members')
    .update({ role: normalizeAccessRole(input.role) })
    .eq('id', member.id);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath('/school');
  return { ok: true, data: undefined };
}

export async function removeSchoolMember(input: { schoolId?: string | null; memberId: string }): Promise<ActionResult> {
  const { user, school, error } = await requireSchoolAdmin(input.schoolId);
  if (!user || !school) return { ok: false, error: error ?? 'Create a school first' };
  if (error) return { ok: false, error };

  const admin = createAdminClient();
  const { data: member, error: readErr } = await admin
    .from('school_members')
    .select('id, school_id, user_id, role')
    .eq('id', input.memberId)
    .eq('school_id', school.id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!member) return { ok: false, error: 'Member not found' };
  if (member.user_id === user.id) return { ok: false, error: 'You cannot remove yourself' };
  if (member.role === 'admin') return { ok: false, error: 'Admin access cannot be removed here' };

  const { error: deleteErr } = await admin
    .from('school_members')
    .delete()
    .eq('id', member.id);
  if (deleteErr) return { ok: false, error: deleteErr.message };

  revalidatePath('/school');
  return { ok: true, data: undefined };
}

export async function createSchoolMeet(input: {
  schoolId?: string | null;
  name: string;
  meetDate: string;
}): Promise<ActionResult<{ id: string }>> {
  const { supabase, user, school, error } = await requireEditableSchool(input.schoolId);
  if (!user || !school) return { ok: false, error: error ?? 'Create a school first' };
  if (error) return { ok: false, error };

  const name = cleanName(input.name);
  if (!name) return { ok: false, error: 'Meet name is required' };
  if (!input.meetDate) return { ok: false, error: 'Meet date is required' };

  const { data: meet, error: meetErr } = await supabase
    .from('school_meets')
    .insert({
      school_id: school.id,
      name,
      meet_date: input.meetDate,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (meetErr || !meet) return { ok: false, error: meetErr?.message ?? 'Could not create meet' };

  const { data: schoolClassesRaw, error: classErr } = await supabase
    .from('school_classes')
    .select('id, name, sort_order')
    .eq('school_id', school.id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (classErr && !isMissingClassSchemaError(classErr.message)) return { ok: false, error: classErr.message };
  const classSchemaReady = !classErr;
  const schoolClasses = classSchemaReady
    ? schoolClassesRaw ?? []
    : parseClasses('').map((name, index) => ({ id: `legacy:${name}`, name, sort_order: index }));
  if (!schoolClasses || schoolClasses.length === 0) return { ok: false, error: 'Add school classes before creating a meet' };

  const categories: SchoolGender[] = ['boys', 'girls'];
  const rows = schoolClasses.flatMap((schoolClass, classIndex) =>
    categories.flatMap((category, categoryIndex) =>
      SCHOOL_EVENT_TEMPLATES.map((template, templateIndex) => ({
        school_id: school.id,
        meet_id: meet.id,
        event_key: template.key,
        name: template.name,
        event_type: template.eventType,
        result_metric: template.resultMetric,
        gender_category: category,
        ...(classSchemaReady ? { class_id: schoolClass.id } : {}),
        class_group: schoolClass.name,
        sort_order: classIndex * 1000 + categoryIndex * 100 + templateIndex,
      })),
    ),
  );

  const { error: eventErr } = await supabase.from('school_meet_events').insert(rows);
  if (eventErr) return { ok: false, error: eventErr.message };

  revalidatePath('/school');
  revalidatePath(`/school/meets/${meet.id}`);
  return { ok: true, data: { id: meet.id } };
}

export async function addSchoolEventParticipant(input: {
  eventId: string;
  studentId: string;
}): Promise<ActionResult> {
  const { supabase, user } = await getServerAuth();
  if (!user) return { ok: false, error: 'Sign in to continue' };

  const eventResult = await supabase
    .from('school_meet_events')
    .select('id, school_id, meet_id, gender_category, class_id, class_group')
    .eq('id', input.eventId)
    .maybeSingle();
  let event = eventResult.data;
  if (eventResult.error && isMissingClassSchemaError(eventResult.error.message)) {
    const fallback = await supabase
      .from('school_meet_events')
      .select('id, school_id, meet_id, gender_category, class_group')
      .eq('id', input.eventId)
      .maybeSingle();
    event = fallback.data ? { ...fallback.data, class_id: null } : null;
  }
  if (!event) return { ok: false, error: 'Event not found' };
  const role = await getSchoolRoleForUser(supabase, event.school_id, user.id);
  if (!canEditSchool(role)) return { ok: false, error: 'You only have view access for this school' };

  const studentResult = await supabase
    .from('school_students')
    .select('id, school_id, gender, class_id, class_label')
    .eq('id', input.studentId)
    .eq('school_id', event.school_id)
    .maybeSingle();
  let student = studentResult.data;
  if (studentResult.error && isMissingClassSchemaError(studentResult.error.message)) {
    const fallback = await supabase
      .from('school_students')
      .select('id, school_id, gender, class_label')
      .eq('id', input.studentId)
      .eq('school_id', event.school_id)
      .maybeSingle();
    student = fallback.data ? { ...fallback.data, class_id: null } : null;
  }
  if (!student) return { ok: false, error: 'Student not found for this school' };
  if (student.gender !== event.gender_category) {
    return { ok: false, error: `Select a ${event.gender_category === 'boys' ? 'Boys' : 'Girls'} student for this event` };
  }
  if (event.class_id && student.class_id !== event.class_id) {
    return { ok: false, error: 'Select a student from this event class' };
  }
  if (!event.class_id && event.class_group && student.class_label !== event.class_group) {
    return { ok: false, error: 'Select a student from this event class' };
  }

  const { error } = await supabase
    .from('school_event_results')
    .upsert({
      school_id: event.school_id,
      meet_id: event.meet_id,
      event_id: event.id,
      student_id: student.id,
      updated_by: user.id,
    }, { onConflict: 'event_id,student_id' });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/school/meets/${event.meet_id}`);
  revalidatePath(`/school/meets/${event.meet_id}/events/${event.id}`);
  return { ok: true, data: undefined };
}

export async function saveSchoolEventResults(input: {
  eventId: string;
  rows: Array<{ studentId: string; resultValue: string; manualRank?: number | null; notes?: string }>;
}): Promise<ActionResult> {
  const { supabase, user } = await getServerAuth();
  if (!user) return { ok: false, error: 'Sign in to continue' };

  const eventResult = await supabase
    .from('school_meet_events')
    .select('id, school_id, meet_id, result_metric, gender_category, class_id, class_group')
    .eq('id', input.eventId)
    .maybeSingle();
  let event = eventResult.data;
  if (eventResult.error && isMissingClassSchemaError(eventResult.error.message)) {
    const fallback = await supabase
      .from('school_meet_events')
      .select('id, school_id, meet_id, result_metric, gender_category, class_group')
      .eq('id', input.eventId)
      .maybeSingle();
    event = fallback.data ? { ...fallback.data, class_id: null } : null;
  }
  if (!event) return { ok: false, error: 'Event not found' };
  const role = await getSchoolRoleForUser(supabase, event.school_id, user.id);
  if (!canEditSchool(role)) return { ok: false, error: 'You only have view access for this school' };

  const cleaned = input.rows.map(row => {
    const trimmed = row.resultValue.trim();
    const parsed = trimmed ? Number(trimmed) : null;
    const normalized = parsed == null || Number.isNaN(parsed)
      ? null
      : event.result_metric === 'time_seconds'
        ? parsed
        : parsed * 100;
    return {
      studentId: row.studentId,
      resultValue: normalized,
      manualRank: normalized == null && row.manualRank && row.manualRank >= 1 && row.manualRank <= 3
        ? row.manualRank
        : null,
      notes: cleanName(row.notes),
    };
  });
  const seenManualRanks = new Set<number>();
  const deduped = cleaned.map(row => {
    if (!row.manualRank) return row;
    if (seenManualRanks.has(row.manualRank)) return { ...row, manualRank: null };
    seenManualRanks.add(row.manualRank);
    return row;
  });
  const missingResult = deduped.find(row => row.resultValue == null && row.manualRank == null);
  if (missingResult) {
    return { ok: false, error: 'Every participant needs a time/measurement or a selected rank' };
  }

  const studentIds = [...new Set(deduped.map(row => row.studentId))];
  if (studentIds.length > 0) {
    let studentQuery = supabase
      .from('school_students')
      .select('id')
      .eq('school_id', event.school_id)
      .eq('gender', event.gender_category)
      .in('id', studentIds);
    studentQuery = event.class_id
      ? studentQuery.eq('class_id', event.class_id)
      : event.class_group
        ? studentQuery.eq('class_label', event.class_group)
        : studentQuery;
    const { data: validStudents, error: studentErr } = await studentQuery;
    if (studentErr) return { ok: false, error: studentErr.message };
    if ((validStudents ?? []).length !== studentIds.length) {
      return { ok: false, error: 'One or more students do not belong to this school' };
    }
  }

  const ranked = computeRanks(deduped, event.result_metric === 'time_seconds' ? 'asc' : 'desc');
  const payload = ranked.map(row => ({
    school_id: event.school_id,
    meet_id: event.meet_id,
    event_id: event.id,
    student_id: row.studentId,
    result_value: row.resultValue,
    rank: row.rank,
    medal: medalForRank(row.rank),
    points: pointsForRank(row.rank),
    notes: row.notes || null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('school_event_results')
    .upsert(payload, { onConflict: 'event_id,student_id' });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/school/meets/${event.meet_id}`);
  revalidatePath(`/school/meets/${event.meet_id}/events/${event.id}`);
  return { ok: true, data: undefined };
}

function computeRanks<T extends { resultValue: number | null; manualRank?: number | null }>(
  rows: T[],
  direction: 'asc' | 'desc',
): Array<T & { rank: number | null }> {
  const withValues = rows
    .filter(row => row.resultValue != null)
    .sort((a, b) => direction === 'asc'
      ? Number(a.resultValue) - Number(b.resultValue)
      : Number(b.resultValue) - Number(a.resultValue));
  const rankByValue = new Map<number, number>();
  for (const row of withValues) {
    const value = Number(row.resultValue);
    if (!rankByValue.has(value)) {
      rankByValue.set(value, rankByValue.size + 1);
    }
  }
  return rows.map(row => ({
    ...row,
    rank: row.resultValue == null
      ? row.manualRank ?? null
      : rankByValue.get(Number(row.resultValue)) ?? null,
  }));
}

function isMissingClassSchemaError(message: string) {
  return message.includes('school_classes') ||
    message.includes('class_id') ||
    (message.includes('Could not find') && message.includes('class'));
}
