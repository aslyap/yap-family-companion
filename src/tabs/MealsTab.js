import React, { useCallback, useReducer, useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Pressable, ActivityIndicator,
  RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../theme';
import { fetchMealsForDate, upsertMeal, deleteMeal } from '../services/mealsService';

// ─── constants ────────────────────────────────────────────────────────────────

const PEOPLE = [
  { key: 'maddie', label: 'Maddie', color: COLORS.maddie, light: COLORS.maddieLight },
  { key: 'alex',   label: 'Alex',   color: COLORS.alex,   light: COLORS.alexLight   },
];

const MEAL_TYPES = ['lunch', 'dinner'];
const MEAL_LABELS = { lunch: 'Lunch', dinner: 'Dinner' };

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const datePart = d.toLocaleDateString('en-SG', { day: 'numeric', month: 'long' });
  return offset === 0 ? `Today, ${datePart}` : `Tomorrow, ${datePart}`;
}

// ─── reducer ─────────────────────────────────────────────────────────────────

function mealsReducer(state, action) {
  switch (action.type) {
    case 'set': return action.meals;
    case 'upsert': {
      const rest = state.filter(m => !(
        m.date === action.meal.date &&
        m.person === action.meal.person &&
        m.meal_type === action.meal.meal_type
      ));
      return [...rest, action.meal];
    }
    case 'delete': return state.filter(m => m.id !== action.id);
    default:       return state;
  }
}

// ─── EditMealSheet ────────────────────────────────────────────────────────────

function EditMealSheet({ visible, meal, personLabel, mealType, onClose, onSave, onDelete }) {
  const insets = useSafeAreaInsets();
  const [dishName, setDishName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setDishName(meal?.dish_name || '');
      setError('');
      setSaving(false);
    }
  }, [visible, meal]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await onSave(dishName.trim() || null);
    } catch (err) {
      setError(err.message || 'Failed to save');
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await onDelete(meal.id);
    } catch {
      setSaving(false);
    }
  }

  const title = `${MEAL_LABELS[mealType]} — ${personLabel}`;
  const person = PEOPLE.find(p => p.label === personLabel);
  const accentColor = person?.color ?? COLORS.family;

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

            <Text style={styles.fieldLabel}>Dish</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Chicken rice"
              placeholderTextColor={COLORS.textSecondary}
              value={dishName}
              onChangeText={setDishName}
              autoFocus
            />

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <View style={styles.sheetActions}>
              {meal && (
                <TouchableOpacity
                  style={[styles.deleteBtn]}
                  onPress={handleDelete}
                  disabled={saving}
                >
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
  const [dayOffset, setDayOffset] = useState(0);
  const [meals, dispatch] = useReducer(mealsReducer, []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(null); // { person, personLabel, mealType, meal }

  const viewDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return makeDateStr(d);
  }, [dayOffset]);

  const load = useCallback(async () => {
    try {
      const data = await fetchMealsForDate(viewDate);
      dispatch({ type: 'set', meals: data });
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [viewDate]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  function mealFor(personKey, mealType) {
    return meals.find(m => m.date === viewDate && m.person === personKey && m.meal_type === mealType);
  }

  function openEdit(person, mealType) {
    setEditing({ person: person.key, personLabel: person.label, mealType, meal: mealFor(person.key, mealType) });
  }

  async function handleSave(dishName) {
    const saved = await upsertMeal({
      date: viewDate,
      meal_type: editing.mealType,
      person: editing.person,
      dish_name: dishName,
    });
    dispatch({ type: 'upsert', meal: saved });
    setEditing(null);
  }

  async function handleDelete(id) {
    await deleteMeal(id);
    dispatch({ type: 'delete', id });
    setEditing(null);
  }

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Meal Plan</Text>
          {loading && !refreshing && <ActivityIndicator size="small" color={COLORS.textSecondary} style={{ marginLeft: 8 }} />}
        </View>
        <Text style={styles.headerDate}>{dayLabel(dayOffset)}</Text>
      </View>

      {/* Today / Tomorrow toggle */}
      <View style={styles.dayToggle}>
        {[{ label: 'Today', offset: 0 }, { label: 'Tomorrow', offset: 1 }].map(({ label, offset }) => (
          <TouchableOpacity
            key={label}
            style={[styles.dayToggleBtn, dayOffset === offset && styles.dayToggleBtnActive]}
            onPress={() => setDayOffset(offset)}
          >
            <Text style={[styles.dayToggleBtnText, dayOffset === offset && styles.dayToggleBtnTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Column headers */}
        <View style={styles.colHeaders}>
          <View style={styles.rowLabelSpacer} />
          {PEOPLE.map(p => (
            <View key={p.key} style={[styles.colHeader, { backgroundColor: p.light }]}>
              <View style={[styles.colPill, { backgroundColor: p.color }]} />
              <Text style={[styles.colName, { color: p.color }]}>{p.label}</Text>
            </View>
          ))}
        </View>

        {/* Meal rows */}
        {MEAL_TYPES.map(mealType => (
          <View key={mealType} style={styles.mealRow}>
            <View style={styles.rowLabel}>
              <Text style={styles.rowLabelText}>{MEAL_LABELS[mealType]}</Text>
            </View>
            {PEOPLE.map(p => {
              const meal = mealFor(p.key, mealType);
              return (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.mealCell, { borderTopColor: p.light }]}
                  onPress={() => openEdit(p, mealType)}
                  activeOpacity={0.7}
                >
                  {meal?.dish_name ? (
                    <View style={[styles.dishChip, { backgroundColor: p.light, borderColor: p.color + '50' }]}>
                      <Text style={[styles.dishText, { color: p.color }]} numberOfLines={3}>
                        {meal.dish_name}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.emptyCell}>
                      <Text style={[styles.emptyCellPlus, { color: p.color + '80' }]}>+</Text>
                      <Text style={styles.emptyCellHint}>Add</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>

      {editing && (
        <EditMealSheet
          visible={!!editing}
          meal={editing.meal}
          personLabel={editing.personLabel}
          mealType={editing.mealType}
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
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FONTS.headingBold,
    fontSize: 22,
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  headerDate: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // Day toggle
  dayToggle: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dayToggleBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  dayToggleBtnActive: {
    backgroundColor: COLORS.family,
    borderColor: COLORS.family,
  },
  dayToggleBtnText: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 14,
    color: COLORS.text,
  },
  dayToggleBtnTextActive: {
    color: '#fff',
  },

  scroll: { flex: 1 },

  // Column headers
  colHeaders: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowLabelSpacer: {
    width: 72,
  },
  colHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 6,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  colPill: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  colName: {
    fontFamily: FONTS.heading,
    fontSize: 13,
    letterSpacing: 0.3,
  },

  // Meal rows
  mealRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    minHeight: 100,
  },
  rowLabel: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  rowLabelText: {
    fontFamily: FONTS.heading,
    fontSize: 11,
    letterSpacing: 0.4,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  mealCell: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    padding: 10,
    alignItems: 'stretch',
    justifyContent: 'center',
    minHeight: 100,
  },
  dishChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dishText: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  emptyCell: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  emptyCellPlus: {
    fontSize: 26,
    lineHeight: 30,
  },
  emptyCellHint: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // Bottom sheet modal (shared pattern with TasksTab)
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  kvWrapper: { width: '100%' },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  sheetTitle: {
    fontFamily: FONTS.headingBold,
    fontSize: 17,
    color: COLORS.text,
    flex: 1,
    letterSpacing: 0.2,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 26,
    color: COLORS.textSecondary,
    lineHeight: 30,
  },
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
  errorText: {
    color: '#dc2626',
    fontFamily: FONTS.body,
    fontSize: 13,
    marginTop: 10,
  },
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
  deleteBtnText: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 14,
    color: '#dc2626',
  },
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
  cancelBtnText: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 15,
    color: COLORS.text,
  },
  saveBtn: {
    flex: 2,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  saveBtnText: {
    fontFamily: FONTS.headingBold,
    fontSize: 15,
    color: '#fff',
    letterSpacing: 0.3,
  },
});
