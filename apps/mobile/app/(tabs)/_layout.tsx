import { Tabs, Redirect } from 'expo-router';
import { LayoutDashboard, Truck, Menu } from 'lucide-react-native';
import { useWorkspace } from '../../src/context';
import { can } from '@ecogrowth/domain';
export default function TabsLayout(){const w=useWorkspace();if(!w.loading&&!w.membership)return <Redirect href="/"/>;return <Tabs screenOptions={{tabBarActiveTintColor:'#166534',tabBarStyle:{minHeight:64},headerTintColor:'#166534'}}><Tabs.Screen name="index" options={{title:'Dashboard',tabBarIcon:({color,size})=><LayoutDashboard color={color} size={size}/>}}/><Tabs.Screen name="jobs" options={{title:'Jobs',href:w.membership&&can(w.membership.role,'jobs','read')?undefined:null,tabBarIcon:({color,size})=><Truck color={color} size={size}/>}}/><Tabs.Screen name="more" options={{title:'More',tabBarIcon:({color,size})=><Menu color={color} size={size}/>}}/></Tabs>;}
