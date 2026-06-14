import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, Image, Dimensions, Pressable,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../theme';
import { fetchCalendarEventsForRange, invalidateCalendarCache } from '../services/calendarService';
import { createCalendarEvent } from '../services/calendarWriteService';

// ─── layout constants ─────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD      = 12;
const TIMELINE_W = 40;
const HOUR_H     = 36;
const GRID_START = 6;
const GRID_END   = 20;
const GRID_HOURS = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);
const GRID_H     = GRID_HOURS.length * HOUR_H;

const CONTENT_W      = SCREEN_W - 2 * H_PAD;
const MONTH_CELL_W   = Math.floor(CONTENT_W / 7);
const MONTH_CELL_H   = 58;
const WEEK_COL_W     = Math.floor((CONTENT_W - TIMELINE_W) / 7);
const DAY_COL_W      = Math.floor((CONTENT_W - TIMELINE_W) / 3);

// ─── people ───────────────────────────────────────────────────────────────────

const PERSONS = [
  { key: 'maddie', label: 'Maddie', color: COLORS.maddie, light: COLORS.maddieLight,
    avatarUri: 'https://yap-family-home.vercel.app/avatars/Maddie.jpg' },
  { key: 'alex',   label: 'Alex',   color: COLORS.alex,   light: COLORS.alexLight,
    avatarUri: 'https://yap-family-home.vercel.app/avatars/Alex.jpg' },
  { key: 'marj',   label: 'Marj',   color: COLORS.marj,   light: COLORS.marjLight,
    avatarUri: null },
];

// Person color map — includes all 6 calendars for dots in month/week views
const PERSON_COLOR = {
  maddie: COLORS.maddie,
  alex:   COLORS.alex,
  marj:   COLORS.marj,
  mum:    COLORS.kath,
  dad:    COLORS.adrian,
  family: COLORS.family,
};

// ─── static labels ─────────────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const WEEKDAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ─── helpers ─────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function makeDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function offsetDate(ds, days) {
  const d = new Date(ds + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return makeDateStr(d);
}

// Returns Monday of the week containing ds
function weekMonday(ds) {
  const d = new Date(ds + 'T12:00:00');
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return makeDateStr(d);
}

function getWeekDates(ds) {
  const mon = weekMonday(ds);
  return Array.from({ length: 7 }, (_, i) => offsetDate(mon, i));
}

// Returns 42-element array for 6-week Monday-first month grid
function getMonthGrid(year, month0) {
  const firstDay = new Date(year, month0, 1);
  const dow = firstDay.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  const start = new Date(year, month0, 1 + offset);
  // Show only enough complete weeks to cover all days of the month
  const lastDay = new Date(year, month0 + 1, 0);
  const cells = Math.ceil((Math.abs(offset) + lastDay.getDate()) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return makeDateStr(d);
  });
}

function formatHour(h) {
  if (h === 12) return '12pm';
  if (h === 0 || h === 24) return '12am';
  return h > 12 ? `${h-12}pm` : `${h}am`;
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    let h = d.getHours(), m = d.getMinutes();
    const ap = h >= 12 ? 'pm' : 'am';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return m === 0 ? `${h}${ap}` : `${h}:${pad(m)}${ap}`;
  } catch { return ''; }
}

function formatDateNav(ds) {
  const d = new Date(ds + 'T12:00:00');
  return d.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' });
}

function eventTop(isoStart) {
  if (!isoStart) return null;
  try {
    const d = new Date(isoStart);
    const h = d.getHours() + d.getMinutes() / 60;
    const top = (h - GRID_START) * HOUR_H;
    return (top >= 0 && top <= GRID_H) ? top : null;
  } catch { return null; }
}

function eventHeightPx(isoStart, isoEnd) {
  if (!isoStart || !isoEnd) return HOUR_H;
  try {
    const diff = (new Date(isoEnd) - new Date(isoStart)) / 3_600_000;
    return Math.max(20, diff * HOUR_H);
  } catch { return HOUR_H; }
}

function getTimeLinePct() {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < GRID_START || h > GRID_END) return -1;
  return (h - GRID_START) * HOUR_H;
}

function eventsOnDate(events, ds) {
  return events.filter(ev => {
    if (!ev.startTime) return false;
    try { return makeDateStr(new Date(ev.startTime)) === ds; } catch { return false; }
  });
}

// Parse "H:MM" or "HH:MM" time string; returns { h, m } or null
function parseTime(str) {
  const m = (str || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1]), min = parseInt(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

function toISO(dateStr, timeStr) {
  const t = parseTime(timeStr);
  if (!t) return null;
  return `${dateStr}T${pad(t.h)}:${pad(t.m)}:00+08:00`;
}

// ─── PersonAvatar ─────────────────────────────────────────────────────────────

function PersonAvatar({ person, size = 28 }) {
  const [err, setErr] = useState(false);
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (!person.avatarUri || err) {
    return (
      <View style={[style, { backgroundColor: person.color, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontFamily: FONTS.headingBold, fontSize: size * 0.4, color: '#fff' }}>
          {person.label[0]}
        </Text>
      </View>
    );
  }
  return <Image source={{ uri: person.avatarUri }} style={style} onError={() => setErr(true)} />;
}

// ─── TimelineGrid ─────────────────────────────────────────────────────────────
// Shared left-label + horizontal line column

function TimelineLabels() {
  return (
    <View style={{ width: TIMELINE_W, height: GRID_H, position: 'relative' }}>
      {GRID_HOURS.map((h, i) => (
        <Text key={h} style={[styles.hourLabel, { position: 'absolute', top: i === 0 ? 1 : i * HOUR_H - 5, right: 4 }]}>
          {formatHour(h)}
        </Text>
      ))}
      <Text style={[styles.hourLabel, { position: 'absolute', bottom: 3, right: 4 }]}>8pm</Text>
    </View>
  );
}

function GridLines({ colCount, colWidth }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {GRID_HOURS.map((_, i) => (
        <View key={i} style={[styles.gridLine, { top: i * HOUR_H }]} />
      ))}
      {/* half-hour marks */}
      {GRID_HOURS.map((_, i) => (
        <View key={`h${i}`} style={[styles.gridLineHalf, { top: i * HOUR_H + HOUR_H / 2 }]} />
      ))}
    </View>
  );
}

// ─── MonthView ────────────────────────────────────────────────────────────────

function MonthView({ events, year, month0, selectedDate, onSelectDate }) {
  const today = todayStr();
  const grid  = getMonthGrid(year, month0);

  // Group events by date for dot rendering
  const dotMap = {};
  for (const ev of events) {
    if (!ev.startTime && !ev.allDay) continue;
    let ds;
    try {
      ds = ev.allDay
        ? ev.startTime.slice(0, 10)
        : makeDateStr(new Date(ev.startTime));
    } catch { continue; }
    if (!dotMap[ds]) dotMap[ds] = [];
    const col = PERSON_COLOR[ev.person] || ev.color || '#ccc';
    if (!dotMap[ds].includes(col)) dotMap[ds].push(col);
  }

  const selectedEvents = selectedDate ? eventsOnDate(events, selectedDate) : [];

  return (
    <View>
      {/* Weekday headers */}
      <View style={styles.monthHeaderRow}>
        {WEEKDAY_SHORT.map(d => (
          <Text key={d} style={[styles.monthWeekdayLabel, { width: MONTH_CELL_W }]}>{d}</Text>
        ))}
      </View>

      {/* 6×7 grid */}
      <View style={styles.monthGrid}>
        {grid.map((ds, i) => {
          const d      = new Date(ds + 'T12:00:00');
          const inMonth = d.getMonth() === month0;
          const isToday = ds === today;
          const isSel   = ds === selectedDate;
          const dots    = dotMap[ds] || [];

          return (
            <TouchableOpacity
              key={i}
              style={[
                styles.monthCell,
                { width: MONTH_CELL_W, height: MONTH_CELL_H },
                isSel && styles.monthCellSelected,
              ]}
              onPress={() => onSelectDate(ds)}
              activeOpacity={0.7}
            >
              <View style={[styles.monthDateCircle, isToday && styles.monthDateToday]}>
                <Text style={[
                  styles.monthDateText,
                  !inMonth && styles.monthDateOtherMonth,
                  isToday  && styles.monthDateTodayText,
                  isSel && !isToday && styles.monthDateSelectedText,
                ]}>
                  {d.getDate()}
                </Text>
              </View>
              <View style={styles.monthDots}>
                {dots.slice(0, 4).map((col, j) => (
                  <View key={j} style={[styles.dot, { backgroundColor: col }]} />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Day detail panel */}
      {selectedDate && (
        <View style={styles.monthDetail}>
          <Text style={styles.monthDetailHeader}>
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-SG', {
              weekday: 'long', day: 'numeric', month: 'long'
            }).toUpperCase()}
          </Text>
          {selectedEvents.length === 0 ? (
            <Text style={styles.monthDetailEmpty}>No events</Text>
          ) : (
            selectedEvents.map(ev => (
              <View key={ev.id} style={[styles.monthEventRow, { borderLeftColor: ev.color || PERSON_COLOR[ev.person] || '#ccc' }]}>
                <View style={[styles.monthEventDot, { backgroundColor: ev.color || PERSON_COLOR[ev.person] || '#ccc' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.monthEventTitle} numberOfLines={1}>{ev.title}</Text>
                  <Text style={styles.monthEventTime}>
                    {ev.allDay ? 'All day' : `${formatTime(ev.startTime)}–${formatTime(ev.endTime)}`}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

// ─── WeekView ─────────────────────────────────────────────────────────────────

function WeekView({ events, weekDates }) {
  const today = todayStr();
  const tiTop = getTimeLinePct();
  const scrollRef = useRef(null);

  useEffect(() => {
    // Scroll to 8am on mount
    setTimeout(() => scrollRef.current?.scrollTo({ y: (8 - GRID_START) * HOUR_H, animated: false }), 100);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {/* Sticky day headers */}
      <View style={styles.weekHeaderRow}>
        <View style={{ width: TIMELINE_W }} />
        {weekDates.map(ds => {
          const d = new Date(ds + 'T12:00:00');
          const isToday = ds === today;
          return (
            <View key={ds} style={[styles.weekColHeader, { width: WEEK_COL_W }]}>
              <Text style={[styles.weekColDow, isToday && { color: COLORS.timeIndicator }]}>
                {WEEKDAY_SHORT[weekDates.indexOf(ds)]}
              </Text>
              <View style={[styles.weekColDateCircle, isToday && styles.weekColDateToday]}>
                <Text style={[styles.weekColDate, isToday && styles.weekColDateTodayText]}>
                  {d.getDate()}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: GRID_H, flexDirection: 'row', paddingHorizontal: H_PAD }}>
          <TimelineLabels />

          {/* 7 day columns */}
          <View style={{ flex: 1, flexDirection: 'row', position: 'relative' }}>
            <GridLines />
            {weekDates.map((ds, colIdx) => {
              const dayEvents = eventsOnDate(events, ds).filter(ev => !ev.allDay);
              return (
                <View key={ds} style={{ width: WEEK_COL_W, position: 'relative', borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: COLORS.border }}>
                  {dayEvents.map(ev => {
                    const top = eventTop(ev.startTime);
                    if (top === null) return null;
                    const h = Math.min(eventHeightPx(ev.startTime, ev.endTime), GRID_H - top);
                    const col = ev.color || PERSON_COLOR[ev.person] || '#ccc';
                    return (
                      <View key={ev.id} style={[styles.weekEvent, { top, height: h, backgroundColor: col + '22', borderLeftColor: col }]}>
                        <Text style={[styles.weekEventText, { color: col }]} numberOfLines={2}>
                          {ev.title}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}

            {/* Time indicator */}
            {tiTop >= 0 && (
              <View style={[styles.timeIndicatorLine, { top: tiTop }]} pointerEvents="none">
                <View style={styles.timeIndicatorDot} />
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── DayView ──────────────────────────────────────────────────────────────────

function DayView({ events, dateStr }) {
  const today  = todayStr();
  const isToday = dateStr === today;
  const tiTop  = isToday ? getTimeLinePct() : -1;
  const scrollRef = useRef(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: (8 - GRID_START) * HOUR_H, animated: false }), 100);
  }, [dateStr]);

  return (
    <View style={{ flex: 1 }}>
      {/* Column headers */}
      <View style={styles.dayHeaderRow}>
        <View style={{ width: TIMELINE_W }} />
        {PERSONS.map(p => (
          <View key={p.key} style={[styles.dayColHeader, { width: DAY_COL_W, backgroundColor: p.light }]}>
            <PersonAvatar person={p} size={26} />
            <Text style={[styles.dayColName, { color: p.color }]}>{p.label.toUpperCase()}</Text>
          </View>
        ))}
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: GRID_H, flexDirection: 'row', paddingHorizontal: H_PAD }}>
          <TimelineLabels />

          {/* 3 person columns */}
          <View style={{ flex: 1, flexDirection: 'row', position: 'relative' }}>
            <GridLines />
            {PERSONS.map(p => {
              const col = events.filter(
                ev => ev.person === p.key && !ev.allDay && makeDateStr(new Date(ev.startTime)) === dateStr
              );
              return (
                <View key={p.key} style={{ width: DAY_COL_W, position: 'relative', borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: COLORS.border }}>
                  {col.map(ev => {
                    const top = eventTop(ev.startTime);
                    if (top === null) return null;
                    const h = Math.min(eventHeightPx(ev.startTime, ev.endTime), GRID_H - top);
                    return (
                      <View key={ev.id} style={[
                        styles.dayEvent,
                        { top, height: h, backgroundColor: p.light, borderLeftColor: p.color },
                      ]}>
                        <Text style={[styles.dayEventTime, { color: p.color }]} numberOfLines={1}>
                          {formatTime(ev.startTime)}
                        </Text>
                        {h > 24 && (
                          <Text style={[styles.dayEventTitle, { color: p.color }]} numberOfLines={2}>
                            {ev.title}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}

            {/* Time indicator */}
            {tiTop >= 0 && (
              <View style={[styles.timeIndicatorLine, { top: tiTop }]} pointerEvents="none">
                <View style={styles.timeIndicatorDot} />
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── AddEventSheet ────────────────────────────────────────────────────────────

function AddEventSheet({ visible, defaultDate, onClose, onSaved }) {
  const insets = useSafeAreaInsets();
  const [title,     setTitle]     = useState('');
  const [date,      setDate]      = useState(defaultDate || todayStr());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime,   setEndTime]   = useState('10:00');
  const [persons,   setPersons]   = useState(['maddie']);
  const [location,  setLocation]  = useState('');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  // Reset when opened
  useEffect(() => {
    if (visible) {
      setTitle(''); setDate(defaultDate || todayStr()); setStartTime('09:00');
      setEndTime('10:00'); setPersons(['maddie']); setLocation(''); setError('');
    }
  }, [visible, defaultDate]);

  function togglePerson(key) {
    setPersons(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  async function handleSave() {
    if (!title.trim())        return setError('Title is required');
    if (persons.length === 0) return setError('Select at least one person');
    const startISO = toISO(date, startTime);
    const endISO   = toISO(date, endTime);
    if (!startISO) return setError('Invalid start time — use HH:MM (e.g. 09:00)');
    if (!endISO)   return setError('Invalid end time — use HH:MM (e.g. 10:00)');
    const sMin = parseTime(startTime), eMin = parseTime(endTime);
    if (sMin && eMin && (eMin.h * 60 + eMin.m) <= (sMin.h * 60 + sMin.m)) {
      return setError('End time must be after start time');
    }

    setSaving(true);
    setError('');
    try {
      await createCalendarEvent({ persons, title: title.trim(), startISO, endISO, location: location.trim() });
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to save event');
    } finally {
      setSaving(false);
    }
  }

  const PERSON_OPTS = [
    { key: 'maddie', label: 'Maddie', color: COLORS.maddie },
    { key: 'alex',   label: 'Alex',   color: COLORS.alex   },
    { key: 'marj',   label: 'Marj',   color: COLORS.marj   },
    { key: 'family', label: 'Family', color: COLORS.family  },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: COLORS.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={[styles.sheetHeader, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={styles.sheetCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>ADD EVENT</Text>
          <View style={{ width: 56 }} />
        </View>

        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          {/* Title */}
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

          {/* Date */}
          <Text style={styles.fieldLabel}>DATE</Text>
          <View style={styles.dateRow}>
            <TouchableOpacity style={styles.navBtn} onPress={() => setDate(d => offsetDate(d, -1))}>
              <Text style={styles.navArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.dateLabel}>
              {new Date(date + 'T12:00:00').toLocaleDateString('en-SG', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
              })}
            </Text>
            <TouchableOpacity style={styles.navBtn} onPress={() => setDate(d => offsetDate(d, 1))}>
              <Text style={styles.navArrow}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Times */}
          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>START</Text>
              <TextInput
                style={styles.textInputSm}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="09:00"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <Text style={styles.timeSep}>→</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>END</Text>
              <TextInput
                style={styles.textInputSm}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="10:00"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          {/* Persons */}
          <Text style={styles.fieldLabel}>FOR</Text>
          <View style={styles.personPickerRow}>
            {PERSON_OPTS.map(p => {
              const sel = persons.includes(p.key);
              return (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.personChip, sel && { backgroundColor: p.color, borderColor: p.color }]}
                  onPress={() => togglePerson(p.key)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.personChipText, sel && { color: '#fff' }]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Location */}
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

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>ADD EVENT</Text>
            }
          </TouchableOpacity>

          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── CalendarTab ──────────────────────────────────────────────────────────────

export default function CalendarTab() {
  const insets = useSafeAreaInsets();

  const [view,         setView]         = useState('day');
  const [selectedDate, setSelectedDate] = useState(() => todayStr());
  const [events,       setEvents]       = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [refreshing,   setRefreshing]   = useState(false);
  const [showAdd,      setShowAdd]      = useState(false);

  const today     = todayStr();
  const dateObj   = new Date(selectedDate + 'T12:00:00');
  const selYear   = dateObj.getFullYear();
  const selMonth0 = dateObj.getMonth(); // 0-indexed
  const weekDates = getWeekDates(selectedDate);

  // Compute fetch range for current view
  function fetchRange() {
    if (view === 'day') {
      return { start: selectedDate, end: selectedDate };
    }
    if (view === 'week') {
      return { start: weekDates[0], end: weekDates[6] };
    }
    // month: first day of month → last day
    const last = new Date(selYear, selMonth0 + 1, 0);
    return {
      start: `${selYear}-${pad(selMonth0 + 1)}-01`,
      end:   makeDateStr(last),
    };
  }

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const { start, end } = fetchRange();
      const data = await fetchCalendarEventsForRange(start, end);
      setEvents(data);
    } catch (e) {
      console.warn('Calendar fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedDate]);

  useEffect(() => { load(); }, [load]);

  function onRefresh() { setRefreshing(true); invalidateCalendarCache(); load(true); }

  // ── Navigation helpers ──────────────────────────────────────────────────────

  function navPrev() {
    if (view === 'day')   setSelectedDate(d => offsetDate(d, -1));
    if (view === 'week')  setSelectedDate(d => offsetDate(d, -7));
    if (view === 'month') {
      const d = new Date(selYear, selMonth0 - 1, 1);
      setSelectedDate(makeDateStr(d));
    }
  }

  function navNext() {
    if (view === 'day')   setSelectedDate(d => offsetDate(d, 1));
    if (view === 'week')  setSelectedDate(d => offsetDate(d, 7));
    if (view === 'month') {
      const d = new Date(selYear, selMonth0 + 1, 1);
      setSelectedDate(makeDateStr(d));
    }
  }

  function navLabel() {
    if (view === 'day') return formatDateNav(selectedDate);
    if (view === 'week') {
      const fmt = ds => new Date(ds + 'T12:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'long' });
      return `${fmt(weekDates[0])} – ${fmt(weekDates[6])}`;
    }
    return `${MONTH_NAMES[selMonth0]} ${selYear}`;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>

      {/* ── View switcher ── */}
      <View style={styles.viewSwitcher}>
        {['day', 'week', 'month'].map(v => (
          <TouchableOpacity
            key={v}
            style={[styles.switcherTab, view === v && styles.switcherTabActive]}
            onPress={() => setView(v)}
            activeOpacity={0.75}
          >
            <Text style={[styles.switcherLabel, view === v && styles.switcherLabelActive]}>
              {v.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Date nav ── */}
      <View style={styles.dateNav}>
        <TouchableOpacity style={styles.navBtn} onPress={navPrev}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
          <Text style={styles.navLabel}>{navLabel()}</Text>
          {loading && !refreshing && (
            <ActivityIndicator size="small" color={COLORS.timeIndicator} style={{ marginLeft: 6 }} />
          )}
        </View>
        <TouchableOpacity style={styles.navBtn} onPress={navNext}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── Content ── */}
      {view === 'month' && (
        <ScrollView
          style={{ flex: 1, paddingHorizontal: H_PAD }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.timeIndicator} />}
          showsVerticalScrollIndicator={false}
        >
          <MonthView
            events={events}
            year={selYear}
            month0={selMonth0}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {view === 'week' && (
        <View style={{ flex: 1 }}>
          <WeekView events={events} weekDates={weekDates} />
        </View>
      )}

      {view === 'day' && (
        <View style={{ flex: 1 }}>
          <DayView events={events} dateStr={selectedDate} />
        </View>
      )}

      {/* ── FAB ── */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => setShowAdd(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <AddEventSheet
        visible={showAdd}
        defaultDate={selectedDate}
        onClose={() => setShowAdd(false)}
        onSaved={() => { invalidateCalendarCache(); load(); }}
      />
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── view switcher ──
  viewSwitcher: {
    flexDirection: 'row',
    marginHorizontal: H_PAD,
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 3,
  },
  switcherTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  switcherTabActive: {
    backgroundColor: COLORS.background,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  switcherLabel: {
    fontFamily: FONTS.heading,
    fontSize: 11,
    letterSpacing: 1,
    color: COLORS.textSecondary,
  },
  switcherLabelActive: {
    color: COLORS.text,
  },

  // ── date nav ──
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: 8,
    height: 40,
  },
  navBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrow: {
    fontFamily: FONTS.body,
    fontSize: 22,
    color: COLORS.text,
    lineHeight: 26,
  },
  navLabel: {
    fontFamily: FONTS.heading,
    fontSize: 12,
    letterSpacing: 0.5,
    color: COLORS.text,
  },

  // ── timeline ──
  hourLabel: {
    fontFamily: FONTS.body,
    fontSize: 10,
    color: COLORS.textSecondary,
    textAlign: 'right',
    paddingRight: 6,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
  },
  gridLineHalf: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    opacity: 0.4,
  },
  timeIndicatorLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: COLORS.timeIndicator,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeIndicatorDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.timeIndicator,
    marginLeft: -3.5,
  },

  // ── month view ──
  monthHeaderRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  monthWeekdayLabel: {
    fontFamily: FONTS.heading,
    fontSize: 11,
    letterSpacing: 0.5,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthCell: {
    alignItems: 'center',
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  monthCellSelected: {
    backgroundColor: COLORS.surface,
  },
  monthDateCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthDateToday: {
    backgroundColor: COLORS.timeIndicator,
  },
  monthDateText: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 13,
    color: COLORS.text,
  },
  monthDateOtherMonth: {
    color: COLORS.border,
  },
  monthDateTodayText: {
    color: '#fff',
    fontFamily: FONTS.headingBold,
  },
  monthDateSelectedText: {
    color: COLORS.text,
    fontFamily: FONTS.headingBold,
  },
  monthDots: {
    flexDirection: 'row',
    marginTop: 3,
    gap: 2,
    height: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  monthDetail: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  monthDetailHeader: {
    fontFamily: FONTS.heading,
    fontSize: 11,
    letterSpacing: 1.5,
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  monthDetailEmpty: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.textSecondary,
    paddingVertical: 8,
  },
  monthEventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 7,
    paddingLeft: 10,
    borderLeftWidth: 3,
    marginBottom: 4,
    backgroundColor: COLORS.surface,
    borderRadius: 4,
  },
  monthEventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 3,
    marginRight: 8,
  },
  monthEventTitle: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 14,
    color: COLORS.text,
  },
  monthEventTime: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },

  // ── week view ──
  weekHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    paddingBottom: 6,
  },
  weekColHeader: {
    alignItems: 'center',
    paddingTop: 4,
  },
  weekColDow: {
    fontFamily: FONTS.heading,
    fontSize: 10,
    letterSpacing: 0.5,
    color: COLORS.textSecondary,
  },
  weekColDateCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  weekColDateToday: {
    backgroundColor: COLORS.timeIndicator,
  },
  weekColDate: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 12,
    color: COLORS.text,
  },
  weekColDateTodayText: {
    color: '#fff',
    fontFamily: FONTS.headingBold,
  },
  weekEvent: {
    position: 'absolute',
    left: 1,
    right: 1,
    borderLeftWidth: 2,
    borderRadius: 3,
    paddingHorizontal: 2,
    paddingTop: 2,
    overflow: 'hidden',
  },
  weekEventText: {
    fontFamily: FONTS.body,
    fontSize: 9,
    lineHeight: 11,
  },

  // ── day view ──
  dayHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    paddingBottom: 6,
    paddingTop: 4,
  },
  dayColHeader: {
    alignItems: 'center',
    paddingVertical: 6,
    gap: 4,
    borderRadius: 6,
    marginHorizontal: 1,
  },
  dayColName: {
    fontFamily: FONTS.heading,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  dayEvent: {
    position: 'absolute',
    left: 1,
    right: 1,
    borderLeftWidth: 2.5,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingTop: 3,
    overflow: 'hidden',
  },
  dayEventTime: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 9,
    lineHeight: 12,
  },
  dayEventTitle: {
    fontFamily: FONTS.body,
    fontSize: 10,
    lineHeight: 13,
    marginTop: 1,
  },

  // ── FAB ──
  fab: {
    position: 'absolute',
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.timeIndicator,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 32,
    fontFamily: FONTS.body,
    marginTop: -2,
  },

  // ── Add Event sheet ──
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  sheetCancel: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  sheetTitle: {
    fontFamily: FONTS.headingBold,
    fontSize: 14,
    letterSpacing: 1.5,
    color: COLORS.text,
  },
  sheetBody: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  fieldLabel: {
    fontFamily: FONTS.heading,
    fontSize: 11,
    letterSpacing: 1,
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 16,
  },
  optional: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.textSecondary,
    letterSpacing: 0,
    textTransform: 'none',
  },
  textInput: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
  },
  textInputSm: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    textAlign: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
  },
  dateLabel: {
    flex: 1,
    fontFamily: FONTS.bodyMedium,
    fontSize: 15,
    color: COLORS.text,
    textAlign: 'center',
    paddingVertical: 12,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  timeSep: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.textSecondary,
    paddingBottom: 14,
  },
  personPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  personChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  personChipText: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 14,
    color: COLORS.text,
  },
  errorText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: '#C0392B',
    marginTop: 12,
    textAlign: 'center',
  },
  saveBtn: {
    marginTop: 24,
    backgroundColor: COLORS.timeIndicator,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: FONTS.headingBold,
    fontSize: 14,
    letterSpacing: 1.5,
    color: '#fff',
  },
});
