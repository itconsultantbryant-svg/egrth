import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '../src/client';
import { WorkspaceProvider } from '../src/context';
export default function Layout(){return <SafeAreaProvider><QueryClientProvider client={queryClient}><WorkspaceProvider><Stack screenOptions={{headerTintColor:'#166534',headerTitleStyle:{fontWeight:'600'},headerBackTitle:'Back'}}><Stack.Screen name="index" options={{headerShown:false}}/><Stack.Screen name="(tabs)" options={{headerShown:false}}/><Stack.Screen name="records/[resource]" options={{title:'Workspace records'}}/><Stack.Screen name="action" options={{title:'Authorized workflow',presentation:'modal'}}/></Stack></WorkspaceProvider></QueryClientProvider></SafeAreaProvider>;}
