import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIdentity } from '../contexts/IdentityContext';
import { COLORS, FONTS, getAccentColor } from '../theme';
import { BACKEND_URL } from '../config';
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '../services/calendarWriteService';
import { addTask, deleteTask } from '../services/tasksService';
import { upsertMeal } from '../services/mealsService';
import { supabase } from '../services/supabaseClient';

// ─── id counter ───────────────────────────────────────────────────────────────

let _uid = Date.now();
function uid() { return ++_uid; }

// ─── helpers ──────────────────────────────────────────────────────────────────

function toISO(date, hhmm) {
  return `${date}T${hhmm}:00+08:00`;
}

function toolColor(name) {
  if (name.startsWith('delete')) return '#E74C3C';
  if (name.startsWith('edit') || name.startsWith('complete')) return COLORS.timeIndicator;
  return '#27AE60';
}

function isDashed(name) {
  return name.startsWith('add') || name.startsWith('set');
}

function toolLabel(name) {
  return name.replace(/_/g, ' ').toUpperCase();
}

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function toolDetail(name, inp) {
  switch (name) {
    case 'add_calendar_event':
      return [
        inp.title,
        (inp.persons || []).map(cap).join(' · '),
        `${inp.date}  ·  ${inp.startTime}–${inp.endTime}`,
        inp.location || null,
      ].filter(Boolean);
    case 'edit_calendar_event':
      return [
        `Calendar: ${cap(inp.person)}`,
        inp.title ? `Title: ${inp.title}` : null,
        inp.startISO ? `Start: ${inp.startISO.slice(0, 16).replace('T', '  ')}` : null,
        inp.location ? `Location: ${inp.location}` : null,
      ].filter(Boolean);
    case 'delete_calendar_event':
      return [`Calendar: ${cap(inp.person)}`];
    case 'add_task':
      return [
        inp.title,
        `For: ${cap(inp.assignedTo)}${inp.points ? `  ·  ${inp.points} pts` : ''}`,
        inp.recurring ? `Repeats: ${inp.recurrenceRule || 'daily'}` : (inp.oneOffDate || null),
      ].filter(Boolean);
    case 'complete_task':
      return [`Date: ${inp.dateStr}`];
    case 'delete_task':
      return [`Task: ${String(inp.taskId).slice(0, 8)}…`];
    case 'set_meal':
      return [
        inp.dishName,
        `${cap(inp.mealType)}  ·  ${cap(inp.person)}  ·  ${inp.date}`,
      ];
    case 'delete_meal':
      return [`${cap(inp.mealType)}  ·  ${cap(inp.person)}  ·  ${inp.date}`];
    default:
      return [JSON.stringify(inp)];
  }
}

async function runTool(name, inp) {
  switch (name) {
    case 'add_calendar_event':
      await createCalendarEvent({
        persons: inp.persons,
        title: inp.title,
        startISO: toISO(inp.date, inp.startTime),
        endISO: toISO(inp.date, inp.endTime),
        location: inp.location || '',
      });
      return 'Event added';

    case 'edit_calendar_event':
      await updateCalendarEvent({
        eventId: inp.eventId,
        person: inp.person,
        title: inp.title,
        startISO: inp.startISO,
        endISO: inp.endISO,
        location: inp.location,
      });
      return 'Event updated';

    case 'delete_calendar_event':
      await deleteCalendarEvent({ eventId: inp.eventId, person: inp.person });
      return 'Event deleted';

    case 'add_task':
      await addTask({
        assigned_to: inp.assignedTo,
        title: inp.title,
        points: inp.points || 0,
        recurring: inp.recurring || false,
        recurrence_rule: inp.recurrenceRule || null,
        one_off_date: inp.oneOffDate || null,
      });
      return 'Task added';

    case 'complete_task': {
      const { data } = await supabase.from('tasks').select('completion_status').eq('id', inp.taskId).single();
      if (data) {
        await supabase.from('tasks')
          .update({ completion_status: { ...(data.completion_status || {}), [inp.dateStr]: true } })
          .eq('id', inp.taskId);
      }
      return 'Task completed';
    }

    case 'delete_task':
      await deleteTask(inp.taskId);
      return 'Task deleted';

    case 'set_meal':
      await upsertMeal({ date: inp.date, meal_type: inp.mealType, person: inp.person, dish_name: inp.dishName });
      return 'Meal set';

    case 'delete_meal': {
      const { data } = await supabase.from('meals').select('id')
        .eq('date', inp.date).eq('meal_type', inp.mealType).eq('person', inp.person)
        .maybeSingle();
      if (data) await supabase.from('meals').delete().eq('id', data.id);
      return 'Meal deleted';
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const WELCOME = 'Hi! I can help you manage the family calendar, tasks and meals.\n\nTry: "Add dentist for Maddie this Saturday at 10am" or "Set dinner to chicken rice tonight for the family".';

// ─── ConfirmCard ──────────────────────────────────────────────────────────────

function ConfirmCard({ msg, onConfirm, onCancel }) {
  const col = toolColor(msg.toolName);
  const done = msg.status !== 'pending';

  if (done) {
    return (
      <View style={[styles.cardDone, { borderColor: col }]}>
        <Text style={[styles.cardDoneLabel, { color: col }]}>{toolLabel(msg.toolName)}</Text>
        <Text style={styles.cardDoneStatus}>{msg.status === 'confirmed' ? '✓ Done' : '✗ Cancelled'}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { borderColor: col, borderStyle: isDashed(msg.toolName) ? 'dashed' : 'solid' }]}>
      <Text style={[styles.cardLabel, { color: col }]}>{toolLabel(msg.toolName)}</Text>
      {toolDetail(msg.toolName, msg.input).map((line, i) => (
        <Text key={i} style={styles.cardDetail}>{line}</Text>
      ))}
      <View style={styles.cardBtns}>
        <TouchableOpacity
          style={[styles.btnConfirm, { backgroundColor: col }]}
          onPress={() => onConfirm(msg)}
          activeOpacity={0.8}
        >
          <Text style={styles.btnConfirmTxt}>CONFIRM</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnCancel, { borderColor: col }]}
          onPress={() => onCancel(msg)}
          activeOpacity={0.8}
        >
          <Text style={[styles.btnCancelTxt, { color: col }]}>CANCEL</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── ChatTab ──────────────────────────────────────────────────────────────────

export default function ChatTab() {
  const insets = useSafeAreaInsets();
  const { identity } = useIdentity();
  const accent = getAccentColor(identity);
  const scrollRef = useRef(null);

  const [msgs, setMsgs]       = useState([{ id: uid(), type: 'bot', text: WELCOME }]);
  const [history, setHistory] = useState([]);
  const [input, setInput]     = useState('');
  const [busy, setBusy]       = useState(false);

  function scrollDown() {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }

  function append(...items) {
    setMsgs(prev => [...prev, ...items]);
    scrollDown();
  }

  function patchCard(id, status) {
    setMsgs(prev => prev.map(m => m.id === id ? { ...m, status } : m));
  }

  async function callClaude(hist) {
    const res = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: hist.slice(-40) }),
    });
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    return res.json();
  }

  function ingestResponse(resp, baseHistory) {
    const newHistory = [...baseHistory, { role: resp.role, content: resp.content }];
    setHistory(newHistory);
    const items = [];
    for (const blk of resp.content) {
      if (blk.type === 'text' && blk.text.trim())
        items.push({ id: uid(), type: 'bot', text: blk.text.trim() });
      if (blk.type === 'tool_use')
        items.push({ id: uid(), type: 'card', toolUseId: blk.id, toolName: blk.name, input: blk.input, status: 'pending' });
    }
    if (items.length) append(...items);
    return newHistory;
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    if (msgs.some(m => m.type === 'card' && m.status === 'pending')) {
      Alert.alert('Action pending', 'Please confirm or cancel the pending action first.');
      return;
    }

    setInput('');
    setBusy(true);
    append({ id: uid(), type: 'me', text });

    const newHistory = [...history, { role: 'user', content: text }];
    try {
      const resp = await callClaude(newHistory);
      ingestResponse(resp, newHistory);
    } catch (e) {
      append({ id: uid(), type: 'bot', text: 'Sorry, something went wrong. Please try again.' });
      console.warn('[chat]', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(card) {
    patchCard(card.id, 'confirmed');
    setBusy(true);
    try {
      const result = await runTool(card.toolName, card.input);
      append({ id: uid(), type: 'bot', text: `Done! ${result}.` });
      setHistory(prev => [
        ...prev,
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: card.toolUseId, content: result }] },
      ]);
    } catch (e) {
      append({ id: uid(), type: 'bot', text: `Sorry, that didn't work: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function cancel(card) {
    patchCard(card.id, 'cancelled');
    setBusy(true);
    const toolResult = {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: card.toolUseId, content: "User cancelled. Please ask what they'd like to change." }],
    };
    const newHistory = [...history, toolResult];
    try {
      const resp = await callClaude(newHistory);
      ingestResponse(resp, newHistory);
    } catch {
      append({ id: uid(), type: 'bot', text: "What would you like to change?" });
      setHistory(newHistory);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 52 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {msgs.map(m => {
          if (m.type === 'me') return (
            <View key={m.id} style={styles.meRow}>
              <View style={[styles.meBubble, { backgroundColor: accent }]}>
                <Text style={styles.meTxt}>{m.text}</Text>
              </View>
            </View>
          );
          if (m.type === 'bot') return (
            <View key={m.id} style={styles.botRow}>
              <View style={styles.botBubble}>
                <Text style={styles.botTxt}>{m.text}</Text>
              </View>
            </View>
          );
          if (m.type === 'card') return (
            <ConfirmCard key={m.id} msg={m} onConfirm={confirm} onCancel={cancel} />
          );
          return null;
        })}

        {busy && (
          <View style={styles.botRow}>
            <View style={[styles.botBubble, styles.botBubbleLoader]}>
              <ActivityIndicator size="small" color={COLORS.timeIndicator} />
            </View>
          </View>
        )}

        <View style={{ height: 8 }} />
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: 8 }]}>
        <TouchableOpacity
          style={styles.micBtn}
          activeOpacity={0.7}
          onPress={() => Alert.alert('Voice input', 'Coming soon!')}
        >
          <Text style={{ fontSize: 18 }}>🎙</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.inp}
          value={input}
          onChangeText={setInput}
          placeholder="Ask the family assistant…"
          placeholderTextColor={COLORS.textSecondary}
          multiline
          maxLength={500}
          onSubmitEditing={send}
          blurOnSubmit
        />

        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: accent }, (!input.trim() || busy) && styles.sendDisabled]}
          onPress={send}
          disabled={!input.trim() || busy}
          activeOpacity={0.8}
        >
          <Text style={styles.sendTxt}>→</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: COLORS.background },
  scroll:  { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 12 },

  // User bubble (right-aligned, accent colour)
  meRow:    { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  meBubble: { borderRadius: 16, borderBottomRightRadius: 3, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '78%' },
  meTxt:    { fontFamily: FONTS.body, fontSize: 14, color: '#fff', lineHeight: 20 },

  // Assistant bubble (left-aligned)
  botRow:    { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 8 },
  botBubble: { backgroundColor: COLORS.surface, borderRadius: 16, borderBottomLeftRadius: 3, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '82%' },
  botBubbleLoader: { paddingHorizontal: 18, paddingVertical: 12 },
  botTxt:    { fontFamily: FONTS.body, fontSize: 14, color: COLORS.text, lineHeight: 20 },

  // Confirmation card (pending)
  card:       { borderWidth: 1.5, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardLabel:  { fontFamily: FONTS.headingBold, fontSize: 11, letterSpacing: 1.2, marginBottom: 6 },
  cardDetail: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.text, lineHeight: 19, marginBottom: 1 },
  cardBtns:   { flexDirection: 'row', gap: 8, marginTop: 12 },
  btnConfirm:    { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnConfirmTxt: { fontFamily: FONTS.headingBold, fontSize: 12, letterSpacing: 0.8, color: '#fff' },
  btnCancel:    { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, alignItems: 'center' },
  btnCancelTxt: { fontFamily: FONTS.headingBold, fontSize: 12, letterSpacing: 0.8 },

  // Confirmation card (done)
  cardDone:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, opacity: 0.55 },
  cardDoneLabel:  { fontFamily: FONTS.heading, fontSize: 10, letterSpacing: 1 },
  cardDoneStatus: { fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.textSecondary },

  // Input bar
  bar:     { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background, gap: 8 },
  micBtn:  { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  inp:     { flex: 1, fontFamily: FONTS.body, fontSize: 15, color: COLORS.text, backgroundColor: COLORS.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 100, lineHeight: 20 },
  sendBtn:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sendDisabled: { opacity: 0.35 },
  sendTxt:     { fontSize: 18, color: '#fff', fontFamily: FONTS.body, lineHeight: 22 },
});
