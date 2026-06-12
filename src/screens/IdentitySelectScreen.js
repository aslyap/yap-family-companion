import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useIdentity } from '../contexts/IdentityContext';
import { COLORS, FONTS } from '../theme';

export default function IdentitySelectScreen() {
  const { chooseIdentity } = useIdentity();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.appName}>Yap Family</Text>
        <Text style={styles.prompt}>Who are you?</Text>

        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: COLORS.kath }]}
            onPress={() => chooseIdentity('kath')}
            activeOpacity={0.85}
          >
            <Text style={styles.cardMain}>Mum</Text>
            <Text style={styles.cardSub}>Kath</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, { backgroundColor: COLORS.adrian }]}
            onPress={() => chooseIdentity('adrian')}
            activeOpacity={0.85}
          >
            <Text style={styles.cardMain}>Dad</Text>
            <Text style={styles.cardSub}>Adrian</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 20,
  },
  appName: {
    fontFamily: FONTS.headingBold,
    fontSize: 32,
    color: COLORS.text,
    letterSpacing: 1,
  },
  prompt: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
    marginTop: 8,
  },
  card: {
    flex: 1,
    minHeight: 180,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  cardMain: {
    fontFamily: FONTS.headingBold,
    fontSize: 28,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  cardSub: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
});
