import React, { useCallback, useReducer, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Pressable, ActivityIndicator,
  RefreshControl, KeyboardAvoidingView, Platform, Alert, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, FONTS } from '../theme';
import {
  fetchTasks, addTask, deleteTask, toggleComplete,
  isTaskForDate, isCompleteForDate, todayStr,
} from '../services/tasksService';

// ─── constants ───────────────────────────────────────────────────────────────

const PERSONS = [
  { key: 'maddie', label: 'Maddie', color: COLORS.maddie, light: COLORS.maddieLight,
    avatarUri: 'https://yap-family-home.vercel.app/avatars/Maddie.jpg' },
  { key: 'alex',   label: 'Alex',   color: COLORS.alex,   light: COLORS.alexLight,
    avatarUri: 'https://yap-family-home.vercel.app/avatars/Alex.jpg'   },
  { key: 'marj',   label: 'Marj',   color: COLORS.marj,   light: COLORS.marjLight,
    avatarUri: null },
];

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

const WEEKDAYS = [
  { id: 'mon', label: 'Mo' }, { id: 'tue', label: 'Tu' },
  { id: 'wed', label: 'We' }, { id: 'thu', label: 'Th' },
  { id: 'fri', label: 'Fr' }, { id: 'sat', label: 'Sa' },
  { id: 'sun', label: 'Su' },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

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

// ─── reducer ─────────────────────────────────────────────────────────────────

function tasksReducer(state, action) {
  switch (action.type) {
    case 'set':    return action.tasks;
    case 'update': return state.map(t => t.id === action.task.id ? action.task : t);
    case 'add':    return [...state, action.task];
    case 'delete': return state.filter(t => t.id !== action.id);
    default:       return state;
  }
}

// ─── TaskItem ─────────────────────────────────────────────────────────────────

function TaskItem({ task, viewDate, col, onToggle, onLongPress }) {
  const done = isCompleteForDate(task, viewDate);
  return (
    <TouchableOpacity
      style={styles.taskItem}
      onLongPress={onLongPress}
      delayLongPress={600}
      activeOpacity={0.7}
    >
      <TouchableOpacity
        style={[styles.checkbox, {
          borderColor: col.color,
          backgroundColor: done ? col.color : 'transparent',
        }]}
        onPress={onToggle}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {done && <Text style={styles.checkMark}>✓</Text>}
      </TouchableOpacity>

      <View style={styles.taskBody}>
        <Text style={[styles.taskTitle, { color: done ? COLORS.textSecondary : col.color }, done && styles.taskDone]} numberOfLines={3}>
          {task.title}{task.recurring ? ' ↻' : ''}
        </Text>
        {col.key !== 'marj' && task.points > 0 && (
          <View style={[styles.ptsBadge, { borderColor: col.color }]}>
            <Text style={[styles.ptsText, { color: col.color }]}>{task.points}pt</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── AddTaskSheet ─────────────────────────────────────────────────────────────

function AddTaskSheet({ visible, defaultDate, onClose, onSave }) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({
    assigned_to: 'maddie',
    title: '',
    points: '0',
    recurring: false,
    one_off_date: defaultDate,
    end_date: '',
  });
  const [selectedDays, setSelectedDays] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setForm({ assigned_to: 'maddie', title: '', points: '0', recurring: false, one_off_date: defaultDate, end_date: '' });
      setSelectedDays([]);
      setError('');
      setSaving(false);
    }
  }, [visible, defaultDate]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function toggleDay(id) {
    setSelectedDays(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        assigned_to:     form.assigned_to,
        title:           form.title.trim(),
        points:          parseInt(form.points, 10) || 0,
        recurring:       form.recurring,
        recurrence_rule: form.recurring
          ? (selectedDays.length > 0 ? selectedDays.join(',') : 'daily')
          : null,
        end_date:        form.recurring && form.end_date ? form.end_date : null,
        one_off_date:    !form.recurring ? form.one_off_date : null,
      });
    } catch (err) {
      setError(err.message || 'Failed to save task');
      setSaving(false);
    }
  }

  const activeColor = PERSONS.find(p => p.key === form.assigned_to)?.color ?? COLORS.maddie;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView behavior="padding" style={styles.kvWrapper}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Add Task</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Assign to */}
              <Text style={styles.fieldLabel}>Assign to</Text>
              <View style={styles.personRow}>
                {PERSONS.map(p => (
                  <TouchableOpacity
                    key={p.key}
                    style={[styles.personBtn, form.assigned_to === p.key && { backgroundColor: p.color, borderColor: p.color }]}
                    onPress={() => set('assigned_to', p.key)}
                  >
                    <Text style={[styles.personBtnText, form.assigned_to === p.key && { color: '#fff' }]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Title */}
              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Task name…"
                placeholderTextColor={COLORS.textSecondary}
                value={form.title}
                onChangeText={v => set('title', v)}
              />

              {/* Points (Maddie + Alex only) */}
              {form.assigned_to !== 'marj' && (
                <>
                  <Text style={styles.fieldLabel}>Points</Text>
                  <TextInput
                    style={[styles.textInput, { maxWidth: 100 }]}
                    keyboardType="number-pad"
                    value={form.points}
                    onChangeText={v => set('points', v)}
                    placeholderTextColor={COLORS.textSecondary}
                  />
                </>
              )}

              {/* Type toggle */}
              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleBtn, !form.recurring && styles.toggleBtnActive]}
                  onPress={() => set('recurring', false)}
                >
                  <Text style={[styles.toggleBtnText, !form.recurring && styles.toggleBtnTextActive]}>One-off</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, form.recurring && styles.toggleBtnActive]}
                  onPress={() => set('recurring', true)}
                >
                  <Text style={[styles.toggleBtnText, form.recurring && styles.toggleBtnTextActive]}>Recurring</Text>
                </TouchableOpacity>
              </View>

              {/* One-off date */}
              {!form.recurring && (
                <>
                  <Text style={styles.fieldLabel}>Date</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={COLORS.textSecondary}
                    value={form.one_off_date}
                    onChangeText={v => set('one_off_date', v)}
                  />
                </>
              )}

              {/* Recurring options */}
              {form.recurring && (
                <>
                  <Text style={styles.fieldLabel}>Schedule</Text>
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

                  <Text style={styles.fieldLabel}>End date <Text style={{ color: COLORS.textSecondary }}>(optional)</Text></Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={COLORS.textSecondary}
                    value={form.end_date}
                    onChangeText={v => set('end_date', v)}
                  />
                </>
              )}

              {!!error && <Text style={styles.errorText}>{error}</Text>}
              <View style={{ height: 16 }} />
            </ScrollView>

            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: activeColor }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Add Task'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── TasksTab ─────────────────────────────────────────────────────────────────

export default function TasksTab() {
  const insets = useSafeAreaInsets();
  const [tasks, dispatch] = useReducer(tasksReducer, []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewDate, setViewDate] = useState(() => todayStr());
  const [showSheet, setShowSheet] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchTasks();
      dispatch({ type: 'set', tasks: data });
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  function tasksFor(personKey) {
    return tasks.filter(t => t.assigned_to === personKey && isTaskForDate(t, viewDate));
  }

  function totalPtsFor(personKey) {
    return tasks
      .filter(t => t.assigned_to === personKey)
      .reduce((sum, t) => {
        const days = Object.values(t.completion_status || {}).filter(Boolean).length;
        return sum + days * (t.points || 0);
      }, 0);
  }

  async function handleToggle(task) {
    const optimistic = {
      ...task,
      completion_status: { ...task.completion_status, [viewDate]: !isCompleteForDate(task, viewDate) },
    };
    dispatch({ type: 'update', task: optimistic });
    try {
      const saved = await toggleComplete(task, viewDate);
      dispatch({ type: 'update', task: saved });
    } catch {
      dispatch({ type: 'update', task });
    }
  }

  async function handleAdd(formData) {
    const saved = await addTask(formData);
    dispatch({ type: 'add', task: saved });
    setShowSheet(false);
  }

  function handleLongPress(task) {
    Alert.alert(
      'Delete Task',
      `Delete "${task.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            dispatch({ type: 'delete', id: task.id });
            try { await deleteTask(task.id); } catch {}
          },
        },
      ]
    );
  }

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      {/* Date nav */}
      <View style={styles.dateNav}>
        <TouchableOpacity style={styles.navBtn} onPress={() => setViewDate(d => offsetDate(d, -1))}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navCenter} onPress={() => setViewDate(todayStr())}>
          <Text style={styles.navLabel}>{formatDateNav(viewDate)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => setViewDate(d => offsetDate(d, 1))}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* 3-column grid */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={[styles.cols, { flex: 1 }]}>
          {PERSONS.map(col => {
            const colTasks = tasksFor(col.key);
            const pts = totalPtsFor(col.key);
            return (
              <View key={col.key} style={styles.col}>
                <View style={[styles.colHead, { backgroundColor: col.light }]}>
                  <PersonAvatar person={col} />
                  <Text style={[styles.colName, { color: col.color }]} numberOfLines={1}>{col.label.toUpperCase()}</Text>
                  {col.key !== 'marj' ? (
                    <Text style={[styles.colPts, { color: col.color }]}>{pts} pts</Text>
                  ) : (
                    <Text style={[styles.colPts, { color: 'transparent' }]}>0 pts</Text>
                  )}
                </View>

                {loading ? (
                  <ActivityIndicator size="small" color={col.color} style={{ marginTop: 14 }} />
                ) : colTasks.length === 0 ? (
                  <Text style={styles.emptyText}>No tasks</Text>
                ) : (
                  colTasks.map(task => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      viewDate={viewDate}
                      col={col}
                      onToggle={() => handleToggle(task)}
                      onLongPress={() => handleLongPress(task)}
                    />
                  ))
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: Math.max(insets.bottom, 16) + 16 }]}
        onPress={() => setShowSheet(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <AddTaskSheet
        visible={showSheet}
        defaultDate={viewDate}
        onClose={() => setShowSheet(false)}
        onSave={handleAdd}
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

  // Date nav
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  navBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrow: {
    fontSize: 24,
    color: COLORS.adrian,
    lineHeight: 28,
  },
  navCenter: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    fontFamily: FONTS.headingBold,
    fontSize: 15,
    letterSpacing: 0.5,
    color: COLORS.adrian,
  },

  // Grid
  scroll: { flex: 1 },
  cols: { flexDirection: 'row', flex: 1 },
  col: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    paddingBottom: 100,
  },
  colHead: {
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
    gap: 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarInitial: {
    width: 34, height: 34, borderRadius: 17,
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
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  colPts: {
    fontFamily: FONTS.body,
    fontSize: 9,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: FONTS.body,
    fontSize: 10,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 4,
  },

  // Task item
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 5,
    gap: 5,
    minHeight: 36,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkMark: {
    fontSize: 11,
    color: '#fff',
    fontFamily: FONTS.bodyMedium,
  },
  taskBody: { flex: 1 },
  taskTitle: {
    fontFamily: FONTS.body,
    fontSize: 10,
    color: COLORS.text,
    lineHeight: 14,
  },
  taskDone: {
    color: COLORS.textSecondary,
    textDecorationLine: 'line-through',
  },
  ptsBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  ptsText: {
    fontFamily: FONTS.body,
    fontSize: 9,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.family,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  fabText: {
    fontSize: 28,
    color: '#fff',
    lineHeight: 32,
    fontFamily: FONTS.body,
  },

  // Bottom sheet modal
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
    maxHeight: '92%',
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
    fontSize: 18,
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
    fontSize: 15,
    color: COLORS.text,
    minHeight: 44,
  },
  personRow: {
    flexDirection: 'row',
    gap: 8,
  },
  personBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  personBtnText: {
    fontFamily: FONTS.heading,
    fontSize: 12,
    letterSpacing: 0.2,
    color: COLORS.text,
  },
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
  errorText: {
    color: '#dc2626',
    fontFamily: FONTS.body,
    fontSize: 13,
    marginTop: 10,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
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
