import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ActionSheetIOS, Image, Dimensions, Pressable,
  RefreshControl, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../theme';
import { fetchCalendarEventsForRange, invalidateCalendarCache } from '../services/calendarService';
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '../services/calendarWriteService';

// ─── layout constants ─────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD      = 12;
const TIMELINE_W = 40;
const HOUR_H     = 30;
const GRID_START = 6;
const GRID_END   = 20;
const GRID_HOURS = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);
const GRID_H     = GRID_HOURS.length * HOUR_H;

const CONTENT_W    = SCREEN_W - 2 * H_PAD;
const MONTH_CELL_W = Math.floor(CONTENT_W / 7);
const MONTH_CELL_H = 58;
const WEEK_COL_W   = Math.floor((CONTENT_W - TIMELINE_W) / 7);
const DAY_COL_W    = Math.floor((CONTENT_W - TIMELINE_W) / 3);

// ─── people ───────────────────────────────────────────────────────────────────

const PERSONS = [
  { key: 'maddie', label: 'Maddie', color: COLORS.maddie, light: COLORS.maddieLight,
    avatarUri: 'https://yap-family-home.vercel.app/avatars/Maddie.jpg' },
  { key: 'alex',   label: 'Alex',   color: COLORS.alex,   light: COLORS.alexLight,
    avatarUri: 'https://yap-family-home.vercel.app/avatars/Alex.jpg' },
  { key: 'marj',   label: 'Marj',   color: COLORS.marj,   light: COLORS.marjLight,
    avatarUri: null },
];

const PERSON_COLOR = {
  maddie: COLORS.maddie,
  alex:   COLORS.alex,
  marj:   COLORS.marj,
  mum:    COLORS.kath,
  dad:    COLORS.adrian,
  family: COLORS.family,
};

const PERSON_LIGHT = {
  maddie: COLORS.maddieLight,
  alex:   COLORS.alexLight,
  marj:   COLORS.marjLight,
  mum:    '#F5EBE9',
  dad:    '#E8EEF4',
  family: '#EDE8E3',
};

// ─── static labels ────────────────────────────────────────────────────────────

const MONTH_NAMES   = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
const WEEKDAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// Same ids/convention as TasksTab.js's recurring day picker.
const WEEKDAYS = [
  { id: 'mon', label: 'Mo' }, { id: 'tue', label: 'Tu' },
  { id: 'wed', label: 'We' }, { id: 'thu', label: 'Th' },
  { id: 'fri', label: 'Fr' }, { id: 'sat', label: 'Sa' },
  { id: 'sun', label: 'Su' },
];

// ─── pure helpers ─────────────────────────────────────────────────────────────

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

function weekMonday(ds) {
  const d = new Date(ds + 'T12:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return makeDateStr(d);
}

function getWeekDates(ds) {
  const mon = weekMonday(ds);
  return Array.from({ length: 7 }, (_, i) => offsetDate(mon, i));
}

function getMonthGrid(year, month0) {
  const firstDay = new Date(year, month0, 1);
  const dow = firstDay.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  const start = new Date(year, month0, 1 + offset);
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

// ─── time-picker / overlap helpers ────────────────────────────────────────────

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

function extractTime(iso) {
  if (!iso) return '09:00';
  try {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return '09:00'; }
}

// Splits overlapping events into side-by-side columns.
// Returns events with _col (0-based) and _totalCols added.
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
      if (colEnds[ci] <= start) {
        colEnds[ci] = end;
        ev._col = ci;
        placed = true;
        break;
      }
    }
    if (!placed) { ev._col = colEnds.length; colEnds.push(end); }
  }

  // Union-find to assign _totalCols per overlap cluster
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
    const g = find(i);
    clusterMax[g] = Math.max(clusterMax[g] ?? 0, result[i]._col);
  }
  for (let i = 0; i < n; i++) {
    result[i]._totalCols = clusterMax[find(i)] + 1;
  }

  return result;
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

// ─── TimelineLabels ───────────────────────────────────────────────────────────

const TIMELINE_HOURS = [...GRID_HOURS, GRID_END];

function TimelineLabels() {
  return (
    <View style={{ width: TIMELINE_W, height: GRID_H, position: 'relative', overflow: 'visible' }}>
      {TIMELINE_HOURS.map((h, i) => (
        <Text key={h} style={[styles.hourLabel, { position: 'absolute', top: i * HOUR_H - 6, right: 4 }]}>
          {formatHour(h)}
        </Text>
      ))}
    </View>
  );
}

// ─── GridLines ────────────────────────────────────────────────────────────────

function GridLines() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {TIMELINE_HOURS.map((_, i) => (
        <View key={i} style={[styles.gridLine, { top: i * HOUR_H }]} />
      ))}
      {GRID_HOURS.map((_, i) => (
        <View key={`h${i}`} style={[styles.gridLineHalf, { top: i * HOUR_H + HOUR_H / 2 }]} />
      ))}
    </View>
  );
}

// ─── MonthView ────────────────────────────────────────────────────────────────

function MonthView({ events, year, month0, selectedDate, onSelectDate, onEventPress }) {
  const today = todayStr();
  const grid  = getMonthGrid(year, month0);

  const dotMap = {};
  for (const ev of events) {
    if (!ev.startTime && !ev.allDay) continue;
    let ds;
    try {
      ds = ev.allDay ? ev.startTime.slice(0, 10) : makeDateStr(new Date(ev.startTime));
    } catch { continue; }
    if (!dotMap[ds]) dotMap[ds] = [];
    const col = PERSON_COLOR[ev.person] || ev.color || '#ccc';
    if (!dotMap[ds].includes(col)) dotMap[ds].push(col);
  }

  const selectedEvents = selectedDate ? eventsOnDate(events, selectedDate) : [];

  return (
    <View>
      <View style={styles.monthHeaderRow}>
        {WEEKDAY_SHORT.map(d => (
          <Text key={d} style={[styles.monthWeekdayLabel, { width: MONTH_CELL_W }]}>{d}</Text>
        ))}
      </View>

      <View style={styles.monthGrid}>
        {grid.map((ds, i) => {
          const d       = new Date(ds + 'T12:00:00');
          const inMonth = d.getMonth() === month0;
          const isToday = ds === today;
          const isSel   = ds === selectedDate;
          const dots    = dotMap[ds] || [];

          return (
            <TouchableOpacity
              key={i}
              style={[styles.monthCell, { width: MONTH_CELL_W, height: MONTH_CELL_H }, isSel && styles.monthCellSelected]}
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
              <TouchableOpacity
                key={ev.id}
                style={[styles.monthEventRow, { borderLeftColor: ev.color || PERSON_COLOR[ev.person] || '#ccc' }]}
                onPress={() => onEventPress?.(ev)}
                activeOpacity={0.75}
              >
                <View style={[styles.monthEventDot, { backgroundColor: ev.color || PERSON_COLOR[ev.person] || '#ccc' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.monthEventTitle} numberOfLines={1}>{ev.title}</Text>
                  <Text style={styles.monthEventTime}>
                    {ev.allDay ? 'All day' : `${formatTime(ev.startTime)}–${formatTime(ev.endTime)}`}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </View>
  );
}

// ─── WeekView ─────────────────────────────────────────────────────────────────

function WeekView({ events, weekDates, onEventPress, onRefresh, refreshing }) {
  const today    = todayStr();
  const tiTop    = getTimeLinePct();
  const scrollRef = useRef(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: (8 - GRID_START) * HOUR_H, animated: false }), 100);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.weekHeaderRow}>
        <View style={{ width: TIMELINE_W }} />
        {weekDates.map((ds, i) => {
          const d = new Date(ds + 'T12:00:00');
          const isToday = ds === today;
          return (
            <View key={ds} style={[styles.weekColHeader, { width: WEEK_COL_W }]}>
              <Text style={[styles.weekColDow, isToday && { color: COLORS.timeIndicator }]}>
                {WEEKDAY_SHORT[i]}
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

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing || false} onRefresh={onRefresh} tintColor={COLORS.timeIndicator} />
        }
      >
        <View style={{ height: GRID_H, flexDirection: 'row', paddingHorizontal: H_PAD, overflow: 'visible' }}>
          <TimelineLabels />

          <View style={{ flex: 1, flexDirection: 'row', position: 'relative' }}>
            <GridLines />
            {weekDates.map(ds => {
              const dayEvents = eventsOnDate(events, ds).filter(ev => !ev.allDay);
              return (
                <View key={ds} style={{ width: WEEK_COL_W, position: 'relative', borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: COLORS.border }}>
                  {dayEvents.map(ev => {
                    const top = eventTop(ev.startTime);
                    if (top === null) return null;
                    const h   = Math.min(eventHeightPx(ev.startTime, ev.endTime), GRID_H - top);
                    const col = ev.color || PERSON_COLOR[ev.person] || '#ccc';
                    const bg  = PERSON_LIGHT[ev.person] || col + '22';
                    return (
                      <TouchableOpacity
                        key={ev.id}
                        style={[styles.weekEvent, { top, height: h, backgroundColor: bg, borderLeftColor: col }]}
                        onPress={() => onEventPress?.(ev)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.weekEventText, { color: col }]} numberOfLines={2}>
                          {ev.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}

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

function DayView({ events, dateStr, onEventPress, onRefresh, refreshing }) {
  const today   = todayStr();
  const isToday = dateStr === today;
  const tiTop   = isToday ? getTimeLinePct() : -1;
  const scrollRef = useRef(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 100);
  }, [dateStr]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.dayHeaderRow}>
        <View style={{ width: TIMELINE_W }} />
        {PERSONS.map(p => (
          <View key={p.key} style={[styles.dayColHeader, { flex: 1, backgroundColor: p.light }]}>
            <PersonAvatar person={p} size={26} />
            <Text style={[styles.dayColName, { color: p.color }]}>{p.label.toUpperCase()}</Text>
          </View>
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing || false} onRefresh={onRefresh} tintColor={COLORS.timeIndicator} />
        }
      >
        <View style={{ height: GRID_H, flexDirection: 'row', paddingHorizontal: H_PAD, overflow: 'visible' }}>
          <TimelineLabels />

          <View style={{ flex: 1, flexDirection: 'row', position: 'relative' }}>
            <GridLines />
            {PERSONS.map(p => {
              const col  = events.filter(
                ev => ev.person === p.key && !ev.allDay &&
                      makeDateStr(new Date(ev.startTime)) === dateStr
              );
              const laid = layoutOverlappingEvents(col);
              return (
                <View key={p.key} style={{ width: DAY_COL_W, position: 'relative', borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: COLORS.border }}>
                  {laid.map(ev => {
                    const top = eventTop(ev.startTime);
                    if (top === null) return null;
                    const h = Math.min(eventHeightPx(ev.startTime, ev.endTime), GRID_H - top);
                    const leftVal  = ev._totalCols > 1 ? `${(ev._col / ev._totalCols * 100) + 0.5}%` : 1;
                    const rightVal = ev._totalCols > 1 ? `${((ev._totalCols - ev._col - 1) / ev._totalCols * 100) + 0.5}%` : 1;
                    return (
                      <TouchableOpacity
                        key={ev.id}
                        style={[
                          styles.dayEvent,
                          { top, height: h, backgroundColor: p.light, borderLeftColor: p.color, left: leftVal, right: rightVal },
                        ]}
                        onPress={() => onEventPress?.(ev)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.dayEventTitle, { color: p.color }]} numberOfLines={1}>
                          {ev.title}
                        </Text>
                        {h > 24 && ev.location ? (
                          <Text style={[styles.dayEventTime, { color: p.color }]} numberOfLines={1}>
                            {ev.location}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}

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

// ─── TimePicker ───────────────────────────────────────────────────────────────

// Custom-time entry: separate hour/minute/AM-PM fields rather than a single
// free-text box, so there's no ambiguity between 12-hour and 24-hour input -
// matches the 12-hour display the scroll list already uses.
function CustomTimeEntry({ value, onSet }) {
  const parsed = (() => {
    const [h, m] = (value || '09:00').split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return { h12: String(h12), m: String(m).padStart(2, '0'), ampm };
  })();
  const [hourStr, setHourStr]   = useState(parsed.h12);
  const [minStr, setMinStr]     = useState(parsed.m);
  const [ampm, setAmpm]         = useState(parsed.ampm);

  function submit() {
    const h12 = parseInt(hourStr, 10);
    const min = parseInt(minStr, 10);
    if (!h12 || h12 < 1 || h12 > 12 || isNaN(min) || min < 0 || min > 59) return;
    let h24 = h12 % 12;
    if (ampm === 'PM') h24 += 12;
    onSet(`${String(h24).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }

  return (
    <View style={styles.tpCustomWrap}>
      <View style={styles.tpCustomRow}>
        <TextInput
          style={styles.tpCustomInput}
          value={hourStr}
          onChangeText={setHourStr}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="9"
          placeholderTextColor={COLORS.textSecondary}
        />
        <Text style={styles.tpCustomColon}>:</Text>
        <TextInput
          style={styles.tpCustomInput}
          value={minStr}
          onChangeText={setMinStr}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="45"
          placeholderTextColor={COLORS.textSecondary}
        />
        <View style={styles.tpAmPmCol}>
          <TouchableOpacity
            style={[styles.tpAmPmBtn, ampm === 'AM' && styles.tpAmPmBtnActive]}
            onPress={() => setAmpm('AM')}
          >
            <Text style={[styles.tpAmPmText, ampm === 'AM' && styles.tpAmPmTextActive]}>AM</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tpAmPmBtn, ampm === 'PM' && styles.tpAmPmBtnActive]}
            onPress={() => setAmpm('PM')}
          >
            <Text style={[styles.tpAmPmText, ampm === 'PM' && styles.tpAmPmTextActive]}>PM</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity style={styles.tpCustomSetBtn} onPress={submit} activeOpacity={0.75}>
        <Text style={styles.tpCustomSetText}>Set time</Text>
      </TouchableOpacity>
    </View>
  );
}

function TimePicker({ value, onChange }) {
  const [open, setOpen]   = useState(false);
  const [custom, setCustom] = useState(false);
  const flatRef           = useRef(null);
  const idx               = TIME_SLOTS.indexOf(value);

  useEffect(() => {
    if (open && !custom && idx >= 0) {
      const t = setTimeout(() => {
        try {
          flatRef.current?.scrollToIndex({ index: Math.max(0, idx - 2), animated: false });
        } catch {}
      }, 80);
      return () => clearTimeout(t);
    }
  }, [open, custom]);

  return (
    <>
      <TouchableOpacity style={styles.tpBtn} onPress={() => { setCustom(false); setOpen(true); }} activeOpacity={0.75}>
        <Text style={styles.tpBtnText}>{display12(value)}</Text>
        <Text style={styles.tpChevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.tpOverlay} onPress={() => setOpen(false)}>
          <View style={styles.tpDropdown}>
            {custom ? (
              <CustomTimeEntry value={value} onSet={t => { onChange(t); setOpen(false); }} />
            ) : (
              <FlatList
                ref={flatRef}
                data={TIME_SLOTS}
                keyExtractor={t => t}
                showsVerticalScrollIndicator={true}
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
            )}
            <TouchableOpacity style={styles.tpCustomToggle} onPress={() => setCustom(c => !c)} activeOpacity={0.7}>
              <Text style={styles.tpCustomToggleText}>{custom ? '‹ Choose from list' : 'Enter a custom time…'}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── MiniCalendarGrid ─────────────────────────────────────────────────────────
// The dropdown portion shared by DatePicker and EndDatePicker below: month-nav
// row + weekday header + day grid. Reuses MonthView's grid helpers and
// "today"/"selected" colours (COLORS.timeIndicator / COLORS.family) instead of
// inventing a second calendar look.
//
// Cell widths are percentage-based (100/7), NOT the MONTH_CELL_W constant
// MonthView uses — that constant is sized for MonthView's own unpadded
// container, but this grid renders inside calPanel's own horizontal padding,
// so a pixel width computed against the wrong container came up short by one
// column's worth per row: confirmed live, "Su" wrapped under "Mo" because 7
// MONTH_CELL_W-wide cells didn't fit inside the narrower padded area. Percentage
// widths always sum to exactly 100% of whatever container they're actually in,
// so this can't happen regardless of surrounding padding.
function MiniCalendarGrid({ viewYear, viewMonth0, selectedValue, onSelectDay, onPrevMonth, onNextMonth }) {
  const today = todayStr();
  const grid = getMonthGrid(viewYear, viewMonth0);
  const monthLabel = new Date(viewYear, viewMonth0, 1)
    .toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })
    .toUpperCase();

  return (
    <>
      <View style={styles.calMonthRow}>
        <TouchableOpacity onPress={onPrevMonth} hitSlop={10}>
          <Text style={styles.calArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.calMonthLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={onNextMonth} hitSlop={10}>
          <Text style={styles.calArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.calGrid}>
        {WEEKDAY_SHORT.map(d => (
          <Text key={d} style={styles.calWeekday}>{d.slice(0, 2)}</Text>
        ))}
        {grid.map((ds, i) => {
          const d       = new Date(ds + 'T12:00:00');
          const inMonth = d.getMonth() === viewMonth0;
          const isToday = ds === today;
          const isSel   = ds === selectedValue;
          return (
            <TouchableOpacity
              key={i}
              style={styles.calDayCell}
              onPress={() => onSelectDay(ds)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.calDayCircle,
                isToday && styles.calDayToday,
                isSel && !isToday && styles.calDaySelected,
              ]}>
                <Text style={[
                  styles.calDayText,
                  !inMonth && styles.calDayOtherMonth,
                  (isToday || isSel) && styles.calDayTextOnColor,
                ]}>
                  {d.getDate()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

// Shared month-navigation state for both pickers below.
function useCalendarNav(initialValue) {
  const initial = initialValue ? new Date(initialValue + 'T12:00:00') : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth0, setViewMonth0] = useState(initial.getMonth());

  function changeMonth(delta) {
    let y = viewYear, m = viewMonth0 + delta;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewYear(y);
    setViewMonth0(m);
  }

  return { viewYear, viewMonth0, changeMonth };
}

// ─── DatePicker ───────────────────────────────────────────────────────────────
// The required event DATE field. Keeps the existing ‹ date › row (arrows still
// step ±1 day, unchanged) but tapping the date text itself now also expands
// the same inline calendar EndDatePicker uses, so an arbitrary date doesn't
// need N taps of the day-arrow to reach.
function DatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const { viewYear, viewMonth0, changeMonth } = useCalendarNav(value);

  return (
    <View>
      <View style={styles.dateRow}>
        <TouchableOpacity style={styles.navBtn} onPress={() => onChange(d => offsetDate(d, -1))}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
          <Text style={styles.dateLabel}>
            {new Date(value + 'T12:00:00').toLocaleDateString('en-SG', {
              weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
            })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => onChange(d => offsetDate(d, 1))}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {open && (
        <View style={styles.calPanel}>
          <MiniCalendarGrid
            viewYear={viewYear}
            viewMonth0={viewMonth0}
            selectedValue={value}
            onSelectDay={ds => { onChange(ds); setOpen(false); }}
            onPrevMonth={() => changeMonth(-1)}
            onNextMonth={() => changeMonth(1)}
          />
        </View>
      )}
    </View>
  );
}

// ─── EndDatePicker ────────────────────────────────────────────────────────────
// Tap-to-expand inline calendar for the recurring-event end date, replacing a
// typed YYYY-MM-DD field.
function EndDatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const { viewYear, viewMonth0, changeMonth } = useCalendarNav(value);

  return (
    <View>
      <TouchableOpacity
        style={[styles.enddateField, open && styles.enddateFieldOpen]}
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.7}
      >
        <Text style={[styles.enddateValue, !!value && styles.enddateValueSet]}>
          {value
            ? new Date(value + 'T12:00:00').toLocaleDateString('en-SG', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
              })
            : 'Add end date'}
        </Text>
        <Text style={styles.enddateChevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={styles.calPanel}>
          <MiniCalendarGrid
            viewYear={viewYear}
            viewMonth0={viewMonth0}
            selectedValue={value}
            onSelectDay={ds => { onChange(ds); setOpen(false); }}
            onPrevMonth={() => changeMonth(-1)}
            onNextMonth={() => changeMonth(1)}
          />
          <View style={styles.calFooter}>
            <TouchableOpacity onPress={() => { onChange(''); setOpen(false); }} disabled={!value}>
              <Text style={[styles.calClear, !value && styles.calClearDisabled]}>Clear end date</Text>
            </TouchableOpacity>
            <Text style={styles.calHint}>tap a date to set it</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── EventSheet ───────────────────────────────────────────────────────────────
// mode='add': create new event
// mode='edit': edit/delete existing event (pass event prop)

function EventSheet({ visible, mode, event, defaultDate, onClose, onSaved, onDeleted }) {
  const insets = useSafeAreaInsets();
  const [title,     setTitle]     = useState('');
  const [date,      setDate]      = useState(defaultDate || todayStr());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime,   setEndTime]   = useState('10:00');
  const [persons,   setPersons]   = useState(['maddie']);
  const [location,  setLocation]  = useState('');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  // Recurring — add mode only, mirrors TasksTab.js's exact convention (no
  // days selected = daily). Editing recurrence on an existing series isn't
  // built here; edit mode only ever touches a single event's own fields.
  const [recurring,     setRecurring]     = useState(false);
  const [selectedDays,  setSelectedDays]  = useState([]);
  const [recurEndDate,  setRecurEndDate]  = useState('');

  const isEdit = mode === 'edit';

  function toggleDay(day) {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }

  useEffect(() => {
    if (visible) {
      setSaving(false);
      setError('');
      if (isEdit && event) {
        setTitle(event.title || '');
        setDate(event.startTime ? event.startTime.slice(0, 10) : (defaultDate || todayStr()));
        setStartTime(extractTime(event.startTime));
        setEndTime(event.endTime ? extractTime(event.endTime) : '10:00');
        setPersons([event.person]);
        setLocation(event.location || '');
      } else {
        setTitle('');
        setDate(defaultDate || todayStr());
        setStartTime('09:00');
        setEndTime('10:00');
        setPersons(['maddie']);
        setLocation('');
        setRecurring(false);
        setSelectedDays([]);
        setRecurEndDate('');
      }
    }
  }, [visible]);

  function handleStartChange(newStart) {
    setStartTime(newStart);
    const [sh, sm] = newStart.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (eh * 60 + em <= sh * 60 + sm) {
      const newEndMins = Math.min(sh * 60 + sm + 60, 23 * 60 + 59);
      setEndTime(`${pad(Math.floor(newEndMins / 60))}:${pad(newEndMins % 60)}`);
    }
  }

  function togglePerson(key) {
    setPersons(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  async function handleSave() {
    if (!title.trim()) return setError('Title is required');
    if (!isEdit && persons.length === 0) return setError('Select at least one person');
    const startISO = toISO(date, startTime);
    const endISO   = toISO(date, endTime);
    if (!startISO) return setError('Invalid start time');
    if (!endISO)   return setError('Invalid end time');
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (eh * 60 + em <= sh * 60 + sm) return setError('End time must be after start time');

    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await updateCalendarEvent({
          eventId:  event.id,
          person:   event.person,
          title:    title.trim(),
          startISO, endISO,
          location: location.trim(),
        });
      } else {
        await createCalendarEvent({
          persons, title: title.trim(), startISO, endISO, location: location.trim(),
          recurring,
          recurrenceDays: recurring ? selectedDays : null,
          recurrenceEndDate: recurring && recurEndDate ? recurEndDate : null,
        });
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to save event');
    } finally {
      setSaving(false);
    }
  }

  function doDelete(eventId) {
    return async () => {
      setSaving(true);
      try {
        await deleteCalendarEvent({ eventId, person: event.person });
        onDeleted?.();
        onClose();
      } catch (e) {
        setError(e.message || 'Failed to delete');
        setSaving(false);
      }
    };
  }

  function handleDelete() {
    // recurringEventId is only set on an expanded instance of a recurring event
    // (see calendarService.js) — its own id deletes just this occurrence, deleting
    // by recurringEventId (the series' master id) removes the whole series.
    if (event?.recurringEventId) {
      // Session 34: Kath reported only seeing one option on iOS, not the
      // three Android shows. Alert.alert's 3-button layout on iOS is a
      // UIAlertController in Alert style, which Apple's own HIG scopes to
      // 1-2 simple choices — 3+ related choices (especially with more than
      // one destructive action, as here) is what ActionSheetIOS/UIAlertController
      // action-sheet style exists for, and is far more reliably rendered
      // with N options. Switching this one interaction to it on iOS rather
      // than guessing at the exact Alert-style rendering gap without a
      // repro to actually inspect.
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: 'Delete Recurring Event',
            message: `"${event?.title}" repeats. Delete just this event, or every event in the series?`,
            options: ['Cancel', 'This event', 'All events in series'],
            cancelButtonIndex: 0,
            destructiveButtonIndex: [1, 2],
          },
          buttonIndex => {
            if (buttonIndex === 1) doDelete(event.id)();
            if (buttonIndex === 2) doDelete(event.recurringEventId)();
          }
        );
        return;
      }
      Alert.alert(
        'Delete Recurring Event',
        `"${event?.title}" repeats. Delete just this event, or every event in the series?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'This event', style: 'destructive', onPress: doDelete(event.id) },
          { text: 'All events in series', style: 'destructive', onPress: doDelete(event.recurringEventId) },
        ]
      );
      return;
    }
    Alert.alert(
      'Delete Event',
      `Delete "${event?.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete(event.id) },
      ]
    );
  }

  const PERSON_OPTS = [
    { key: 'maddie', label: 'Maddie', color: COLORS.maddie },
    { key: 'alex',   label: 'Alex',   color: COLORS.alex   },
    { key: 'marj',   label: 'Marj',   color: COLORS.marj   },
    { key: 'family', label: 'Family', color: COLORS.family  },
  ];

  const personDisplayColor = isEdit && event
    ? (COLORS[event.person] || COLORS.family)
    : COLORS.family;
  const personDisplayLabel = isEdit && event
    ? (event.person?.charAt(0).toUpperCase() + (event.person?.slice(1) || ''))
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
          <Text style={styles.sheetTitle}>{isEdit ? 'EDIT EVENT' : 'ADD EVENT'}</Text>
          {isEdit ? (
            <TouchableOpacity onPress={handleDelete} hitSlop={12} disabled={saving}>
              <Text style={[styles.sheetCancel, { color: '#C0392B' }]}>Delete</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 56 }} />
          )}
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

          <Text style={styles.fieldLabel}>DATE</Text>
          <DatePicker key={visible} value={date} onChange={setDate} />

          {!isEdit && (
            <>
              <Text style={styles.fieldLabel}>TYPE</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleBtn, !recurring && styles.toggleBtnActive]}
                  onPress={() => setRecurring(false)}
                >
                  <Text style={[styles.toggleBtnText, !recurring && styles.toggleBtnTextActive]}>One-off</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, recurring && styles.toggleBtnActive]}
                  onPress={() => setRecurring(true)}
                >
                  <Text style={[styles.toggleBtnText, recurring && styles.toggleBtnTextActive]}>Recurring</Text>
                </TouchableOpacity>
              </View>

              {recurring && (
                <>
                  <Text style={styles.fieldLabel}>REPEATS</Text>
                  <View style={styles.daysRow}>
                    <TouchableOpacity
                      style={[styles.dayBtn, styles.dayBtnDaily, selectedDays.length === 0 && styles.dayBtnActive]}
                      onPress={() => setSelectedDays([])}
                    >
                      <Text style={[styles.dayBtnText, selectedDays.length === 0 && styles.dayBtnTextActive]}>Daily</Text>
                    </TouchableOpacity>
                    {WEEKDAYS.map(d => (
                      <TouchableOpacity
                        key={d.id}
                        style={[styles.dayBtn, selectedDays.includes(d.id) && styles.dayBtnActive]}
                        onPress={() => toggleDay(d.id)}
                      >
                        <Text style={[styles.dayBtnText, selectedDays.includes(d.id) && styles.dayBtnTextActive]}>{d.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.fieldLabel}>END DATE <Text style={styles.optional}>(optional)</Text></Text>
                  {/* Modal keeps EventSheet mounted across visibility toggles (see the
                      visible-effect above resetting the other fields by hand), so this
                      is keyed to force a fresh mount each time the sheet reopens — the
                      alternative is EndDatePicker silently reopening on a stale month
                      from the last time it was used. */}
                  <EndDatePicker key={visible} value={recurEndDate} onChange={setRecurEndDate} />
                </>
              )}
            </>
          )}

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
          {isEdit ? (
            <View style={[styles.personChip, { backgroundColor: personDisplayColor, borderColor: personDisplayColor, alignSelf: 'flex-start' }]}>
              <Text style={[styles.personChipText, { color: '#fff' }]}>{personDisplayLabel}</Text>
            </View>
          ) : (
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
          )}

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
              : <Text style={styles.saveBtnText}>{isEdit ? 'SAVE CHANGES' : 'ADD EVENT'}</Text>
            }
          </TouchableOpacity>

          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Tap-to-expand calendar under the Day view's date-nav label. Separate tiny
// component (not just calling useCalendarNav inline in CalendarTab) so it can
// be keyed by selectedDate — CalendarTab itself never remounts, and
// useCalendarNav's viewYear/viewMonth0 only initialise once on mount, so
// without a fresh key an arrow-navigated date wouldn't move the dropdown's
// browsed month the next time it's opened.
function NavMiniCalendar({ selectedDate, onSelect }) {
  const { viewYear, viewMonth0, changeMonth } = useCalendarNav(selectedDate);
  return (
    <MiniCalendarGrid
      viewYear={viewYear}
      viewMonth0={viewMonth0}
      selectedValue={selectedDate}
      onSelectDay={onSelect}
      onPrevMonth={() => changeMonth(-1)}
      onNextMonth={() => changeMonth(1)}
    />
  );
}

// ─── CalendarTab ──────────────────────────────────────────────────────────────

export default function CalendarTab() {
  const insets = useSafeAreaInsets();

  const [view,          setView]          = useState('day');
  const [selectedDate,  setSelectedDate]  = useState(() => todayStr());
  const [navCalOpen,    setNavCalOpen]    = useState(false);
  const [events,        setEvents]        = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [showAdd,       setShowAdd]       = useState(false);
  const [editingEvent,  setEditingEvent]  = useState(null);

  const today     = todayStr();
  const dateObj   = new Date(selectedDate + 'T12:00:00');
  const selYear   = dateObj.getFullYear();
  const selMonth0 = dateObj.getMonth();
  const weekDates = getWeekDates(selectedDate);

  function fetchRange() {
    if (view === 'day')  return { start: selectedDate, end: selectedDate };
    if (view === 'week') return { start: weekDates[0], end: weekDates[6] };
    const last = new Date(selYear, selMonth0 + 1, 0);
    return { start: `${selYear}-${pad(selMonth0 + 1)}-01`, end: makeDateStr(last) };
  }

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const { start, end } = fetchRange();
      try {
        const data = await fetchCalendarEventsForRange(start, end);
        setEvents(data);
      } catch {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const data = await fetchCalendarEventsForRange(start, end);
          setEvents(data);
        } catch (e) {
          console.warn('Calendar fetch error:', e.message);
        }
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedDate]);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(useCallback(() => { load(true); }, [load]));

  function onRefresh() { setRefreshing(true); invalidateCalendarCache(); load(true); }

  function navPrev() {
    if (view === 'day')   setSelectedDate(d => offsetDate(d, -1));
    if (view === 'week')  setSelectedDate(d => offsetDate(d, -7));
    if (view === 'month') setSelectedDate(makeDateStr(new Date(selYear, selMonth0 - 1, 1)));
  }

  function navNext() {
    if (view === 'day')   setSelectedDate(d => offsetDate(d, 1));
    if (view === 'week')  setSelectedDate(d => offsetDate(d, 7));
    if (view === 'month') setSelectedDate(makeDateStr(new Date(selYear, selMonth0 + 1, 1)));
  }

  function navLabel() {
    if (view === 'day') return formatDateNav(selectedDate);
    if (view === 'week') {
      const fmt = ds => new Date(ds + 'T12:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'long' });
      return `${fmt(weekDates[0])} – ${fmt(weekDates[6])}`;
    }
    return `${MONTH_NAMES[selMonth0]} ${selYear}`;
  }

  function handleEventPress(ev) { setEditingEvent(ev); }

  const showSheet  = showAdd || !!editingEvent;
  const sheetMode  = editingEvent ? 'edit' : 'add';

  function closeSheet() { setShowAdd(false); setEditingEvent(null); }

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>

      {/* View switcher */}
      <View style={styles.viewSwitcher}>
        {['day', 'week', 'month'].map(v => (
          <TouchableOpacity
            key={v}
            style={[styles.switcherTab, view === v && styles.switcherTabActive]}
            onPress={() => { setView(v); setNavCalOpen(false); }}
            activeOpacity={0.75}
          >
            <Text style={[styles.switcherLabel, view === v && styles.switcherLabelActive]}>
              {v.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Date nav */}
      <View style={styles.dateNav}>
        <TouchableOpacity style={styles.navBtn} onPress={navPrev}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
          activeOpacity={view === 'day' ? 0.7 : 1}
          onPress={() => { if (view === 'day') setNavCalOpen(o => !o); }}
        >
          <Text style={styles.navLabel}>{navLabel()}</Text>
          {loading && !refreshing && (
            <ActivityIndicator size="small" color={COLORS.timeIndicator} style={{ marginLeft: 6 }} />
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={navNext}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {navCalOpen && view === 'day' && (
        <View style={styles.navCalPanel}>
          <NavMiniCalendar
            key={selectedDate}
            selectedDate={selectedDate}
            onSelect={ds => { setSelectedDate(ds); setNavCalOpen(false); }}
          />
        </View>
      )}

      {/* Legend — week + month only */}
      {(view === 'week' || view === 'month') && (
        <View style={styles.legendRow}>
          {[
            { key: 'maddie', label: 'Maddie', color: COLORS.maddie },
            { key: 'alex',   label: 'Alex',   color: COLORS.alex   },
            { key: 'marj',   label: 'Marj',   color: COLORS.marj   },
          ].map(p => (
            <View key={p.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: p.color }]} />
              <Text style={[styles.legendLabel, { color: p.color }]}>{p.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Content */}
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
            onEventPress={handleEventPress}
          />
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {view === 'week' && (
        <WeekView
          events={events}
          weekDates={weekDates}
          onEventPress={handleEventPress}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      )}

      {view === 'day' && (
        <DayView
          events={events}
          dateStr={selectedDate}
          onEventPress={handleEventPress}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => setShowAdd(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <EventSheet
        visible={showSheet}
        mode={sheetMode}
        event={editingEvent}
        defaultDate={selectedDate}
        onClose={closeSheet}
        onSaved={() => { invalidateCalendarCache(); load(); }}
        onDeleted={() => { invalidateCalendarCache(); load(); }}
      />
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },

  // view switcher
  viewSwitcher: {
    flexDirection: 'row',
    marginHorizontal: H_PAD,
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 3,
  },
  switcherTab: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 6 },
  switcherTabActive: {
    backgroundColor: COLORS.background,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 2, elevation: 2,
  },
  switcherLabel: { fontFamily: FONTS.heading, fontSize: 11, letterSpacing: 1, color: COLORS.textSecondary },
  switcherLabelActive: { color: COLORS.text },

  // date nav
  dateNav: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: H_PAD, paddingVertical: 8, height: 40,
  },
  navBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontFamily: FONTS.body, fontSize: 22, color: COLORS.adrian, lineHeight: 26 },
  navLabel: {
    fontFamily: FONTS.headingBold,
    fontSize: 15,
    letterSpacing: 0.3,
    color: COLORS.adrian,
  },

  // legend
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 0,
    paddingBottom: 3,
    paddingHorizontal: H_PAD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontFamily: FONTS.bodyMedium, fontSize: 11 },

  // timeline
  hourLabel: {
    fontFamily: FONTS.body, fontSize: 10, lineHeight: 12,
    color: COLORS.textSecondary, textAlign: 'right', paddingRight: 6,
  },
  gridLine: {
    position: 'absolute', left: 0, right: 0,
    height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border,
  },
  gridLineHalf: {
    position: 'absolute', left: 0, right: 0,
    height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, opacity: 0.4,
  },
  timeIndicatorLine: {
    position: 'absolute', left: 0, right: 0,
    height: 1.5, backgroundColor: COLORS.timeIndicator,
    flexDirection: 'row', alignItems: 'center',
  },
  timeIndicatorDot: {
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: COLORS.timeIndicator, marginLeft: -3.5,
  },

  // month view
  monthHeaderRow: { flexDirection: 'row', marginBottom: 4, marginTop: 5 },
  monthWeekdayLabel: {
    fontFamily: FONTS.heading, fontSize: 11, letterSpacing: 0.5,
    color: COLORS.textSecondary, textAlign: 'center',
  },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: {
    alignItems: 'center', paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
  },
  monthCellSelected: { backgroundColor: COLORS.surface },
  monthDateCircle: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  monthDateToday: { backgroundColor: COLORS.timeIndicator },
  monthDateText: { fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.text },
  monthDateOtherMonth: { color: COLORS.border },
  monthDateTodayText: { color: '#fff', fontFamily: FONTS.headingBold },
  monthDateSelectedText: { color: COLORS.text, fontFamily: FONTS.headingBold },
  monthDots: { flexDirection: 'row', marginTop: 3, gap: 2, height: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  monthDetail: {
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  monthDetailHeader: {
    fontFamily: FONTS.heading, fontSize: 11, letterSpacing: 1.5,
    color: COLORS.textSecondary, marginBottom: 10,
  },
  monthDetailEmpty: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.textSecondary, paddingVertical: 8 },
  monthEventRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 7, paddingLeft: 10,
    borderLeftWidth: 3, marginBottom: 4,
    backgroundColor: COLORS.surface, borderRadius: 4,
  },
  monthEventDot: { width: 8, height: 8, borderRadius: 4, marginTop: 3, marginRight: 8 },
  monthEventTitle: { fontFamily: FONTS.bodyMedium, fontSize: 14, color: COLORS.text },
  monthEventTime: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },

  // week view
  weekHeaderRow: {
    flexDirection: 'row', paddingHorizontal: H_PAD,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, paddingBottom: 6,
  },
  weekColHeader: { alignItems: 'center', paddingTop: 4 },
  weekColDow: { fontFamily: FONTS.heading, fontSize: 10, letterSpacing: 0.5, color: COLORS.textSecondary },
  weekColDateCircle: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  weekColDateToday: { backgroundColor: COLORS.timeIndicator },
  weekColDate: { fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.text },
  weekColDateTodayText: { color: '#fff', fontFamily: FONTS.headingBold },
  weekEvent: {
    position: 'absolute', left: 1, right: 1,
    borderLeftWidth: 2, borderRadius: 3,
    paddingHorizontal: 2, paddingTop: 2, overflow: 'hidden',
  },
  weekEventText: { fontFamily: FONTS.body, fontSize: 9, lineHeight: 11 },

  // day view
  dayHeaderRow: {
    flexDirection: 'row', paddingHorizontal: H_PAD,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  dayColHeader: {
    alignItems: 'center', paddingVertical: 6, gap: 4,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: COLORS.border,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  dayColName: { fontFamily: FONTS.heading, fontSize: 10, letterSpacing: 0.5 },
  dayEvent: {
    position: 'absolute',
    borderLeftWidth: 2.5, borderRadius: 4,
    paddingHorizontal: 4, paddingTop: 3, overflow: 'hidden',
  },
  dayEventTitle: { fontFamily: FONTS.bodyMedium, fontSize: 9, lineHeight: 11 },
  dayEventTime: { fontFamily: FONTS.body, fontSize: 8, lineHeight: 10, marginTop: 1 },

  // FAB
  fab: {
    position: 'absolute', right: 20, width: 52, height: 52,
    borderRadius: 26, backgroundColor: COLORS.timeIndicator,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32, fontFamily: FONTS.body, marginTop: -2 },

  // time picker
  tpBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: COLORS.surface,
  },
  tpBtnText: { fontFamily: FONTS.bodyMedium, fontSize: 16, color: COLORS.text },
  tpChevron: { fontSize: 12, color: COLORS.textSecondary, marginLeft: 8 },
  tpOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  tpDropdown: {
    backgroundColor: COLORS.background, borderRadius: 10,
    width: 230, maxHeight: 286, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 8,
  },
  tpItem: { height: 44, justifyContent: 'center', paddingHorizontal: 16 },
  tpItemSelected: { backgroundColor: COLORS.adrianLight || '#E8EEF4' },
  tpItemText: { fontFamily: FONTS.body, fontSize: 15, color: COLORS.text },
  tpItemTextSelected: { fontFamily: FONTS.headingBold, color: COLORS.adrian },
  tpCustomToggle: {
    paddingVertical: 12, alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
  },
  tpCustomToggleText: { fontFamily: FONTS.bodyMedium, fontSize: 13, color: COLORS.family },
  tpCustomWrap: { padding: 16 },
  tpCustomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tpCustomInput: {
    width: 48, height: 44, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    fontFamily: FONTS.bodyMedium, fontSize: 18, color: COLORS.text, textAlign: 'center',
    backgroundColor: COLORS.surface,
  },
  tpCustomColon: { fontFamily: FONTS.bodyMedium, fontSize: 18, color: COLORS.text },
  tpAmPmCol: { marginLeft: 8, gap: 4 },
  tpAmPmBtn: {
    width: 44, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
    alignItems: 'center',
  },
  tpAmPmBtnActive: { backgroundColor: COLORS.family, borderColor: COLORS.family },
  tpAmPmText: { fontFamily: FONTS.bodyMedium, fontSize: 11, color: COLORS.text },
  tpAmPmTextActive: { color: '#fff' },
  tpCustomSetBtn: {
    marginTop: 14, backgroundColor: COLORS.family, borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  tpCustomSetText: { fontFamily: FONTS.bodyMedium, fontSize: 14, color: '#fff' },

  // event sheet
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
  // Recurring event UI — same values as TasksTab.js's toggle/day-picker styles.
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center', justifyContent: 'center', minHeight: 44,
  },
  toggleBtnActive: { backgroundColor: COLORS.family, borderColor: COLORS.family },
  toggleBtnText: { fontFamily: FONTS.bodyMedium, fontSize: 14, color: COLORS.text },
  toggleBtnTextActive: { color: '#fff' },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayBtn: {
    width: 38, height: 38, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  dayBtnDaily: { width: 52 },
  dayBtnActive: { backgroundColor: COLORS.family, borderColor: COLORS.family },
  dayBtnText: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.text },
  dayBtnTextActive: { color: '#fff', fontFamily: FONTS.bodyMedium },
  textInput: {
    fontFamily: FONTS.body, fontSize: 16, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: COLORS.surface,
  },
  // ─── EndDatePicker ──
  enddateField: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: COLORS.surface,
  },
  enddateFieldOpen: { borderColor: COLORS.family },
  enddateValue: { fontFamily: FONTS.body, fontSize: 15, color: COLORS.textSecondary },
  enddateValueSet: { color: COLORS.text, fontFamily: FONTS.bodyMedium },
  enddateChevron: { fontSize: 11, color: COLORS.textSecondary },
  calPanel: {
    borderWidth: 1, borderColor: COLORS.border, borderTopWidth: 0,
    borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
    paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10,
  },
  // Same content as calPanel, but self-contained (border on all sides) for use
  // below a plain, borderless row like the Day view's date-nav — calPanel's
  // missing top border assumes a bordered field sitting directly above it.
  navCalPanel: {
    marginHorizontal: H_PAD, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, backgroundColor: COLORS.background,
    paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10,
  },
  calMonthRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6,
  },
  calArrow: { fontFamily: FONTS.body, fontSize: 16, color: COLORS.alex, paddingHorizontal: 10 },
  calMonthLabel: { fontFamily: FONTS.heading, fontSize: 11, letterSpacing: 0.5, color: COLORS.text },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calWeekday: {
    width: '14.2857%',
    fontFamily: FONTS.heading, fontSize: 10, letterSpacing: 0.5,
    color: COLORS.textSecondary, textAlign: 'center', paddingBottom: 4,
  },
  calDayCell: { width: '14.2857%', alignItems: 'center', paddingVertical: 3 },
  calDayCircle: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  calDayToday: { backgroundColor: COLORS.timeIndicator },
  calDaySelected: { backgroundColor: COLORS.family },
  calDayText: { fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.text },
  calDayOtherMonth: { color: COLORS.border },
  calDayTextOnColor: { color: '#fff', fontFamily: FONTS.headingBold },
  calFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
  },
  calClear: { fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.family },
  calClearDisabled: { color: COLORS.border },
  calHint: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.textSecondary },
  dateRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, backgroundColor: COLORS.surface,
  },
  dateLabel: {
    flex: 1, fontFamily: FONTS.bodyMedium, fontSize: 15,
    color: COLORS.text, textAlign: 'center', paddingVertical: 12,
  },
  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  timeSep: { fontFamily: FONTS.body, fontSize: 16, color: COLORS.textSecondary, paddingBottom: 14 },
  personPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  personChip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  personChipText: { fontFamily: FONTS.bodyMedium, fontSize: 14, color: COLORS.text },
  errorText: { fontFamily: FONTS.body, fontSize: 13, color: '#C0392B', marginTop: 12, textAlign: 'center' },
  saveBtn: {
    marginTop: 24, backgroundColor: COLORS.timeIndicator,
    borderRadius: 10, paddingVertical: 16, alignItems: 'center',
  },
  saveBtnText: { fontFamily: FONTS.headingBold, fontSize: 14, letterSpacing: 1.5, color: '#fff' },
});
