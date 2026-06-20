import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, Image, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, FlatList, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useIdentity } from '../contexts/IdentityContext';
import { getOrCreateClient } from '../streamClient';
import { COLORS, FONTS, getAccentColor } from '../theme';
import { fetchCalendarEvents, invalidateCalendarCache } from '../services/calendarService';
import { fetchTasks, isTaskForDate, isCompleteForDate, todayStr } from '../services/tasksService';
import { fetchMealsForDates } from '../services/mealsService';
import { updateCalendarEvent, deleteCalendarEvent } from '../services/calendarWriteService';

// ─── layout constants ─────────────────────────────────────────────────────────

const HOUR_HEIGHT = 26;
const TIMELINE_W  = 38;
const GRID_START  = 6;
const GRID_END    = 20;
const GRID_HOURS  = Array.from({ length: GRID_END - GRID_START + 1 }, (_, i) => GRID_START + i);
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

function pad(n) { return String(n).padStart(2, '0'); }

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

function toISO(dateStr, timeStr) {
  const m = (timeStr || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1]), min = parseInt(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${dateStr}T${pad(h)}:${pad(min)}:00+08:00`;
}

function extractTime(iso) {
  if (!iso) return '09:00';
  try {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return '09:00'; }
}

// ─── time picker helpers ──────────────────────────────────────────────────────

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

function display12(hhmm) {
  const [h, m] = (hhmm || '09:00').split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ─── overlap layout ───────────────────────────────────────────────────────────

function layoutOverlappingEvents(events) {
  const filtered = (events || []).filter(ev => !ev.allDay && ev.startTime);
  if (filtered.length <= 1) return filtered.map(ev => ({ ...ev, _col: 0, _totalCols: 1 }));

  const sorted = [...filtered].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const result = sorted.map(ev => ({ ...ev, _col: 0, _totalCols: 1 }));

  const colEnds = [];
  for (const ev of result) {
    const start = new Date(ev.startTime).getTime();
    const end   = ev.endTime ? new Date(ev.endTime).getTime() : start + 3600000;
    let placed = false;
    for (let ci = 0; ci < colEnds.length; ci++) {
      if (colEnds[ci] <= start) { colEnds[ci] = end; ev._col = ci; placed = true; break; }
    }
    if (!placed) { ev._col = colEnds.length; colEnds.push(end); }
  }

  const n = result.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(i) { return parent[i] === i ? i : (parent[i] = find(parent[i])); }
  function union(i, j) { parent[find(i)] = find(j); }

  for (let i = 0; i < n; i++) {
    const si = new Date(result[i].startTime).getTime();
    const ei = result[i].endTime ? new Date(result[i].endTime).getTime() : si + 3600000;
    for (let j = i + 1; j < n; j++) {
      const sj = new Date(result[j].startTime).getTime();
      const ej = result[j].endTime ? new Date(result[j].endTime).getTime() : sj + 3600000;
      if (si < ej && ei > sj) union(i, j);
    }
  }

  const clusterMax = {};
  for (let i = 0; i < n; i++) {
    const g = find(i); clusterMax[g] = Math.max(clusterMax[g] ?? 0, result[i]._col);
  }
  for (let i = 0; i < n; i++) { result[i]._totalCols = clusterMax[find(i)] + 1; }

  return result;
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

// ─── TimePicker ───────────────────────────────────────────────────────────────

function TimePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const flatRef         = useRef(null);
  const idx             = TIME_SLOTS.indexOf(value);

  useEffect(() => {
    if (open && idx >= 0) {
      const t = setTimeout(() => {
        try { flatRef.current?.scrollToIndex({ index: Math.max(0, idx - 2), animated: false }); }
        catch {}
      }, 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <>
      <TouchableOpacity style={styles.tpBtn} onPress={() => setOpen(true)} activeOpacity={0.75}>
        <Text style={styles.tpBtnText}>{display12(value)}</Text>
        <Text style={styles.tpChevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.tpOverlay} onPress={() => setOpen(false)}>
          <View style={styles.tpDropdown}>
            <FlatList
              ref={flatRef}
              data={TIME_SLOTS}
              keyExtractor={t => t}
              showsVerticalScrollIndicator
              getItemLayout={(_, i) => ({ length: 44, offset: 44 * i, index: i })}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.tpItem, item === value && styles.tpItemSelected]}
                  onPress={() => { onChange(item); setOpen(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tpItemText, item === value && styles.tpItemTextSelected]}>
                    {display12(item)}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── EventSheet ───────────────────────────────────────────────────────────────

function EventSheet({ visible, event, onClose, onSaved, onDeleted }) {
  const insets = useSafeAreaInsets();
  const [title,     setTitle]     = useState('');
  const [date,      setDate]      = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime,   setEndTime]   = useState('10:00');
  const [location,  setLocation]  = useState('');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => {
    if (visible && event) {
      setTitle(event.title || '');
      setDate(event.startTime ? event.startTime.slice(0, 10) : todayStr());
      setStartTime(extractTime(event.startTime));
      setEndTime(event.endTime ? extractTime(event.endTime) : '10:00');
      setLocation(event.location || '');
      setSaving(false);
      setError('');
    }
  }, [visible]);

  function handleStartChange(newStart) {
    setStartTime(newStart);
    const [sh, sm] = newStart.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (eh * 60 + em <= sh * 60 + sm) {
      const newMins = Math.min(sh * 60 + sm + 60, 23 * 60 + 30);
      setEndTime(`${pad(Math.floor(newMins / 60))}:${pad(newMins % 60)}`);
    }
  }

  async function handleSave() {
    if (!title.trim()) return setError('Title is required');
    const startISO = toISO(date, startTime);
    const endISO   = toISO(date, endTime);
    if (!startISO || !endISO) return setError('Invalid time');
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (eh * 60 + em <= sh * 60 + sm) return setError('End must be after start');
    setSaving(true);
    setError('');
    try {
      await updateCalendarEvent({
        eventId:  event.id,
        person:   event.person,
        title:    title.trim(),
        startISO, endISO,
        location: location.trim(),
      });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    Alert.alert(
      'Delete Event',
      `Delete "${event?.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await deleteCalendarEvent({ eventId: event.id, person: event.person });
              onDeleted?.();
              onClose();
            } catch (e) {
              setError(e.message || 'Failed to delete');
              setSaving(false);
            }
          },
        },
      ]
    );
  }

  const personColor = COLORS[event?.person] || COLORS.family;
  const personLabel = event?.person
    ? event.person.charAt(0).toUpperCase() + event.person.slice(1)
    : '';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: COLORS.background }}
        behavior="padding"
      >
        <View style={[styles.sheetHeader, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={styles.sheetCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>EDIT EVENT</Text>
          <TouchableOpacity onPress={handleDelete} hitSlop={12} disabled={saving}>
            <Text style={[styles.sheetCancel, { color: '#C0392B' }]}>Delete</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>TITLE</Text>
          <TextInput
            style={styles.textInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Event title"
            placeholderTextColor={COLORS.textSecondary}
            returnKeyType="next"
            autoFocus
          />

          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>START</Text>
              <TimePicker value={startTime} onChange={handleStartChange} />
            </View>
            <Text style={styles.timeSep}>→</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>END</Text>
              <TimePicker value={endTime} onChange={setEndTime} />
            </View>
          </View>

          <Text style={styles.fieldLabel}>FOR</Text>
          <View style={[styles.personBadge, { backgroundColor: personColor, borderColor: personColor }]}>
            <Text style={styles.personBadgeText}>{personLabel}</Text>
          </View>

          <Text style={styles.fieldLabel}>LOCATION <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput
            style={styles.textInput}
            value={location}
            onChangeText={setLocation}
            placeholder="Add location"
            placeholderTextColor={COLORS.textSecondary}
            returnKeyType="done"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>SAVE CHANGES</Text>
            }
          </TouchableOpacity>

          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── EventBlock ───────────────────────────────────────────────────────────────

function EventBlock({ event, color, light, onPress }) {
  if (event.allDay) return null;
  const top = eventTop(event.startTime);
  if (top === null) return null;
  const height = Math.min(eventHeight(event.startTime, event.endTime), GRID_HEIGHT - top);

  const leftVal  = event._totalCols > 1 ? `${(event._col / event._totalCols * 100) + 0.5}%` : 2;
  const rightVal = event._totalCols > 1 ? `${((event._totalCols - event._col - 1) / event._totalCols * 100) + 0.5}%` : 2;

  return (
    <TouchableOpacity
      style={[styles.eventBlock, { top, height, backgroundColor: light, borderLeftColor: color, left: leftVal, right: rightVal }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.eventTitleText, { color }]} numberOfLines={1}>
        {event.title}
      </Text>
      {height > 20 && event.location ? (
        <Text style={[styles.eventTimeText, { color }]} numberOfLines={1}>
          {event.location}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── CallHomeButton ───────────────────────────────────────────────────────────

function CallHomeButton({ identity }) {
  const [state, setState] = useState('idle');
  const callRef = useRef(null);

  async function startCall() {
    setState('calling');
    try {
      const client = await getOrCreateClient();
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
        <ActivityIndicator size="small" color={COLORS.family} />
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
  const insets   = useSafeAreaInsets();
  const navigation = useNavigation();
  const accent   = getAccentColor(identity);

  const [viewDate,   setViewDate]   = useState(() => todayStr());
  const [events,     setEvents]     = useState({ maddie: [], alex: [], marj: [] });
  const [tasks,      setTasks]      = useState([]);
  const [meals,      setMeals]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tick,       setTick]       = useState(0);
  const [editingEvent, setEditingEvent] = useState(null);

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
      if (evData.status !== 'fulfilled') {
        setTimeout(async () => {
          try { setEvents(await fetchCalendarEvents(viewDate)); } catch {}
        }, 2000);
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [viewDate]);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(useCallback(() => {
    fetchTasks().then(d => setTasks(d)).catch(() => {});
    fetchMealsForDates([viewDate]).then(d => setMeals(d)).catch(() => {});
    fetchCalendarEvents(viewDate).then(d => setEvents(d)).catch(() => {});
  }, [viewDate]));

  function onRefresh() { setRefreshing(true); load(); }

  const reloadCalendar = useCallback(async () => {
    try {
      invalidateCalendarCache();
      const evData = await fetchCalendarEvents(viewDate);
      setEvents(evData);
    } catch {}
  }, [viewDate]);

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

  const tiTop  = isToday ? getTimeIndicatorTop() : -1;
  const dayLabel = isToday
    ? 'Today'
    : new Date(viewDate + 'T12:00:00').toLocaleDateString('en-SG', { weekday: 'short' });

  const BTN_W = 44;

  return (
    <View style={styles.screen}>

      {/* Custom header */}
      <View style={[styles.customHeader, { paddingTop: insets.top }]}>
        <View style={[styles.headerInner, { height: 52 }]}>
          <View style={{ width: BTN_W, alignItems: 'center', justifyContent: 'center' }}>
            <CallHomeButton identity={identity} />
          </View>
          <Text style={styles.headerTitle}>Home</Text>
          <TouchableOpacity
            style={{ width: BTN_W, alignItems: 'center', justifyContent: 'center' }}
            onPress={clearIdentity}
            activeOpacity={0.7}
          >
            <Ionicons name="person-circle-outline" size={28} color={accent} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Date nav */}
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

      <ScrollView style={{ flex: 1 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        {/* Calendar col headers — tappable, fixed height */}
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => navigation.navigate('Calendar')}
        >
          <View style={styles.colHeaderRow}>
            <View style={{ width: TIMELINE_W }} />
            {PERSONS.map(p => (
              <View key={p.key} style={[styles.colHeader, { backgroundColor: p.light }]}>
                <PersonAvatar person={p} />
                <Text style={[styles.colName, { color: p.color }]}>{p.label.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>

        {/* Calendar grid — fixed height so Tasks always anchors to 8pm line */}
        <View style={{ height: GRID_HEIGHT + 8, overflow: 'hidden' }}>
          <TouchableOpacity
            activeOpacity={0.95}
            onPress={() => navigation.navigate('Calendar')}
          >
          <View style={{ position: 'relative', height: GRID_HEIGHT + 8 }}>
            <View style={{ flexDirection: 'row', height: GRID_HEIGHT, marginTop: 8 }}>
              {/* Hour labels */}
              <View style={{ width: TIMELINE_W, height: GRID_HEIGHT, position: 'relative', overflow: 'visible' }}>
                {GRID_HOURS.map((h, i) => {
                  const isFirst = i === 0;
                  const isLast  = i === GRID_HOURS.length - 1;
                  const top = isFirst ? 0 : isLast ? i * HOUR_HEIGHT - 10 : i * HOUR_HEIGHT - 5;
                  return (
                    <Text key={h} style={[styles.hourLabel, { position: 'absolute', top, right: 5 }]}>
                      {formatHour(h)}
                    </Text>
                  );
                })}
              </View>

              {/* Data columns */}
              {PERSONS.map(p => {
                const laid = layoutOverlappingEvents(events[p.key] || []);
                return (
                  <View key={p.key} style={styles.gridCol}>
                    {/* Hour lines — skip first (6am) to avoid cutting through label */}
                    {GRID_HOURS.slice(1).map((_, i) => (
                      <View key={i + 1} style={[styles.hourLine, { top: (i + 1) * HOUR_HEIGHT }]} />
                    ))}
                    {/* Half-hour lines */}
                    {GRID_HOURS.slice(0, -1).map((_, i) => (
                      <View key={`h${i}`} style={[styles.halfHourLine, { top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }]} />
                    ))}
                    {/* Events */}
                    {laid.map((ev, idx) => (
                      <EventBlock
                        key={ev.id || idx}
                        event={ev}
                        color={p.color}
                        light={p.light}
                        onPress={() => setEditingEvent(ev)}
                      />
                    ))}
                  </View>
                );
              })}
            </View>

            {tiTop >= 0 && (
              <View pointerEvents="none" style={[styles.timeIndicator, { top: tiTop + 8 }]}>
                <View style={styles.timeIndicatorDot} />
              </View>
            )}
          </View>
          </TouchableOpacity>
        </View>

        {/* Tasks section — header tappable, body scrollable per column */}
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => navigation.navigate('Tasks')}
        >
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: TIMELINE_W }} />
            {PERSONS.map(p => (
              <View key={p.key} style={styles.taskColHead}>
                <Text style={[styles.sectionLabel, { color: p.color }]}>TASKS ›</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', height: 110 }}>
          <View style={{ width: TIMELINE_W }} />
          {PERSONS.map(p => {
            const colTasks = tasksFor(p.key);
            return (
              <ScrollView
                key={p.key}
                style={styles.taskColBody}
                nestedScrollEnabled
                showsVerticalScrollIndicator={colTasks.length > 0}
              >
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
              </ScrollView>
            );
          })}
        </View>

        {/* Meal Plan section */}
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => navigation.navigate('Meals')}
        >
          <View style={styles.sectionBorder}>
            {/* Label row */}
            <View style={styles.mealPlanLabelRow}>
              <Text style={styles.sectionLabel}>MEAL PLAN ›</Text>
            </View>

            {/* Group header row */}
            <View style={[styles.mealHeaderRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}>
              <View style={{ width: TIMELINE_W }} />
              <View style={[styles.mealGroup, { flex: 2, borderLeftWidth: 1, borderLeftColor: COLORS.border }]}>
                <Text style={styles.mealGroupLabel}>BREAKFAST</Text>
              </View>
              <View style={[styles.mealGroup, { flex: 2, borderLeftWidth: 1, borderLeftColor: COLORS.border }]}>
                <Text style={styles.mealGroupLabel}>LUNCH</Text>
              </View>
              <View style={[styles.mealGroup, { flex: 1, borderLeftWidth: 1, borderLeftColor: COLORS.border }]}>
                <Text style={styles.mealGroupLabel}>DINNER</Text>
              </View>
            </View>

            {/* Person sub-header row */}
            <View style={[styles.mealSubRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border }]}>
              <View style={{ width: TIMELINE_W }} />
              <View style={[styles.mealPersonCell, { borderLeftWidth: 1, borderLeftColor: COLORS.border }]}>
                <Text style={[styles.mealPersonSub, { color: COLORS.maddie }]}>MADDIE</Text>
              </View>
              <View style={[styles.mealPersonCell, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: COLORS.border }]}>
                <Text style={[styles.mealPersonSub, { color: COLORS.alex }]}>ALEX</Text>
              </View>
              <View style={[styles.mealPersonCell, { borderLeftWidth: 1, borderLeftColor: COLORS.border }]}>
                <Text style={[styles.mealPersonSub, { color: COLORS.maddie }]}>MADDIE</Text>
              </View>
              <View style={[styles.mealPersonCell, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: COLORS.border }]}>
                <Text style={[styles.mealPersonSub, { color: COLORS.alex }]}>ALEX</Text>
              </View>
              <View style={[styles.mealPersonCell, { borderLeftWidth: 1, borderLeftColor: COLORS.border }]}>
                <Text style={styles.mealPersonSub}></Text>
              </View>
            </View>

            {/* Data row */}
            <View style={[styles.mealDataRow, { borderBottomWidth: 1, borderBottomColor: COLORS.border }]}>
              <Text style={styles.mealDateLabel}>{dayLabel}</Text>
              <Text style={[styles.mealCell, { borderLeftWidth: 1, borderLeftColor: COLORS.border, color: COLORS.maddie }]} numberOfLines={1}>
                {mealFor(viewDate, 'maddie', 'breakfast')}
              </Text>
              <Text style={[styles.mealCell, { color: COLORS.alex }]} numberOfLines={1}>
                {mealFor(viewDate, 'alex', 'breakfast')}
              </Text>
              <Text style={[styles.mealCell, { borderLeftWidth: 1, borderLeftColor: COLORS.border, color: COLORS.maddie }]} numberOfLines={1}>
                {mealFor(viewDate, 'maddie', 'lunch')}
              </Text>
              <Text style={[styles.mealCell, { color: COLORS.alex }]} numberOfLines={1}>
                {mealFor(viewDate, 'alex', 'lunch')}
              </Text>
              <Text style={[styles.mealCell, { borderLeftWidth: 1, borderLeftColor: COLORS.border }]} numberOfLines={1}>
                {dinnerFor(viewDate)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Event edit sheet */}
      {editingEvent && (
        <EventSheet
          visible={!!editingEvent}
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSaved={reloadCalendar}
          onDeleted={reloadCalendar}
        />
      )}
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },

  // Custom header
  customHeader: { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0 },
  headerTitle: {
    flex: 1, fontFamily: FONTS.headingBold, fontSize: 18,
    color: COLORS.text, textAlign: 'center', letterSpacing: 0.3,
  },
  callHeaderBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.familyLight,
    alignItems: 'center', justifyContent: 'center',
  },
  callHeaderBtnIcon: { fontSize: 16 },

  // Date nav
  dateNav: {
    flexDirection: 'row', alignItems: 'center', height: 38,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.background,
  },
  navBtn: { width: 44, height: 38, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 22, color: COLORS.adrian, lineHeight: 26 },
  navCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontFamily: FONTS.headingBold, fontSize: 15, letterSpacing: 0.3, color: COLORS.adrian },

  // Column headers
  colHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  colHeader: {
    flex: 1, alignItems: 'center', paddingVertical: 5,
    borderLeftWidth: 1, borderLeftColor: COLORS.border, gap: 3,
  },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  avatarInitial: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarInitialText: { fontFamily: FONTS.headingBold, fontSize: 15, color: '#fff' },
  colName: { fontFamily: FONTS.headingBold, fontSize: 8, letterSpacing: 0.8 },

  scroll: { flex: 1 },

  // Calendar grid
  gridCol: {
    flex: 1, height: GRID_HEIGHT, position: 'relative',
    borderLeftWidth: 1, borderLeftColor: COLORS.border,
    overflow: 'hidden',
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
    fontFamily: FONTS.body, fontSize: 8, color: COLORS.textSecondary,
    lineHeight: 10, textAlign: 'right',
  },
  eventBlock: {
    position: 'absolute', borderLeftWidth: 2, paddingLeft: 3, paddingTop: 1,
    borderRadius: 2, overflow: 'hidden',
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
    backgroundColor: COLORS.timeIndicator, marginLeft: -4,
  },

  // Section chrome
  sectionBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  sectionLabel: {
    fontFamily: FONTS.heading, fontSize: 10, letterSpacing: 0.8,
    color: COLORS.textSecondary, textTransform: 'uppercase',
  },

  // Tasks
  taskColHead: {
    flex: 1, paddingHorizontal: 5, paddingVertical: 3,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    borderLeftWidth: 1, borderLeftColor: COLORS.border,
  },
  taskColBody: {
    flex: 1, borderLeftWidth: 1, borderLeftColor: COLORS.border,
    paddingHorizontal: 4, paddingTop: 2, paddingBottom: 5,
  },
  taskRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3, gap: 3 },
  taskCheckbox: {
    width: 10, height: 10, borderRadius: 2, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  taskCheckMark: { fontSize: 7, color: '#fff', fontFamily: FONTS.bodyMedium, lineHeight: 9 },
  taskTitle: { fontFamily: FONTS.body, fontSize: 9, flex: 1, lineHeight: 13 },
  taskDone: { textDecorationLine: 'line-through' },
  emptyHint: {
    fontFamily: FONTS.body, fontSize: 10, color: COLORS.textSecondary,
    textAlign: 'center', marginTop: 5,
  },

  // Meal Plan
  mealPlanLabelRow: { paddingHorizontal: 10, paddingVertical: 4 },
  mealHeaderRow: { flexDirection: 'row', borderBottomWidth: 0 },
  mealGroup: {
    alignItems: 'center', paddingVertical: 3,
  },
  mealGroupLabel: {
    fontFamily: FONTS.headingBold, fontSize: 7, letterSpacing: 0.5,
    color: COLORS.textSecondary, textAlign: 'center',
  },
  mealSubRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  mealPersonCell: {
    flex: 1, paddingVertical: 2, alignItems: 'center',
  },
  mealPersonSub: {
    fontFamily: FONTS.headingBold, fontSize: 7, letterSpacing: 0.3, textTransform: 'uppercase',
    color: COLORS.textSecondary,
  },
  mealDataRow: {
    flexDirection: 'row', alignItems: 'center', minHeight: 22,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  mealDateLabel: {
    width: TIMELINE_W, fontFamily: FONTS.headingBold, fontSize: 8,
    color: COLORS.text, paddingLeft: 5,
  },
  mealCell: {
    flex: 1, fontFamily: FONTS.body, fontSize: 8, color: COLORS.text,
    textAlign: 'center', paddingHorizontal: 2, paddingVertical: 3,
  },

  // Time picker
  tpBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: COLORS.surface,
  },
  tpBtnText: { fontFamily: FONTS.bodyMedium, fontSize: 16, color: COLORS.text },
  tpChevron: { fontSize: 12, color: COLORS.textSecondary, marginLeft: 8 },
  tpOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  tpDropdown: {
    backgroundColor: COLORS.background, borderRadius: 10,
    width: 200, maxHeight: 286, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 8,
  },
  tpItem: { height: 44, justifyContent: 'center', paddingHorizontal: 16 },
  tpItemSelected: { backgroundColor: '#E8EEF4' },
  tpItemText: { fontFamily: FONTS.body, fontSize: 15, color: COLORS.text },
  tpItemTextSelected: { fontFamily: FONTS.headingBold, color: COLORS.adrian },

  // Event sheet
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  sheetCancel: { fontFamily: FONTS.body, fontSize: 16, color: COLORS.textSecondary },
  sheetTitle: { fontFamily: FONTS.headingBold, fontSize: 14, letterSpacing: 1.5, color: COLORS.text },
  sheetBody: { paddingHorizontal: 20, paddingTop: 20 },
  fieldLabel: {
    fontFamily: FONTS.heading, fontSize: 11, letterSpacing: 1,
    color: COLORS.textSecondary, marginBottom: 6, marginTop: 16,
  },
  optional: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textSecondary, letterSpacing: 0, textTransform: 'none' },
  textInput: {
    fontFamily: FONTS.body, fontSize: 16, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: COLORS.surface,
  },
  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  timeSep: { fontFamily: FONTS.body, fontSize: 16, color: COLORS.textSecondary, paddingBottom: 14 },
  personBadge: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, alignSelf: 'flex-start',
  },
  personBadgeText: { fontFamily: FONTS.bodyMedium, fontSize: 14, color: '#fff' },
  errorText: { fontFamily: FONTS.body, fontSize: 13, color: '#C0392B', marginTop: 12, textAlign: 'center' },
  saveBtn: { marginTop: 24, backgroundColor: COLORS.timeIndicator, borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { fontFamily: FONTS.headingBold, fontSize: 14, letterSpacing: 1.5, color: '#fff' },
});
