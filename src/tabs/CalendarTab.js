import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useIdentity } from '../contexts/IdentityContext';
import { COLORS, FONTS, getAccentColor } from '../theme';

export default function CalendarTab() {
  const { identity } = useIdentity();
  const accent = getAccentColor(identity);
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: accent }]}>Calendar</Text>
      <Text style={styles.sub}>Coming in Phase D.5</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: FONTS.headingBold, fontSize: 24, letterSpacing: 1 },
  sub: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.textSecondary, marginTop: 8 },
});
