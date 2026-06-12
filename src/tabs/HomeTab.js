import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  StreamCall,
  useStreamVideoClient,
} from '@stream-io/video-react-native-sdk';
import { useIdentity } from '../contexts/IdentityContext';
import { COLORS, FONTS, getAccentColor, getPersonLabel } from '../theme';
import { fetchCalendarEvents } from '../services/calendarService';
import { fetchTasks, isTaskForDate, isCompleteForDate, todayStr } from '../services/tasksService';
import { fetchMealsForDate } from '../services/mealsService';
import { fetchRewards } from '../services/rewardsService';

// ─── helpers ────────────────────────────────────────────────────────────────

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(d) {
  return d.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-SG', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore',
    });
  } catch {
    return iso;
  }
}

// ─── sub-components ─────────────────────────────────────────────────────────

function SectionDivider({ color }) {
  return <View style={[styles.divider, { backgroundColor: color }]} />;
}

function PersonColumn({ person, color, lightColor, events, tasks, meals }) {
  const hasEvents = events.length > 0;
  const hasTasks = tasks.length > 0;
  const lunch = meals.find(m => m.meal_type === 'lunch');
  const dinner = meals.find(m => m.meal_type === 'dinner');

  return (
    <View style={styles.col}>
      {/* Column header */}
      <View style={[styles.colHeader, { backgroundColor: lightColor }]}>
        <View style={[styles.colPill, { backgroundColor: color }]} />
        <Text style={[styles.colName, { color }]}>{person}</Text>
      </View>

      {/* Calendar events */}
      {hasEvents ? (
        events.map((ev, i) => (
          <View key={ev.id || i} style={[styles.eventChip, { borderLeftColor: color }]}>
            <Text style={styles.eventTime} numberOfLines={1}>
              {ev.allDay ? 'All day' : formatTime(ev.startTime)}
            </Text>
            <Text style={styles.eventTitle} numberOfLines={2}>{ev.title}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.emptyHint}>No events</Text>
      )}

      <SectionDivider color={COLORS.border} />

      {/* Tasks */}
      {hasTasks ? (
        tasks.map((t, i) => (
          <View key={t.id || i} style={styles.taskRow}>
            <View style={[styles.taskDot, { backgroundColor: t.done ? color : COLORS.border }]} />
            <Text style={[styles.taskTitle, t.done && styles.taskDone]} numberOfLines={2}>
              {t.title}{t.recurring ? ' ↻' : ''}
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.emptyHint}>No tasks</Text>
      )}

      <SectionDivider color={COLORS.border} />

      {/* Meals */}
      <View style={styles.mealBlock}>
        <Text style={styles.mealLabel}>Lunch</Text>
        <Text style={styles.mealText} numberOfLines={2}>{lunch?.dish_name || '—'}</Text>
        <Text style={[styles.mealLabel, { marginTop: 4 }]}>Dinner</Text>
        <Text style={styles.mealText} numberOfLines={2}>{dinner?.dish_name || '—'}</Text>
      </View>
    </View>
  );
}

function RewardsStrip({ rewards }) {
  if (!rewards.maddie && !rewards.alex) return null;
  return (
    <View style={styles.rewardsRow}>
      {['maddie', 'alex'].map(person => {
        const r = rewards[person];
        const color = person === 'maddie' ? COLORS.maddie : COLORS.alex;
        const light = person === 'maddie' ? COLORS.maddieLight : COLORS.alexLight;
        const label = person === 'maddie' ? 'Maddie' : 'Alex';
        return (
          <View key={person} style={[styles.rewardCard, { backgroundColor: light, borderColor: color }]}>
            <Text style={[styles.rewardName, { color }]}>{label}</Text>
            <Text style={[styles.rewardPoints, { color }]}>{r?.points_balance ?? 0} pts</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── CallHome button state machine ──────────────────────────────────────────

function CallHomeButton({ identity }) {
  const client = useStreamVideoClient();
  const [state, setState] = useState('idle'); // idle | calling | error
  const callRef = useRef(null);
  const accent = getAccentColor(identity);

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
    } catch (err) {
      console.error('Call Home failed:', err);
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }

  async function cancelCall() {
    try {
      if (callRef.current) {
        await callRef.current.leave({ reject: true });
        callRef.current = null;
      }
    } catch {}
    setState('idle');
  }

  if (state === 'calling') {
    return (
      <View style={styles.callRow}>
        <View style={[styles.callBtn, { backgroundColor: COLORS.family, flex: 1 }]}>
          <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.callBtnText}>Calling Home…</Text>
        </View>
        <TouchableOpacity style={[styles.callBtn, styles.cancelBtn]} onPress={cancelCall}>
          <Text style={styles.callBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.callBtn, { backgroundColor: COLORS.family }]}
      onPress={startCall}
      activeOpacity={0.8}
    >
      <Text style={styles.callBtnIcon}>📹</Text>
      <Text style={styles.callBtnText}>Call Home</Text>
    </TouchableOpacity>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

const PERSONS = [
  { key: 'maddie', label: 'Maddie', color: COLORS.maddie, light: COLORS.maddieLight },
  { key: 'alex',   label: 'Alex',   color: COLORS.alex,   light: COLORS.alexLight  },
  { key: 'marj',   label: 'Marj',   color: COLORS.marj,   light: COLORS.marjLight  },
];

export default function HomeTab() {
  const { identity } = useIdentity();
  const insets = useSafeAreaInsets();
  const accent = getAccentColor(identity);
  const today = new Date();
  const ds = dateStr(today);
  const isToday = ds === todayStr();

  const [events, setEvents] = useState({ maddie: [], alex: [], marj: [] });
  const [tasks, setTasks] = useState([]);
  const [meals, setMeals] = useState([]);
  const [rewards, setRewards] = useState({ maddie: null, alex: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [evData, taskData, mealData, rewardData] = await Promise.allSettled([
        fetchCalendarEvents(ds),
        fetchTasks(),
        fetchMealsForDate(ds),
        fetchRewards(),
      ]);
      if (evData.status === 'fulfilled') setEvents(evData.value);
      if (taskData.status === 'fulfilled') setTasks(taskData.value);
      if (mealData.status === 'fulfilled') setMeals(mealData.value);
      if (rewardData.status === 'fulfilled') setRewards(rewardData.value);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [ds]);

  useEffect(() => { load(); }, [load]);

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  function tasksFor(personKey) {
    return tasks
      .filter(t => t.assigned_to === personKey && isTaskForDate(t, ds))
      .map(t => ({ ...t, done: isCompleteForDate(t, ds) }));
  }

  // Time indicator offset — fraction of a 14-hour day (6am–8pm) elapsed.
  function timeIndicatorFraction() {
    const now = new Date();
    const elapsed = now.getHours() - 6 + now.getMinutes() / 60;
    return Math.max(0, Math.min(1, elapsed / 14));
  }

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.greeting, { color: accent }]}>
            {greeting()}, {getPersonLabel(identity)}
          </Text>
          <Text style={styles.dateText}>{formatDate(today)}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* 3-column grid */}
            <View style={styles.grid}>
              {PERSONS.map(p => (
                <PersonColumn
                  key={p.key}
                  person={p.label}
                  color={p.color}
                  lightColor={p.light}
                  events={events[p.key] || []}
                  tasks={tasksFor(p.key)}
                  meals={meals.filter(m => m.person === p.key)}
                />
              ))}
              {/* Amber time indicator across all columns (today only) */}
              {isToday && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.timeIndicator,
                    { top: `${(timeIndicatorFraction() * 100).toFixed(2)}%` },
                  ]}
                />
              )}
            </View>

            {/* Rewards strip */}
            <RewardsStrip rewards={rewards} />
          </>
        )}
      </ScrollView>

      {/* Call Home — fixed at bottom above tab bar */}
      <View style={[styles.callBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <CallHomeButton identity={identity} />
      </View>
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 80, // space for the Call Home bar
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  greeting: {
    fontFamily: FONTS.headingBold,
    fontSize: 22,
    letterSpacing: 0.3,
  },
  dateText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  col: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    paddingBottom: 8,
  },
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  colPill: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  colName: {
    fontFamily: FONTS.heading,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  eventChip: {
    marginHorizontal: 4,
    marginTop: 4,
    paddingLeft: 4,
    paddingVertical: 2,
    borderLeftWidth: 3,
  },
  eventTime: {
    fontFamily: FONTS.body,
    fontSize: 9,
    color: COLORS.textSecondary,
  },
  eventTitle: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 10,
    color: COLORS.text,
    lineHeight: 13,
  },
  emptyHint: {
    fontFamily: FONTS.body,
    fontSize: 10,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 4,
  },
  divider: {
    height: 1,
    marginHorizontal: 4,
    marginVertical: 6,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 4,
    marginTop: 3,
    gap: 4,
  },
  taskDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginTop: 3,
    flexShrink: 0,
  },
  taskTitle: {
    fontFamily: FONTS.body,
    fontSize: 10,
    color: COLORS.text,
    flex: 1,
    lineHeight: 13,
  },
  taskDone: {
    color: COLORS.textSecondary,
    textDecorationLine: 'line-through',
  },
  mealBlock: {
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  mealLabel: {
    fontFamily: FONTS.heading,
    fontSize: 9,
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  mealText: {
    fontFamily: FONTS.body,
    fontSize: 10,
    color: COLORS.text,
    lineHeight: 13,
  },

  // Time indicator
  timeIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: COLORS.timeIndicator,
    zIndex: 10,
  },

  // Rewards
  rewardsRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rewardCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  rewardName: {
    fontFamily: FONTS.heading,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  rewardPoints: {
    fontFamily: FONTS.headingBold,
    fontSize: 20,
    marginTop: 2,
  },

  // Call Home bar
  callBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  callRow: {
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 52,
    gap: 8,
  },
  cancelBtn: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 16,
  },
  callBtnIcon: {
    fontSize: 20,
  },
  callBtnText: {
    fontFamily: FONTS.headingBold,
    fontSize: 16,
    color: '#fff',
    letterSpacing: 0.3,
  },
});
