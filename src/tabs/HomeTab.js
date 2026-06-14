import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl, Image, Platform, StatusBar,
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

const HOUR_HEIGHT = 26;
const TIMELINE_W  = 38;
const GRID_START  = 6;   // 6am
const GRID_END    = 20;  // 8pm
const GRID_HOURS  = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);
const GRID_HEIGHT = GRID_HOURS.length * HOUR_HEIGHT; // 364

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
  return d.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' });
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
  return Math.max(16, diff * HOUR_HEIGHT);
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
      {height > 20 && (
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
            <ActivityIndicator color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.callBtnText}>Calling…</Text>
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

  const row1Label = isToday
    ? 'Today'
    : new Date(viewDate + 'T12:00:00').toLocaleDateString('en-SG', { weekday: 'short' });
  const row2Label = new Date(tomorrow + 'T12:00:00').toLocaleDateString('en-SG', { weekday: 'short' });

  return (
    <View style={styles.screen}>

      {/* ── Date nav ── */}
      <View style={styles.dateNav}>
        <TouchableOpacity style={styles.navBtn} onPress={() => setViewDate(d => offsetDate(d, -1))}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.navCenter}>
          <Text style={styles.navLabel}>{formatDateNav(viewDate)}</Text>
          {loading && !refreshing && (
            <ActivityIndicator size="small" color={accent} style={{ marginLeft: 6 }} />
          )}
        </View>
        <TouchableOpacity style={styles.navBtn} onPress={() => setViewDate(d => offsetDate(d, 1))}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── Column headers ── */}
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
        contentContainerStyle={{ paddingBottom: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
      >
        {/* ── Calendar grid ── */}
        <View style={{ position: 'relative' }}>
          <View style={{ flexDirection: 'row', height: GRID_HEIGHT }}>

            {/* Hour labels — absolute positioned so each label centres on its line */}
            <View style={{ width: TIMELINE_W, height: GRID_HEIGHT, position: 'relative' }}>
              {GRID_HOURS.map((h, i) => (
                <Text
                  key={h}
                  style={[styles.hourLabel, { position: 'absolute', top: i === 0 ? 1 : i * HOUR_HEIGHT - 5, right: 5 }]}
                >
                  {formatHour(h)}
                </Text>
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
            <View pointerEvents="none" style={[styles.timeIndicator, { top: tiTop }]}>
              <View style={styles.timeIndicatorDot} />
            </View>
          )}
        </View>

        {/* ── Tasks section ── */}
        <View style={styles.sectionBorder}>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: TIMELINE_W, alignItems: 'flex-end', paddingRight: 5, justifyContent: 'center' }}>
              <Text style={styles.hourLabel}>8pm</Text>
            </View>
            {PERSONS.map(p => (
              <View key={p.key} style={[styles.taskColHead, { backgroundColor: p.light }]}>
                <Text style={[styles.sectionLabel, { color: p.color }]}>TASKS ›</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', minHeight: 36 }}>
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
          {/* Section label above the table (like REWARDS ›) */}
          <View style={styles.mealPlanLabelRow}>
            <Text style={styles.sectionLabel}>MEAL PLAN ›</Text>
          </View>
          {/* Column headers — LUNCH spans both Maddie + Alex, no divider between them */}
          <View style={[styles.mealHeaderRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
            <View style={{ width: TIMELINE_W }} />
            <View style={[styles.mealColHead, { flex: 2, alignItems: 'center' }]}>
              <Text style={[styles.mealGroupLabel, { textAlign: 'center', width: '100%' }]}>LUNCH</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '100%' }}>
                <Text style={[styles.mealPersonName, { color: COLORS.maddie }]}>MADDIE</Text>
                <Text style={[styles.mealPersonName, { color: COLORS.alex }]}>ALEX</Text>
              </View>
            </View>
            <View style={[styles.mealColHead, styles.mealColBorder, { alignItems: 'center' }]}>
              <Text style={[styles.mealGroupLabel, { textAlign: 'center', width: '100%' }]}>DINNER</Text>
            </View>
          </View>
          {/* Data rows */}
          {[
            { ds: viewDate, label: row1Label },
            { ds: tomorrow, label: row2Label },
          ].map(({ ds, label }) => (
            <View key={ds} style={styles.mealDataRow}>
              <Text style={styles.mealDateLabel}>{label}</Text>
              <Text style={[styles.mealCell, { textAlign: 'center' }]} numberOfLines={1}>{mealFor(ds, 'maddie', 'lunch')}</Text>
              <Text style={[styles.mealCell, { textAlign: 'center' }]} numberOfLines={1}>{mealFor(ds, 'alex', 'lunch')}</Text>
              <Text style={[styles.mealCell, styles.mealColBorder, { textAlign: 'center' }]} numberOfLines={1}>{dinnerFor(ds)}</Text>
            </View>
          ))}
        </View>

        {/* ── Rewards + Video Call side by side ── */}
        <View style={[styles.sectionBorder, styles.rewardsCallRow]}>
          {/* Rewards */}
          <View style={styles.rewardsPane}>
            <Text style={styles.sectionLabel}>REWARDS ›</Text>
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

          {/* Video Call */}
          <View style={styles.callPane}>
            <CallHomeSection identity={identity} />
          </View>
        </View>

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
    height: 34,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  navBtn: { width: 44, height: 34, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 22, color: COLORS.textSecondary, lineHeight: 26 },
  navCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  navLabel: {
    fontFamily: FONTS.heading,
    fontSize: 12,
    letterSpacing: 0.5,
    color: COLORS.text,
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
    paddingVertical: 2,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  avatarInitial: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitialText: {
    fontFamily: FONTS.headingBold,
    fontSize: 15,
    color: '#fff',
  },
  colName: {
    fontFamily: FONTS.headingBold,
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 3,
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
    height: 1, backgroundColor: COLORS.border, opacity: 0.3,
  },
  hourLabel: {
    fontFamily: FONTS.body,
    fontSize: 8,
    color: COLORS.textSecondary,
    lineHeight: 10,
    textAlign: 'right',
  },
  eventBlock: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderLeftWidth: 2,
    paddingLeft: 3,
    paddingTop: 1,
    borderRadius: 2,
    overflow: 'hidden',
  },
  eventTimeText: { fontFamily: FONTS.body, fontSize: 8, lineHeight: 10 },
  eventTitleText: { fontFamily: FONTS.bodyMedium, fontSize: 9, lineHeight: 11 },
  timeIndicator: {
    position: 'absolute', left: TIMELINE_W, right: 0,
    height: 2, backgroundColor: COLORS.timeIndicator, zIndex: 10,
    flexDirection: 'row', alignItems: 'center',
  },
  timeIndicatorDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.timeIndicator,
    marginLeft: -4,
  },

  // Section chrome
  sectionBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  sectionLabel: {
    fontFamily: FONTS.heading,
    fontSize: 10,
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
    paddingVertical: 4,
  },
  taskColBody: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    paddingHorizontal: 4,
    paddingTop: 3,
    paddingBottom: 4,
  },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2, gap: 3 },
  taskDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4, flexShrink: 0 },
  taskTitle: { fontFamily: FONTS.body, fontSize: 9, color: COLORS.text, flex: 1, lineHeight: 13 },
  taskDone: { color: COLORS.textSecondary, textDecorationLine: 'line-through' },
  emptyHint: {
    fontFamily: FONTS.body, fontSize: 10, color: COLORS.textSecondary,
    textAlign: 'center', marginTop: 4,
  },

  // Meal Plan
  mealPlanLabelRow: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  mealHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  mealColHead: {
    flex: 1,
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  mealColBorder: {
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  mealGroupLabel: {
    fontFamily: FONTS.heading,
    fontSize: 8,
    letterSpacing: 0.4,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  mealPersonName: {
    fontFamily: FONTS.heading,
    fontSize: 8,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
  },
  mealDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 22,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  mealDateLabel: {
    width: TIMELINE_W,
    fontFamily: FONTS.bodyMedium,
    fontSize: 9,
    color: COLORS.text,
    paddingLeft: 5,
  },
  mealCell: {
    flex: 1,
    fontFamily: FONTS.body,
    fontSize: 9,
    color: COLORS.text,
    paddingHorizontal: 4,
    paddingVertical: 3,
  },

  // Rewards + Call side-by-side row
  rewardsCallRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  rewardsPane: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  callPane: {
    flex: 1,
  },

  // Rewards
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
    gap: 6,
  },
  rewardName: { fontFamily: FONTS.bodyMedium, fontSize: 10, width: 38 },
  rewardBarTrack: {
    flex: 1,
    height: 5,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  rewardBarFill: { height: '100%', borderRadius: 3 },
  rewardPts: { fontFamily: FONTS.body, fontSize: 9, width: 40, textAlign: 'right' },

  // Video Call section
  videoCallSection: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 8,
  },
  callRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: 36,
    gap: 5,
    marginTop: 4,
  },
  callCancelBtn: { backgroundColor: '#dc2626', paddingHorizontal: 12, flex: 0, marginTop: 0 },
  callBtnIcon: { fontSize: 14 },
  callBtnText: { fontFamily: FONTS.headingBold, fontSize: 12, color: '#fff', letterSpacing: 0.3 },
});
