'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { addSchoolEventParticipant, saveSchoolEventResults } from '@/app/actions/schoolSports';
import { DarkListbox, type ChoiceOption } from '@/components/SchoolFormControls';
import {
  formatSchoolResult,
  schoolGenderLabel,
  schoolMetricUnit,
  studentCanJoinEvent,
  type SchoolGender,
  type SchoolResultMetric,
} from '@/lib/schoolSports';
import type { SchoolEventResult, SchoolStudent } from '@/lib/schoolSportsServer';

type EditableRow = {
  studentId: string;
  name: string;
  houseName: string | null;
  resultValue: string;
  notes: string;
  manualRank: number | null;
  rank: number | null;
  medal: string | null;
  points: number;
};

export default function SchoolEventResultsClient({
  eventId,
  eventCategory,
  metric,
  students,
  results,
  studentsError,
  canEdit,
}: {
  eventId: string;
  eventCategory: SchoolGender;
  metric: SchoolResultMetric;
  students: SchoolStudent[];
  results: SchoolEventResult[];
  studentsError?: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [studentId, setStudentId] = useState('');
  const [rows, setRows] = useState<EditableRow[]>(() => results.map(resultToEditable(metric)));
  const [busy, setBusy] = useState<'add' | 'save' | null>(null);
  const [error, setError] = useState('');

  const usedIds = useMemo(() => new Set(rows.map(row => row.studentId)), [rows]);
  const available = students.filter(student =>
    !usedIds.has(student.id) && studentCanJoinEvent(student.gender, eventCategory),
  );
  const participantOptions: ChoiceOption<string>[] = available.map(student => ({
    value: student.id,
    label: student.name,
    description: `${student.schoolClass?.name || student.class_label || 'No class'} · ${schoolGenderLabel(student.gender)}`,
    badge: student.house?.name ?? undefined,
  }));

  async function addParticipant() {
    if (!canEdit) return;
    if (!studentId) return;
    setError('');
    setBusy('add');
    const result = await addSchoolEventParticipant({ eventId, studentId });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const student = students.find(s => s.id === studentId);
    if (student) {
      setRows(current => [
        ...current,
        {
          studentId: student.id,
          name: student.name,
          houseName: student.house?.name ?? null,
          resultValue: '',
          notes: '',
          manualRank: null,
          rank: null,
          medal: null,
          points: 0,
        },
      ]);
    }
    setStudentId('');
    router.refresh();
  }

  async function save() {
    if (!canEdit) return;
    setError('');
    const missing = rows.find(row => !row.resultValue.trim() && !row.manualRank);
    if (missing) {
      setError(`Enter ${metric === 'time_seconds' ? 'seconds' : 'measurement'} or select a rank for ${missing.name}`);
      return;
    }
    setBusy('save');
    const result = await saveSchoolEventResults({
      eventId,
      rows: rows.map(row => ({
        studentId: row.studentId,
        resultValue: row.resultValue,
        manualRank: row.manualRank,
        notes: row.notes,
      })),
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  function updateRow(studentId: string, patch: Partial<EditableRow>) {
    setRows(current => current.map(row => row.studentId === studentId ? { ...row, ...patch } : row));
  }

  function pickManualRank(studentId: string, rank: number) {
    setRows(current => current.map(row => {
      if (row.studentId === studentId) {
        return { ...row, manualRank: row.manualRank === rank ? null : rank };
      }
      if (row.manualRank === rank) {
        return { ...row, manualRank: null };
      }
      return row;
    }));
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded-xl border border-red-900/70 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p>}

      {canEdit ? (
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <h2 className="mb-2 text-sm font-semibold text-white">Add participant</h2>
          {studentsError && (
            <p className="mb-2 rounded-xl border border-red-900/70 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              Could not load students: {studentsError}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <DarkListbox
              value={studentId}
              options={participantOptions}
              onChange={setStudentId}
              placeholder={`Select ${schoolGenderLabel(eventCategory)} student`}
              searchable
              searchPlaceholder={`Search ${schoolGenderLabel(eventCategory)} students...`}
              emptyText={`No ${schoolGenderLabel(eventCategory)} students in this school`}
            />
            <button
              type="button"
              onClick={addParticipant}
              disabled={!studentId || busy === 'add'}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy === 'add' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add
            </button>
          </div>
        </section>
      ) : (
        <p className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-400">
          View only. You can read participants and results, but only Edit users can add students or save scores.
        </p>
      )}

      <section className="rounded-xl border border-gray-800 bg-gray-900">
        <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-3 py-2">
          <div>
            <h2 className="text-sm font-semibold text-white">Results</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Enter {metric === 'time_seconds' ? 'seconds' : 'metres'} or select 1st/2nd/3rd for each participant.
            </p>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={!canEdit || busy === 'save' || rows.length === 0}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy === 'save' && <Loader2 size={13} className="animate-spin" />}
            Save
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No participants yet.</p>
        ) : (
          <div className="divide-y divide-gray-800">
            <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_8rem_3.5rem] gap-1.5 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-gray-600 sm:grid-cols-[minmax(8rem,1fr)_7rem_10rem_5rem] sm:gap-2">
              <span>Student</span>
              <span>{schoolMetricUnit(metric)}</span>
              <span>Rank if blank</span>
              <span className="text-right">Status</span>
            </div>
            {rows.map(row => (
              <div key={row.studentId} className="grid grid-cols-[minmax(0,1fr)_4.5rem_8rem_3.5rem] items-center gap-1.5 px-3 py-1.5 sm:grid-cols-[minmax(8rem,1fr)_7rem_10rem_5rem] sm:gap-2">
                <div className="min-w-0 pr-1">
                  <p className="truncate text-xs font-semibold text-white sm:text-sm">{row.name}</p>
                  <p className="truncate text-[10px] text-gray-500 sm:text-xs">{row.houseName ?? 'No house'}</p>
                </div>
                <label className="min-w-0">
                  <span className="sr-only">{schoolMetricUnit(metric)}</span>
                  <input
                    inputMode="decimal"
                    value={row.resultValue}
                    onChange={e => updateRow(row.studentId, {
                      resultValue: e.target.value.replace(/[^\d.]/g, ''),
                      manualRank: null,
                    })}
                    readOnly={!canEdit}
                    placeholder={metric === 'time_seconds' ? 'Sec' : 'Metres'}
                    className={`h-8 w-full rounded-md border bg-gray-950 px-2 text-xs text-white placeholder-gray-600 focus:border-emerald-700 focus:outline-none sm:h-9 sm:rounded-lg sm:text-sm ${
                      !row.resultValue.trim() && !row.manualRank ? 'border-amber-800/80' : 'border-gray-800'
                    }`}
                  />
                </label>
                <div>
                  <span className="sr-only">Rank if no {metric === 'time_seconds' ? 'time' : 'measure'}</span>
                  <div className="grid h-8 grid-cols-4 gap-0.5 rounded-md border border-gray-800 bg-gray-950 p-0.5 sm:h-9 sm:gap-1 sm:rounded-lg sm:p-1">
                    {[1, 2, 3].map(rank => (
                      <button
                        key={rank}
                        type="button"
                        onClick={() => pickManualRank(row.studentId, rank)}
                        disabled={!canEdit || Boolean(row.resultValue.trim())}
                        className={`rounded px-0.5 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:rounded-md sm:text-xs ${
                          row.manualRank === rank
                            ? 'bg-emerald-600 text-white'
                            : 'text-gray-400 hover:bg-gray-900 hover:text-white'
                        }`}
                      >
                        {rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd'}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => updateRow(row.studentId, { manualRank: null })}
                      disabled={!canEdit || Boolean(row.resultValue.trim())}
                      className="rounded px-0.5 text-[10px] font-semibold text-gray-500 transition-colors hover:bg-gray-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:rounded-md sm:text-xs"
                    >
                      -
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500 sm:text-xs">
                    {row.resultValue.trim()
                      ? row.rank ? `R${row.rank}` : 'Auto'
                      : row.manualRank ? `R${row.manualRank}` : 'Req'}
                  </p>
                  <p className="truncate text-[10px] text-gray-600 sm:text-xs">{formatSchoolResult(toStoredValue(row.resultValue, metric), metric)}</p>
                  {row.medal && <p className="text-[10px] font-semibold capitalize text-amber-300 sm:text-xs">{row.medal}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function resultToEditable(metric: SchoolResultMetric) {
  return (result: SchoolEventResult): EditableRow => ({
    studentId: result.student_id,
    name: result.student?.name ?? 'Unknown student',
    houseName: result.student?.house?.name ?? null,
    resultValue: result.result_value == null ? '' : toInputValue(result.result_value, metric),
    notes: result.notes ?? '',
    manualRank: result.result_value == null ? result.rank : null,
    rank: result.rank,
    medal: result.medal,
    points: result.points,
  });
}

function toInputValue(value: number, metric: SchoolResultMetric) {
  if (metric === 'time_seconds') return Number(value).toString();
  return (Number(value) / 100).toString();
}

function toStoredValue(raw: string, metric: SchoolResultMetric) {
  const parsed = raw ? Number(raw) : null;
  if (parsed == null || Number.isNaN(parsed)) return null;
  return metric === 'time_seconds' ? parsed : parsed * 100;
}
