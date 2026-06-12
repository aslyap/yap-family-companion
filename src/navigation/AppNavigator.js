import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useIdentity } from '../contexts/IdentityContext';
import IdentitySelectScreen from '../screens/IdentitySelectScreen';
import TabNavigator from './TabNavigator';
import { COLORS } from '../theme';

export default function AppNavigator() {
  const { identity } = useIdentity();

  if (identity === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.kath} />
      </View>
    );
  }

  if (!identity) {
    return <IdentitySelectScreen />;
  }

  return (
    <NavigationContainer>
      <TabNavigator />
    </NavigationContainer>
  );
}
