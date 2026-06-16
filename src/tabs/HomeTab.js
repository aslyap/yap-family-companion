import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useStreamVideoClient } from '@stream-io/video-react-native-sdk';
import { useIdentity } from '../contexts/IdentityContext';
import { COLORS, FONTS, getAccentColor } from '../theme';
import { fetchCalendarEvents } from '../services/calendarService';
import { fetchTasks, isTaskForDate, isCompleteForDate, todayStr } from '../services/tasksService';
import { fetchMealsForDates } from '../services/mealsService';

// ─── layout constants ─────────────────────────────────────────────────────────

const HOUR_HEIGHT = 26;
const TIMELINE_W  = 38;
const GRID_START  = 6;   // 6am
const GRID_END    = 20;  // 8pm
const GRID_HOURS  = Array.from({ length: GRID_END - GRID_START + 1 }, (_, i) => GRID_START + i);
// GRID_HOURS now includes 20 (8pm) so we can render its label in the main loop.
// The grid itself only occupies GRID_END - GRID_START hours:
const GRID_HEIGHT = (GRID_END - GRID_START) * HOUR_HEIGHT;

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
      <Text style={[styles.eventTitleText, { color }]} numberOfLines={1}>
        {event.title}
      </Text>
      {height > 20 && event.location ? (
        <Text style={[styles.eventTimeText, { color }]} numberOfLines={1}>
          {event.location}
        </Text>
      ) : null}
    </View>
  );
}

// ─── CallHomeButton ───────────────────────────────────────────────────────────

function CallHomeButton({ identity }) {
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

  if (state === 'calling') {
    return (
      <TouchableOpacity style={styles.callHeaderBtn} onPress={cancelCall} activeOpacity={0.7}>
        <ActivityIndicator size="small" color="#fff" />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.callHeaderBtn} onPress={startCall} activeOpacity={0.8}>
      <Text style={styles.callHeaderBtnIcon}>📹</Text>
    </TouchableOpacity>
  );
}

// ─── HomeTab ──────────────────────────────────────────────────────────────────

export default function HomeTab() {
  const { identity, clearIdentity } = useIdentity();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const accent = getAccentColor(identity);

  const [viewDate, setViewDate]   = useState(() => todayStr());
  const [events,   setEvents]     = useState({ maddie: [], alex: [], marj: [] });
  const [tasks,    setTasks]      = useState([]);
  const [meals,    setMeals]      = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick]           = useState(0);

  const isToday = viewDate === todayStr();

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const [evData, taskData, mealData] = await Promise.allSettled([
        fetchCalendarEvents(viewDate),
        fetchTasks(),
        fetchMealsForDates([viewDate]),
      ]);
      if (evData.status   === 'fulfilled') setEvents(evData.value);
      if (taskData.status === 'fulfilled') setTasks(taskData.value);
      if (mealData.status === 'fulfilled') setMeals(mealData.value);
      // Silent retry if calendar failed (backend cold-start)
      if (evData.status !== 'fulfilled') {
        setTimeout(async () => {
          try { setEvents(await fetchCalendarEvents(viewDate)); } catch {}
        }, 4000);
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [viewDate]);

  useEffect(() => { load(); }, [load]);

  // Re-fetch tasks + meals when returning to this tab (e.g. after adding a task)
  useFocusEffect(useCallback(() => {
    fetchTasks().then(d => setTasks(d)).catch(() => {});
    fetchMealsForDates([viewDate]).then(d => setMeals(d)).catch(() => {});
  }, [viewDate]));

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

  const dayLabel = isToday
    ? 'Today'
    : new Date(viewDate + 'T12:00:00').toLocaleDateString('en-SG', { weekday: 'short' });

  // Measure the button area width for symmetric spacing
  const BTN_W = 44;

  return (
    <View style={styles.screen}>

      {/* ── Custom header ── */}
      <View style={[styles.customHeader, { paddingTop: insets.top }]}>
        <View style={[styles.headerInner, { height: 52 }]}>
          {/* Left: Call Home button */}
          <View style={{ width: BTN_W, alignItems: 'center', justifyContent: 'center' }}>
            <CallHomeButton identity={identity} />
          </View>
          {/* Center: Home title */}
          <Text style={styles.headerTitle}>Home</Text>
          {/* Right: User identity button */}
          <TouchableOpacity
            style={{ width: BTN_W, alignItems: 'center', justifyContent: 'center' }}
            onPress={clearIdentity}
            activeOpacity={0.7}
          >
            <Ionicons name="person-circle-outline" size={28} color={accent} />
          </TouchableOpacity>
        </View>
      </View>

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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
      >
        {/* ── Calendar section (avatars + grid, tappable → Calendar tab) ── */}
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => navigation.navigate('Calendar')}
        >
          {/* Column headers inside scroll so 6am label has room above the grid */}
          <View style={styles.colHeaderRow}>
            <View style={{ width: TIMELINE_W }} />
            {PERSONS.map(p => (
              <View key={p.key} style={[styles.colHeader, { backgroundColor: p.light }]}>
                <PersonAvatar person={p} />
                <Text style={[styles.colName, { color: p.color }]}>{p.label.toUpperCase()}</Text>
              </View>
            ))}
          </View>
          <View style={{ position: 'relative' }}>
            <View style={{ flexDirection: 'row', height: GRID_HEIGHT }}>

              {/* Hour labels — include 8pm via extended GRID_HOURS */}
              <View style={{ width: TIMELINE_W, height: GRID_HEIGHT, position: 'relative', overflow: 'visible' }}>
                {GRID_HOURS.map((h, i) => {
                  const top = i === 0 ? -4 : i * HOUR_HEIGHT - 5;
                  return (
                    <Text key={h} style={[styles.hourLabel, { position: 'absolute', top, right: 5 }]}>
                      {formatHour(h)}
                    </Text>
                  );
                })}
              </View>

              {/* Data columns */}
              {PERSONS.map(p => (
                <View key={p.key} style={styles.gridCol}>
                  {/* Top border (6am line) */}
                  <View style={[styles.hourLine, { top: 0 }]} />
                  {/* Remaining hour lines */}
                  {GRID_HOURS.slice(1).map((_, i) => (
                    <View key={i + 1} style={[styles.hourLine, { top: (i + 1) * HOUR_HEIGHT }]} />
                  ))}
                  {/* Half-hour lines */}
                  {GRID_HOURS.slice(0, -1).map((_, i) => (
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
        </TouchableOpacity>

        {/* ── Tasks section (tappable → Tasks tab) ── */}
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => navigation.navigate('Tasks')}
        >
          <View>
            {/* Tasks header — border starts at TIMELINE_W so it doesn't cross the 8pm label */}
            <View style={{ flexDirection: 'row' }}>
              <View style={{ width: TIMELINE_W }} />
              {PERSONS.map(p => (
                <View key={p.key} style={styles.taskColHead}>
                  <Text style={[styles.sectionLabel, { color: p.color }]}>TASKS ›</Text>
                </View>
              ))}
            </View>
            {/* Tasks body */}
            <View style={{ flexDirection: 'row', minHeight: 48 }}>
              <View style={{ width: TIMELINE_W }} />
              {PERSONS.map(p => {
                const colTasks = tasksFor(p.key);
                return (
                  <View key={p.key} style={styles.taskColBody}>
                    {colTasks.length === 0 ? (
                      <Text style={styles.emptyHint}>—</Text>
                    ) : colTasks.map(t => (
                      <View key={t.id} style={styles.taskRow}>
                        <View style={[styles.taskCheckbox, {
                          borderColor: p.color,
                          backgroundColor: t.done ? p.color : 'transparent',
                        }]}>
                          {t.done && <Text style={styles.taskCheckMark}>✓</Text>}
                        </View>
                        <Text style={[styles.taskTitle, { color: t.done ? COLORS.textSecondary : p.color }, t.done && styles.taskDone]} numberOfLines={2}>
                          {t.title}{t.recurring ? ' ↻' : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>

        {/* ── Meal Plan section (tappable → Meals tab) ── */}
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => navigation.navigate('Meals')}
        >
          <View style={styles.sectionBorder}>
            {/* Section label */}
            <View style={styles.mealPlanLabelRow}>
              <Text style={styles.sectionLabel}>MEAL PLAN ›</Text>
            </View>
            {/* Column headers — LUNCH spans both Maddie + Alex */}
            <View style={[styles.mealHeaderRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
              <View style={{ width: TIMELINE_W }} />
              {/* Lunch group: flex:2 to match Maddie+Alex data cells below */}
              <View style={{ flex: 2, borderLeftWidth: 1, borderLeftColor: COLORS.border }}>
                <Text style={styles.mealGroupLabel}>LUNCH</Text>
                <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border }}>
                  <View style={{ flex: 1, paddingVertical: 2, alignItems: 'center' }}>
                    <Text style={[styles.mealPersonSub, { color: COLORS.maddie }]}>MADDIE</Text>
                  </View>
                  <View style={{ flex: 1, paddingVertical: 2, alignItems: 'center', borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: COLORS.border }}>
                    <Text style={[styles.mealPersonSub, { color: COLORS.alex }]}>ALEX</Text>
                  </View>
                </View>
              </View>
              {/* Dinner */}
              <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: COLORS.border, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 }}>
                <Text style={styles.mealGroupLabel}>DINNER</Text>
              </View>
            </View>
            {/* Data row */}
            <View style={styles.mealDataRow}>
              <Text style={styles.mealDateLabel}>{dayLabel}</Text>
              <Text style={[styles.mealCell, { borderLeftWidth: 1, borderLeftColor: COLORS.border }]} numberOfLines={1}>
                {mealFor(viewDate, 'maddie', 'lunch')}
              </Text>
              <Text style={[styles.mealCell]} numberOfLines={1}>
                {mealFor(viewDate, 'alex', 'lunch')}
              </Text>
              <Text style={[styles.mealCell, { borderLeftWidth: 1, borderLeftColor: COLORS.border }]} numberOfLines={1}>
                {dinnerFor(viewDate)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },

  // Custom header
  customHeader: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FONTS.headingBold,
    fontSize: 15,
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  callHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.family,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callHeaderBtnIcon: { fontSize: 16 },

  // Date nav
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  navBtn: { width: 44, height: 38, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 22, color: COLORS.adrian, lineHeight: 26 },
  navCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  navLabel: {
    fontFamily: FONTS.headingBold,
    fontSize: 12,
    letterSpacing: 0.5,
    color: COLORS.adrian,
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
    paddingVertical: 5,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    gap: 3,
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
    fontSize: 8,
    letterSpacing: 0.8,
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
    height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border,
  },
  halfHourLine: {
    position: 'absolute', left: 0, right: 0,
    height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, opacity: 0.35,
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
    paddingHorizontal: 5,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  taskColBody: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    paddingHorizontal: 4,
    paddingTop: 3,
    paddingBottom: 6,
  },
  taskRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3, gap: 3 },
  taskCheckbox: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  taskCheckMark: {
    fontSize: 7,
    color: '#fff',
    fontFamily: FONTS.bodyMedium,
    lineHeight: 9,
  },
  taskTitle: { fontFamily: FONTS.body, fontSize: 9, flex: 1, lineHeight: 13 },
  taskDone: { textDecorationLine: 'line-through' },
  emptyHint: {
    fontFamily: FONTS.body, fontSize: 10, color: COLORS.textSecondary,
    textAlign: 'center', marginTop: 6,
  },

  // Meal Plan
  mealPlanLabelRow: {
    paddingHorizontal: 10,
    paddingVertical: 5,
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
    alignItems: 'center',
  },
  mealGroupLabel: {
    fontFamily: FONTS.heading,
    fontSize: 8,
    letterSpacing: 0.6,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingTop: 3,
    paddingBottom: 1,
  },
  mealPersonSub: {
    fontFamily: FONTS.body,
    fontSize: 7,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
  },
  mealDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 24,
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
    textAlign: 'center',
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
});
