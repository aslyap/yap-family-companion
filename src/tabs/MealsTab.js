import React, { useCallback, useReducer, useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Pressable, ActivityIndicator,
  RefreshControl, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, FONTS } from '../theme';
import {
  fetchMealsForDates, upsertMeal, addRecurringMeal, updateRecurringMeal, deleteMeal,
  mealFor as resolveMeal,
} from '../services/mealsService';

// ─── constants ────────────────────────────────────────────────────────────────

const DAY_COL = 38;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Same ids/convention as TasksTab.js's recurring day picker.
const RECUR_WEEKDAYS = [
  { id: 'mon', label: 'Mo' }, { id: 'tue', label: 'Tu' },
  { id: 'wed', label: 'We' }, { id: 'thu', label: 'Th' },
  { id: 'fri', label: 'Fr' }, { id: 'sat', label: 'Sa' },
  { id: 'sun', label: 'Su' },
];

// Breakfast uses meal_type 'breakfast' — ensure your Supabase meals table allows this value.
// If you have a CHECK constraint limiting to ('lunch','dinner'), run:
//   ALTER TABLE meals DROP CONSTRAINT meals_meal_type_check;
//   ALTER TABLE meals ADD CONSTRAINT meals_meal_type_check
//     CHECK (meal_type IN ('breakfast','lunch','dinner'));
const MEAL_COLS = [
  { id: 'b-m', mealType: 'breakfast', person: 'maddie', groupLabel: 'Breakfast', subLabel: 'MADDIE', color: COLORS.maddie, light: COLORS.maddieLight,
    avatarUri: 'https://yap-family-home.vercel.app/avatars/Maddie.jpg', groupStart: true },
  { id: 'b-a', mealType: 'breakfast', person: 'alex',   groupLabel: '',          subLabel: 'ALEX',   color: COLORS.alex,   light: COLORS.alexLight,
    avatarUri: 'https://yap-family-home.vercel.app/avatars/Alex.jpg',   groupStart: false },
  { id: 'l-m', mealType: 'lunch',     person: 'maddie', groupLabel: 'Lunch',     subLabel: 'MADDIE', color: COLORS.maddie, light: COLORS.maddieLight,
    avatarUri: 'https://yap-family-home.vercel.app/avatars/Maddie.jpg', groupStart: true },
  { id: 'l-a', mealType: 'lunch',     person: 'alex',   groupLabel: '',          subLabel: 'ALEX',   color: COLORS.alex,   light: COLORS.alexLight,
    avatarUri: 'https://yap-family-home.vercel.app/avatars/Alex.jpg',   groupStart: false },
  { id: 'd',   mealType: 'dinner',    person: 'family', groupLabel: 'Dinner',    subLabel: '',       color: COLORS.family, light: COLORS.familyLight,
    avatarUri: null, groupStart: true,
    // Dinner shows both kids' avatars
    dinnerAvatars: [
      { uri: 'https://yap-family-home.vercel.app/avatars/Maddie.jpg', color: COLORS.maddie, label: 'M' },
      { uri: 'https://yap-family-home.vercel.app/avatars/Alex.jpg',   color: COLORS.alex,   label: 'A' },
    ],
  },
];

// ─── MealPersonAvatar ─────────────────────────────────────────────────────────

function MealPersonAvatar({ col }) {
  const [err, setErr] = useState(false);
  if (!col.avatarUri || err) {
    return (
      <View style={[styles.mealAvatar, { backgroundColor: col.color }]}>
        <Text style={styles.mealAvatarText}>{col.subLabel[0]}</Text>
      </View>
    );
  }
  return <Image source={{ uri: col.avatarUri }} style={styles.mealAvatar} onError={() => setErr(true)} />;
}

function DinnerAvatar({ uri, color, label }) {
  const [err, setErr] = useState(false);
  if (!uri || err) {
    return (
      <View style={[styles.mealAvatar, { backgroundColor: color, marginHorizontal: -4 }]}>
        <Text style={styles.mealAvatarText}>{label}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[styles.mealAvatar, { marginHorizontal: -4 }]}
      onError={() => setErr(true)}
    />
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayStr() {
  return makeDateStr(new Date());
}

function getWeekDates(weekOffset) {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return makeDateStr(d);
  });
}

function formatWeekRange(dates) {
  const fmt = (ds) => new Date(ds + 'T12:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'long' });
  return `${fmt(dates[0])} – ${fmt(dates[6])}`;
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

// Shared month-navigation state for EndDatePicker below — same technique as
// CalendarTab.js's useCalendarNav.
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

const WEEKDAY_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

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
          <Text key={d} style={styles.calWeekday}>{d}</Text>
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

// Tap-to-expand inline calendar for a recurring series' end date, replacing a
// typed YYYY-MM-DD field — same UX as CalendarTab.js's EndDatePicker.
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

// ─── reducer ─────────────────────────────────────────────────────────────────

function mealsReducer(state, action) {
  switch (action.type) {
    case 'set':    return action.meals;
    case 'upsert': return [...state.filter(m => m.id !== action.meal.id), action.meal];
    case 'delete': return state.filter(m => m.id !== action.id);
    default:       return state;
  }
}

// ─── EditMealSheet ─────────────────────────────────────────────────────────────

function EditMealSheet({ visible, meal, col, onClose, onSave, onDelete }) {
  const insets = useSafeAreaInsets();
  const [dishName, setDishName] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [selectedDays, setSelectedDays] = useState([]);
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setDishName(meal?.dish_name || '');
      setRecurring(meal?.recurring || false);
      setSelectedDays(
        meal?.recurring && meal.recurrence_rule && meal.recurrence_rule !== 'daily'
          ? meal.recurrence_rule.split(',').map(d => d.trim())
          : []
      );
      setEndDate(meal?.end_date || '');
      setError('');
      setSaving(false);
    }
  }, [visible, meal]);

  function toggleDay(id) {
    setSelectedDays(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await onSave({
        dishName: dishName.trim() || null,
        recurring,
        recurrenceDays: recurring ? selectedDays : null,
        endDate: recurring ? (endDate || null) : null,
      });
    } catch (err) {
      setError(err.message || 'Failed to save');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!meal) return;
    setSaving(true);
    try { await onDelete(meal.id); } catch { setSaving(false); }
  }

  const mealLabel = col?.mealType === 'breakfast' ? 'Breakfast' : col?.mealType === 'lunch' ? 'Lunch' : 'Dinner';
  const personLabel = col?.subLabel || 'Family';
  const title = personLabel ? `${mealLabel} — ${personLabel}` : mealLabel;
  const accentColor = col?.color ?? COLORS.family;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kvWrapper}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: accentColor }]}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Dish</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Chicken rice"
              placeholderTextColor={COLORS.textSecondary}
              value={dishName}
              onChangeText={setDishName}
              autoFocus
            />

            <Text style={styles.fieldLabel}>Type</Text>
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
                <Text style={styles.fieldLabel}>Schedule</Text>
                <View style={styles.daysRow}>
                  <TouchableOpacity
                    style={[styles.dayBtn, styles.dayBtnDaily, selectedDays.length === 0 && styles.dayBtnActive]}
                    onPress={() => setSelectedDays([])}
                  >
                    <Text style={[styles.dayBtnText, selectedDays.length === 0 && styles.dayBtnTextActive]}>Daily</Text>
                  </TouchableOpacity>
                  {RECUR_WEEKDAYS.map(d => (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.dayBtn, selectedDays.includes(d.id) && styles.dayBtnActive]}
                      onPress={() => toggleDay(d.id)}
                    >
                      <Text style={[styles.dayBtnText, selectedDays.includes(d.id) && styles.dayBtnTextActive]}>{d.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>End date <Text style={{ color: COLORS.textSecondary }}>(optional)</Text></Text>
                <EndDatePicker value={endDate} onChange={setEndDate} />
              </>
            )}

            {!!error && <Text style={styles.errorText}>{error}</Text>}
            <View style={{ height: 4 }} />
            </ScrollView>

            <View style={styles.sheetActions}>
              {meal && (
                <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={saving}>
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: accentColor }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── MealsTab ─────────────────────────────────────────────────────────────────

export default function MealsTab() {
  const insets = useSafeAreaInsets();
  const [weekOffset, setWeekOffset] = useState(0);
  const [meals, dispatch] = useReducer(mealsReducer, []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(null);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const today = todayStr();

  const load = useCallback(async () => {
    try {
      const data = await fetchMealsForDates(weekDates);
      dispatch({ type: 'set', meals: data });
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [weekDates]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function onRefresh() { setRefreshing(true); load(); }

  function mealFor(dateStr, col) {
    return resolveMeal(meals, dateStr, col.person, col.mealType);
  }

  function openEdit(col, dateStr) {
    setEditing({ col, dateStr, meal: mealFor(dateStr, col) });
  }

  async function handleSave({ dishName, recurring, recurrenceDays, endDate }) {
    const existing = editing.meal;

    if (recurring) {
      const recurrence_rule = recurrenceDays && recurrenceDays.length > 0 ? recurrenceDays.join(',') : 'daily';
      let saved;
      if (existing?.recurring) {
        saved = await updateRecurringMeal(existing.id, { dish_name: dishName, recurrence_rule, end_date: endDate });
      } else {
        saved = await addRecurringMeal({ meal_type: editing.col.mealType, person: editing.col.person, dish_name: dishName, recurrence_rule, end_date: endDate });
        if (existing) { await deleteMeal(existing.id).catch(() => {}); dispatch({ type: 'delete', id: existing.id }); }
      }
      dispatch({ type: 'upsert', meal: saved });
    } else {
      if (existing?.recurring) { await deleteMeal(existing.id).catch(() => {}); dispatch({ type: 'delete', id: existing.id }); }
      const saved = await upsertMeal({
        date: editing.dateStr,
        meal_type: editing.col.mealType,
        person: editing.col.person,
        dish_name: dishName,
      });
      dispatch({ type: 'upsert', meal: saved });
    }
    setEditing(null);
  }

  async function handleDelete(id) {
    await deleteMeal(id);
    dispatch({ type: 'delete', id });
    setEditing(null);
  }

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>

      {/* Week navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity style={styles.navBtn} onPress={() => setWeekOffset(o => o - 1)}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.navCenter}>
          <Text style={styles.navLabel}>{formatWeekRange(weekDates)}</Text>
          {loading && !refreshing && (
            <ActivityIndicator size="small" color={COLORS.textSecondary} style={{ marginLeft: 6 }} />
          )}
        </View>
        <TouchableOpacity style={styles.navBtn} onPress={() => setWeekOffset(o => o + 1)}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Column header row 1: meal group labels */}
      <View style={[styles.headerRow, { borderBottomWidth: 0, marginTop: 10 }]}>
        <View style={{ width: DAY_COL }} />
        <View style={[styles.groupHeader, { flex: 2, borderLeftWidth: 1, borderLeftColor: COLORS.border }]}>
          <Text style={styles.groupHeaderText}>Breakfast</Text>
        </View>
        <View style={[styles.groupHeader, { flex: 2, borderLeftWidth: 1, borderLeftColor: COLORS.border }]}>
          <Text style={styles.groupHeaderText}>LUNCH</Text>
        </View>
        <View style={[styles.groupHeader, { flex: 1, borderLeftWidth: 1, borderLeftColor: COLORS.border }]}>
          <Text style={styles.groupHeaderText}>DINNER</Text>
        </View>
      </View>

      {/* Column header row 2: person sub-labels with avatars (no background shading) */}
      <View style={styles.headerRow}>
        <View style={{ width: DAY_COL }} />
        {MEAL_COLS.map(col => (
          <View key={col.id} style={[styles.personHeader, { borderLeftWidth: col.groupStart ? 1 : 0 }]}>
            {col.dinnerAvatars ? (
              <View style={styles.dinnerAvatarRow}>
                {col.dinnerAvatars.map((av, i) => (
                  <DinnerAvatar key={i} uri={av.uri} color={av.color} label={av.label} />
                ))}
              </View>
            ) : col.subLabel ? (
              <MealPersonAvatar col={col} />
            ) : null}
            {col.subLabel ? (
              <Text style={[styles.personHeaderText, { color: col.color }]}>{col.subLabel}</Text>
            ) : null}
          </View>
        ))}
      </View>

      {/* Data rows */}
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {weekDates.map((ds, dayIdx) => {
          const isToday = ds === today;
          return (
            <View key={ds} style={[styles.dayRow, isToday && styles.dayRowToday]}>
              <View style={styles.dayLabelCol}>
                <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
                  {WEEKDAYS[dayIdx]}
                </Text>
              </View>
              {MEAL_COLS.map(col => {
                const meal = mealFor(ds, col);
                return (
                  <TouchableOpacity
                    key={col.id}
                    style={[styles.mealCell, { borderLeftWidth: col.groupStart ? 1 : 0 }]}
                    onPress={() => openEdit(col, ds)}
                    activeOpacity={0.7}
                  >
                    {meal?.dish_name ? (
                      <Text style={[styles.dishText, { color: col.color }]} numberOfLines={3}>
                        {meal.dish_name}{meal.recurring ? ' ↻' : ''}
                      </Text>
                    ) : (
                      <Text style={styles.emptyPlus}>–</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
        <View style={{ height: 24 }} />
      </ScrollView>

      {editing && (
        <EditMealSheet
          visible={!!editing}
          meal={editing.meal}
          col={editing.col}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },

  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  navBtn: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 24, color: COLORS.adrian, lineHeight: 28 },
  navCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  navLabel: {
    fontFamily: FONTS.headingBold,
    fontSize: 15,
    letterSpacing: 0.3,
    color: COLORS.adrian,
  },

  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  groupHeader: {
    alignItems: 'center',
    paddingVertical: 3,
  },
  groupHeaderText: {
    fontFamily: FONTS.headingBold,
    fontSize: 8,
    letterSpacing: 0.5,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  personHeader: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  dinnerAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  personHeaderText: {
    fontFamily: FONTS.heading,
    fontSize: 8,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  mealAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealAvatarText: {
    fontFamily: FONTS.headingBold,
    fontSize: 10,
    color: '#fff',
  },

  scroll: { flex: 1 },

  dayRow: {
    flexDirection: 'row',
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dayRowToday: {
    backgroundColor: '#EBF4FB',
  },
  dayLabelCol: {
    width: DAY_COL,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  dayLabel: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 10,
    letterSpacing: 0,
    color: COLORS.textSecondary,
  },
  dayLabelToday: {
    fontFamily: FONTS.bodyMedium,
    color: COLORS.text,
  },
  mealCell: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  dishText: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center',
  },
  emptyPlus: {
    fontSize: 16,
    color: COLORS.border,
    lineHeight: 20,
  },

  // Bottom sheet
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  kvWrapper: { width: '100%' },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '92%',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  sheetTitle: { fontFamily: FONTS.headingBold, fontSize: 17, color: COLORS.text, flex: 1 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 26, color: COLORS.textSecondary, lineHeight: 30 },
  fieldLabel: {
    fontFamily: FONTS.heading,
    fontSize: 11,
    letterSpacing: 0.4,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.text,
    minHeight: 48,
  },
  errorText: { color: '#dc2626', fontFamily: FONTS.body, fontSize: 13, marginTop: 10 },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  toggleBtnActive: {
    backgroundColor: COLORS.family,
    borderColor: COLORS.family,
  },
  toggleBtnText: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 14,
    color: COLORS.text,
  },
  toggleBtnTextActive: {
    color: '#fff',
  },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dayBtn: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtnDaily: {
    width: 52,
  },
  dayBtnActive: {
    backgroundColor: COLORS.family,
    borderColor: COLORS.family,
  },
  dayBtnText: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.text,
  },
  dayBtnTextActive: {
    color: '#fff',
    fontFamily: FONTS.bodyMedium,
  },
  // ─── EndDatePicker ──
  enddateField: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: COLORS.background,
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
  sheetActions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 16,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 16,
  },
  deleteBtn: {
    borderWidth: 1,
    borderColor: '#dc262640',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  deleteBtnText: { fontFamily: FONTS.bodyMedium, fontSize: 14, color: '#dc2626' },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  cancelBtnText: { fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.text },
  saveBtn: {
    flex: 2,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  saveBtnText: { fontFamily: FONTS.headingBold, fontSize: 15, color: '#fff', letterSpacing: 0.3 },
});
