import { Stack, Tabs } from 'expo-router';
import React from 'react';
import { ImageBackground, Platform, Text, View } from 'react-native';

export default function TabLayout() {

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#11a5f6',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerTitle: "Braille control center",
      }}>

      <Stack.Screen name="index" />
    </Stack>
  );
}
