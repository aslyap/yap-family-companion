import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { setIdentity } from '../identity';
import { COLORS, FONTS } from '../theme';

export default function IdentitySelectScreen({ onSelect }) {
  const handleSelect = async (identity) => {
    await setIdentity(identity);
    onSelect(identity);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.appName}>Yap Family</Text>
        <Text style={styles.prompt}>Who are you?</Text>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: COLORS.kath }]}
          onPress={() => handleSelect('kath')}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>Kath</Text>
          <Text style={styles.btnSub}>Mum</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: COLORS.adrian }]}
          onPress={() => handleSelect('adrian')}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>Adrian</Text>
          <Text style={styles.btnSub}>Dad</Text>
        </TouchableOpacity>
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
    paddingHorizontal: 40,
    gap: 16,
  },
  appName: {
    fontFamily: FONTS.headingBold,
    fontSize: 32,
    color: COLORS.text,
    marginBottom: 8,
    letterSpacing: 1,
  },
  prompt: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  btn: {
    width: '100%',
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  btnText: {
    fontFamily: FONTS.headingBold,
    fontSize: 24,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  btnSub: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
});
