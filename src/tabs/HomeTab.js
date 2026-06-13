import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStreamVideoClient } from '@stream-io/video-react-native-sdk';
import { useIdentity } from '../contexts/IdentityContext';
import { COLORS, FONTS, getAccentColor } from '../theme';
import { fetchCalendarEvents } from '../services/calendarService';
import { fetchTasks, isTaskForDate, isCompleteForDate, todayStr } from '../services/tasksService';
import { fetchMealsForDates } from '../services/mealsService';
import { fetchRewards } from '../services/rewardsService';

// ─── layout constants ─────────────────────────────────────────────────────────

const HOUR_HEIGHT = 56;
const TIMELINE_W  = 38;
const GRID_START  = 6;   // 6am
const GRID_END    = 20;  // 8pm
const GRID_HOURS  = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);
const GRID_HEIGHT = GRID_HOURS.length * HOUR_HEIGHT; // 784

const PERSONS = [
  { key: 'maddie', label: 'Maddie', color: COLORS.maddie, light: COLORS.maddieLight,
    avatarUri: 'https://yap-family-home.vercel.app/avatars/Maddie.jpg' },
  { key: 'alex',   label: 'Alex',   color: COLORS.alex,   light: COLORS.alexLight,
    avatarUri: 'https://yap-family-home.vercel.app/avatars/Alex.jpg'   },
  { key: 'marj',   label: 'Marj',   color: COLORS.marj,   light: COLORS.marjLight,
    avatarUri: null },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function offsetDate(ds, days) {
  const d = new Date(ds + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return makeDateStr(d);
}

function formatDateNav(ds) {
  const d = new Date(ds + 'T12:00:00');
  return d.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
}

function formatHour(h) {
  if (h === 0 || h === 24) return '12am';
  if (h === 12) return '12pm';
  return h > 12 ? `${h - 12}pm` : `${h}am`;
}

function formatEventTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    let h = d.getHours(), m = d.getMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, '0')}${ampm}`;
  } catch { return ''; }
}

function getTimeIndicatorTop() {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < GRID_START || h > GRID_END) return -1;
  return (h - GRID_START) * HOUR_HEIGHT;
}

function eventTop(isoStart) {
  if (!isoStart) return null;
  const d = new Date(isoStart);
  const h = d.getHours() + d.getMinutes() / 60;
  const top = (h - GRID_START) * HOUR_HEIGHT;
  if (top > GRID_HEIGHT || top < 0) return null;
  return top;
}

function eventHeight(isoStart, isoEnd) {
  if (!isoStart || !isoEnd) return HOUR_HEIGHT;
  const diff = (new Date(isoEnd) - new Date(isoStart)) / 3600000;
  return Math.max(20, diff * HOUR_HEIGHT);
}

// ─── PersonAvatar ─────────────────────────────────────────────────────────────

function PersonAvatar({ person }) {
  const [err, setErr] = useState(false);
  if (!person.avatarUri || err) {
    return (
      <View style={[styles.avatarInitial, { backgroundColor: person.color }]}>
        <Text style={styles.avatarInitialText}>{person.label[0]}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: person.avatarUri }}
      style={styles.avatar}
      onError={() => setErr(true)}
    />
  );
}

// ─── EventBlock ───────────────────────────────────────────────────────────────

function EventBlock({ event, color, light }) {
  if (event.allDay) return null;
  const top = eventTop(event.startTime);
  if (top === null) return null;
  const height = Math.min(eventHeight(event.startTime, event.endTime), GRID_HEIGHT - top);
  return (
    <View style={[styles.eventBlock, { top, height, backgroundColor: light, borderLeftColor: color }]}>
      <Text style={[styles.eventTimeText, { color }]} numberOfLines={1}>
        {formatEventTime(event.startTime)}
      </Text>
      {height > 28 && (
        <Text style={[styles.eventTitleText, { color }]} numberOfLines={2}>
          {event.title}
        </Text>
      )}
    </View>
  );
}

// ─── CallHomeSection ──────────────────────────────────────────────────────────

function CallHomeSection({ identity }) {
  const client = useStreamVideoClient();
  const [state, setState] = useState('idle');
  const callRef = useRef(null);

  async function startCall() {
    if (!client) return;
    setState('calling');
    try {
      const callId = `${identity}-family-hub-${Date.now()}`;
      const call = client.call('default', callId);
      await call.getOrCreate({
        ring: true,
        data: { members: [{ user_id: identity }, { user_id: 'family-hub' }] },
      });
      await call.join();
      callRef.current = call;
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }

  async function cancelCall() {
    try {
      if (callRef.current) { await callRef.current.leave({ reject: true }); callRef.current = null; }
    } catch {}
    setState('idle');
  }

  return (
    <View style={styles.videoCallSection}>
      <Text style={styles.sectionLabel}>VIDEO CALL ›</Text>
      {state === 'calling' ? (
        <View style={styles.callRow}>
          <View style={[styles.callBtn, { backgroundColor: COLORS.family, flex: 1 }]}>
            <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.callBtnText}>Calling Home…</Text>
          </View>
          <TouchableOpacity style={[styles.callBtn, styles.callCancelBtn]} onPress={cancelCall}>
            <Text style={styles.callBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.callBtn, { backgroundColor: COLORS.family }]}
          onPress={startCall}
          activeOpacity={0.8}
        >
          <Text style={styles.callBtnIcon}>📹</Text>
          <Text style={styles.callBtnText}>Call Home</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── HomeTab ──────────────────────────────────────────────────────────────────

export default function HomeTab() {
  const { identity } = useIdentity();
  const insets = useSafeAreaInsets();
  const accent = getAccentColor(identity);

  const [viewDate, setViewDate]   = useState(() => todayStr());
  const [events,   setEvents]     = useState({ maddie: [], alex: [], marj: [] });
  const [tasks,    setTasks]      = useState([]);
  const [meals,    setMeals]      = useState([]);
  const [rewards,  setRewards]    = useState({ maddie: null, alex: null });
  const [loading,  setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick]           = useState(0);

  const isToday  = viewDate === todayStr();
  const tomorrow = offsetDate(viewDate, 1);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const [evData, taskData, mealData, rewardData] = await Promise.allSettled([
        fetchCalendarEvents(viewDate),
        fetchTasks(),
        fetchMealsForDates([viewDate, tomorrow]),
        fetchRewards(),
      ]);
      if (evData.status     === 'fulfilled') setEvents(evData.value);
      if (taskData.status   === 'fulfilled') setTasks(taskData.value);
      if (mealData.status   === 'fulfilled') setMeals(mealData.value);
      if (rewardData.status === 'fulfilled') setRewards(rewardData.value);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [viewDate]);

  useEffect(() => { load(); }, [load]);

  function onRefresh() { setRefreshing(true); load(); }

  function tasksFor(personKey) {
    return tasks
      .filter(t => t.assigned_to === personKey && isTaskForDate(t, viewDate))
      .map(t => ({ ...t, done: isCompleteForDate(t, viewDate) }));
  }

  function mealFor(ds, person, mealType) {
    return meals.find(m => m.date === ds && m.person === person && m.meal_type === mealType)?.dish_name || '—';
  }

  function dinnerFor(ds) {
    const family = mealFor(ds, 'family', 'dinner');
    if (family !== '—') return family;
    const marj = mealFor(ds, 'marj', 'dinner');
    if (marj !== '—') return marj;
    return mealFor(ds, 'maddie', 'dinner');
  }

  const tiTop = isToday ? getTimeIndicatorTop() : -1;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>

      {/* ── Date nav ── */}
      <View style={styles.dateNav}>
        <TouchableOpacity style={styles.navBtn} onPress={() => setViewDate(d => offsetDate(d, -1))}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.navCenter}>
          <Text style={[styles.navLabel, { color: accent }]}>{formatDateNav(viewDate)}</Text>
          {loading && !refreshing && (
            <ActivityIndicator size="small" color={accent} style={{ marginLeft: 6 }} />
          )}
        </View>
        <TouchableOpacity style={styles.navBtn} onPress={() => setViewDate(d => offsetDate(d, 1))}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── Column headers (sticky-ish, above scroll) ── */}
      <View style={styles.colHeaderRow}>
        <View style={{ width: TIMELINE_W }} />
        {PERSONS.map(p => (
          <View key={p.key} style={[styles.colHeader, { backgroundColor: p.light }]}>
            <PersonAvatar person={p} />
            <Text style={[styles.colName, { color: p.color }]}>{p.label.toUpperCase()}</Text>
          </View>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
      >
        {/* ── Calendar grid ── */}
        <View style={{ position: 'relative' }}>
          <View style={{ flexDirection: 'row', height: GRID_HEIGHT }}>

            {/* Hour labels */}
            <View style={{ width: TIMELINE_W }}>
              {GRID_HOURS.map(h => (
                <View key={h} style={{ height: HOUR_HEIGHT, paddingTop: 3, alignItems: 'flex-end', paddingRight: 5 }}>
                  <Text style={styles.hourLabel}>{formatHour(h)}</Text>
                </View>
              ))}
            </View>

            {/* Data columns */}
            {PERSONS.map(p => (
              <View key={p.key} style={styles.gridCol}>
                {/* Full-hour lines */}
                {GRID_HOURS.map((_, i) => (
                  <View key={i} style={[styles.hourLine, { top: i * HOUR_HEIGHT }]} />
                ))}
                {/* Half-hour lines */}
                {GRID_HOURS.map((_, i) => (
                  <View key={`h${i}`} style={[styles.halfHourLine, { top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }]} />
                ))}
                {/* Events */}
                {(events[p.key] || []).map((ev, idx) => (
                  <EventBlock key={ev.id || idx} event={ev} color={p.color} light={p.light} />
                ))}
              </View>
            ))}
          </View>

          {/* Amber time indicator */}
          {tiTop >= 0 && (
            <View pointerEvents="none" style={[styles.timeIndicator, { top: tiTop }]} />
          )}
        </View>

        {/* ── Tasks section ── */}
        <View style={styles.sectionBorder}>
          {/* Per-column "TASKS ›" headers */}
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: TIMELINE_W }} />
            {PERSONS.map(p => (
              <View key={p.key} style={[styles.taskColHead, { backgroundColor: p.light }]}>
                <Text style={[styles.sectionLabel, { color: p.color }]}>TASKS ›</Text>
              </View>
            ))}
          </View>
          {/* Task items */}
          <View style={{ flexDirection: 'row', minHeight: 52 }}>
            <View style={{ width: TIMELINE_W }} />
            {PERSONS.map(p => {
              const colTasks = tasksFor(p.key);
              return (
                <View key={p.key} style={styles.taskColBody}>
                  {colTasks.length === 0 ? (
                    <Text style={styles.emptyHint}>—</Text>
                  ) : colTasks.map(t => (
                    <View key={t.id} style={styles.taskRow}>
                      <View style={[styles.taskDot, { backgroundColor: t.done ? p.color : COLORS.border }]} />
                      <Text style={[styles.taskTitle, t.done && styles.taskDone]} numberOfLines={2}>
                        {t.title}{t.recurring ? ' ↻' : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Meal Plan section ── */}
        <View style={styles.sectionBorder}>
          <View style={styles.mealPlanHeader}>
            <Text style={styles.sectionLabel}>MEAL PLAN ›</Text>
          </View>
          {/* Table header row */}
          <View style={styles.mealHeaderRow}>
            <View style={styles.mealDateCol} />
            <View style={styles.mealLunchBlock}>
              <Text style={styles.mealGroupLabel}>LUNCH</Text>
              <View style={{ flexDirection: 'row' }}>
                <Text style={[styles.mealPersonLabel, { color: COLORS.maddie }]}>MADDIE</Text>
                <Text style={[styles.mealPersonLabel, { color: COLORS.alex }]}>ALEX</Text>
              </View>
            </View>
            <View style={styles.mealDinnerBlock}>
              <Text style={styles.mealGroupLabel}>DINNER</Text>
            </View>
          </View>
          {/* Data rows */}
          {[
            { ds: viewDate, label: isToday ? 'Today' : new Date(viewDate + 'T12:00:00').toLocaleDateString('en-SG', { weekday: 'short' }) },
            { ds: tomorrow, label: new Date(tomorrow + 'T12:00:00').toLocaleDateString('en-SG', { weekday: 'short' }) },
          ].map(({ ds, label }) => (
            <View key={ds} style={styles.mealDataRow}>
              <Text style={styles.mealDateLabel}>{label}</Text>
              <Text style={styles.mealCell} numberOfLines={2}>{mealFor(ds, 'maddie', 'lunch')}</Text>
              <Text style={styles.mealCell} numberOfLines={2}>{mealFor(ds, 'alex', 'lunch')}</Text>
              <Text style={[styles.mealCell, styles.mealDinnerCell]} numberOfLines={2}>{dinnerFor(ds)}</Text>
            </View>
          ))}
        </View>

        {/* ── Rewards section ── */}
        <View style={styles.sectionBorder}>
          <View style={styles.rewardsHeader}>
            <Text style={styles.sectionLabel}>REWARDS ›</Text>
          </View>
          {['maddie', 'alex'].map(person => {
            const r = rewards[person];
            const color = person === 'maddie' ? COLORS.maddie : COLORS.alex;
            const pts = r?.points_balance ?? 0;
            return (
              <View key={person} style={styles.rewardRow}>
                <Text style={[styles.rewardName, { color }]}>
                  {person === 'maddie' ? 'Maddie' : 'Alex'}
                </Text>
                <View style={styles.rewardBarTrack}>
                  <View style={[styles.rewardBarFill, { backgroundColor: color, width: `${Math.min(100, pts)}%` }]} />
                </View>
                <Text style={[styles.rewardPts, { color }]}>{pts}/100</Text>
              </View>
            );
          })}
        </View>

        {/* ── Video Call section ── */}
        <CallHomeSection identity={identity} />

      </ScrollView>
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },

  // Date nav
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  navBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 24, color: COLORS.textSecondary, lineHeight: 28 },
  navCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  navLabel: {
    fontFamily: FONTS.headingBold,
    fontSize: 12,
    letterSpacing: 1,
  },

  // Column headers
  colHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  colHeader: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarInitial: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitialText: {
    fontFamily: FONTS.headingBold,
    fontSize: 18,
    color: '#fff',
  },
  colName: {
    fontFamily: FONTS.headingBold,
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 5,
  },

  scroll: { flex: 1 },

  // Calendar grid
  gridCol: {
    flex: 1,
    height: GRID_HEIGHT,
    position: 'relative',
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  hourLine: {
    position: 'absolute', left: 0, right: 0,
    height: 1, backgroundColor: COLORS.border,
  },
  halfHourLine: {
    position: 'absolute', left: 0, right: 0,
    height: 1, backgroundColor: COLORS.border, opacity: 0.35,
  },
  hourLabel: {
    fontFamily: FONTS.body,
    fontSize: 9,
    color: COLORS.textSecondary,
    lineHeight: 11,
  },
  eventBlock: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderLeftWidth: 3,
    paddingLeft: 4,
    paddingTop: 2,
    borderRadius: 3,
    overflow: 'hidden',
  },
  eventTimeText: { fontFamily: FONTS.body, fontSize: 9, lineHeight: 12 },
  eventTitleText: { fontFamily: FONTS.bodyMedium, fontSize: 10, lineHeight: 13 },
  timeIndicator: {
    position: 'absolute', left: 0, right: 0,
    height: 2, backgroundColor: COLORS.timeIndicator, zIndex: 10,
  },

  // Section chrome
  sectionBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  sectionLabel: {
    fontFamily: FONTS.heading,
    fontSize: 11,
    letterSpacing: 0.8,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },

  // Tasks
  taskColHead: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    paddingHorizontal: 5,
    paddingVertical: 6,
  },
  taskColBody: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 8,
  },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3, gap: 3 },
  taskDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4, flexShrink: 0 },
  taskTitle: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.text, flex: 1, lineHeight: 14 },
  taskDone: { color: COLORS.textSecondary, textDecorationLine: 'line-through' },
  emptyHint: {
    fontFamily: FONTS.body, fontSize: 10, color: COLORS.textSecondary,
    textAlign: 'center', marginTop: 6,
  },

  // Meal Plan
  mealPlanHeader: { paddingHorizontal: 10, paddingVertical: 8 },
  mealHeaderRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  mealDateCol: { width: 48 },
  mealLunchBlock: {
    flex: 2,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  mealDinnerBlock: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    paddingVertical: 4,
    paddingHorizontal: 4,
    justifyContent: 'flex-end',
  },
  mealGroupLabel: {
    fontFamily: FONTS.heading,
    fontSize: 9,
    letterSpacing: 0.5,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  mealPersonLabel: {
    fontFamily: FONTS.heading,
    fontSize: 8,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    flex: 1,
  },
  mealDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  mealDateLabel: {
    width: 48,
    fontFamily: FONTS.bodyMedium,
    fontSize: 10,
    color: COLORS.text,
    paddingLeft: 6,
  },
  mealCell: {
    flex: 1,
    fontFamily: FONTS.body,
    fontSize: 10,
    color: COLORS.text,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  mealDinnerCell: { flex: 1 },

  // Rewards
  rewardsHeader: { paddingHorizontal: 10, paddingVertical: 8 },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 8,
  },
  rewardName: { fontFamily: FONTS.bodyMedium, fontSize: 12, width: 46 },
  rewardBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  rewardBarFill: { height: '100%', borderRadius: 4 },
  rewardPts: { fontFamily: FONTS.body, fontSize: 11, width: 52, textAlign: 'right' },

  // Video Call section
  videoCallSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  callRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 52,
    gap: 8,
    marginTop: 10,
  },
  callCancelBtn: { backgroundColor: '#dc2626', paddingHorizontal: 16, flex: 0, marginTop: 0 },
  callBtnIcon: { fontSize: 20 },
  callBtnText: { fontFamily: FONTS.headingBold, fontSize: 16, color: '#fff', letterSpacing: 0.3 },
});
