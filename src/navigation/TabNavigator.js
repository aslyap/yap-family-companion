import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIdentity } from '../contexts/IdentityContext';
import HomeTab from '../tabs/HomeTab';
import CalendarTab from '../tabs/CalendarTab';
import TasksTab from '../tabs/TasksTab';
import MealsTab from '../tabs/MealsTab';
import ChatTab from '../tabs/ChatTab';
import { COLORS, getAccentColor } from '../theme';

const Tab = createBottomTabNavigator();

const TAB_CONFIG = [
  { name: 'Home',     icon: 'home',                Component: HomeTab },
  { name: 'Calendar', icon: 'calendar',             Component: CalendarTab },
  { name: 'Tasks',    icon: 'checkmark-circle',     Component: TasksTab },
  { name: 'Meals',    icon: 'restaurant',           Component: MealsTab },
  { name: 'Chat',     icon: 'chatbubble-ellipses',  Component: ChatTab },
];

export default function TabNavigator() {
  const { identity, clearIdentity } = useIdentity();
  const accent = getAccentColor(identity);
  const insets = useSafeAreaInsets();

  return (
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
            backgroundColor: COLORS.surface,
            borderTopColor: COLORS.border,
          },
          tabBarLabelStyle: {
            fontFamily: 'Figtree_700Bold',
            fontSize: 10,
            letterSpacing: 0.3,
          },
          headerStyle: {
            backgroundColor: COLORS.surface,
            borderBottomColor: COLORS.border,
            borderBottomWidth: 1,
            elevation: 0,
            shadowOpacity: 0,
            height: insets.top + 52,
          },
          headerTitleStyle: {
            fontFamily: 'Figtree_700Bold',
            fontSize: 18,
            color: COLORS.text,
            letterSpacing: 0.3,
          },
          headerTitleAlign: 'center',
          headerRight: () => (
            <Ionicons
              name="person-circle-outline"
              size={28}
              color={accent}
              style={{ marginRight: 16 }}
              onPress={clearIdentity}
            />
          ),
        };
      }}
    >
      {TAB_CONFIG.map(({ name, Component }) => (
        <Tab.Screen
          key={name}
          name={name}
          component={Component}
          options={name === 'Home' ? { headerShown: false } : undefined}
        />
      ))}
    </Tab.Navigator>
  );
}
