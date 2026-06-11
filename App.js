import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import {
  JosefinSans_600SemiBold,
  JosefinSans_700Bold,
} from '@expo-google-fonts/josefin-sans';
import {
  DMSans_400Regular,
  DMSans_500Medium,
} from '@expo-google-fonts/dm-sans';

import { getIdentity, clearIdentity } from './src/identity';
import IdentitySelectScreen from './src/screens/IdentitySelectScreen';
import HomeTab from './src/tabs/HomeTab';
import CalendarTab from './src/tabs/CalendarTab';
import TasksTab from './src/tabs/TasksTab';
import MealsTab from './src/tabs/MealsTab';
import ChatTab from './src/tabs/ChatTab';
import { COLORS, getAccentColor } from './src/theme';

const Tab = createBottomTabNavigator();

const TAB_CONFIG = [
  { name: 'Home',     icon: 'home',                  Component: HomeTab },
  { name: 'Calendar', icon: 'calendar',               Component: CalendarTab },
  { name: 'Tasks',    icon: 'checkmark-circle',       Component: TasksTab },
  { name: 'Meals',    icon: 'restaurant',             Component: MealsTab },
  { name: 'Chat',     icon: 'chatbubble-ellipses',    Component: ChatTab },
];

export default function App() {
  const [identity, setIdentity] = useState(undefined); // undefined = loading

  const [fontsLoaded] = useFonts({
    JosefinSans_600SemiBold,
    JosefinSans_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
  });

  useEffect(() => {
    getIdentity().then((id) => setIdentity(id));
  }, []);

  // Still loading fonts or identity
  if (!fontsLoaded || identity === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.kath} />
      </View>
    );
  }

  // No identity chosen yet
  if (!identity) {
    return <IdentitySelectScreen onSelect={setIdentity} />;
  }

  const accent = getAccentColor(identity);

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => {
          const tab = TAB_CONFIG.find((t) => t.name === route.name);
          return {
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons
                name={focused ? tab.icon : `${tab.icon}-outline`}
                size={size}
                color={color}
              />
            ),
            tabBarActiveTintColor: accent,
            tabBarInactiveTintColor: COLORS.textSecondary,
            tabBarStyle: {
              backgroundColor: COLORS.background,
              borderTopColor: COLORS.border,
              height: 60,
              paddingBottom: 8,
            },
            tabBarLabelStyle: {
              fontFamily: 'JosefinSans_600SemiBold',
              fontSize: 10,
              letterSpacing: 0.3,
            },
            headerStyle: {
              backgroundColor: COLORS.background,
              borderBottomColor: COLORS.border,
              borderBottomWidth: 1,
              elevation: 0,
              shadowOpacity: 0,
            },
            headerTitleStyle: {
              fontFamily: 'JosefinSans_700Bold',
              fontSize: 18,
              color: COLORS.text,
              letterSpacing: 0.5,
            },
            headerRight: () => (
              <Ionicons
                name="person-circle-outline"
                size={28}
                color={accent}
                style={{ marginRight: 16 }}
                onPress={() => setIdentity(null)}
              />
            ),
          };
        }}
      >
        {TAB_CONFIG.map(({ name, Component }) => (
          <Tab.Screen
            key={name}
            name={name}
            children={() => <Component identity={identity} />}
          />
        ))}
      </Tab.Navigator>
    </NavigationContainer>
  );
}
