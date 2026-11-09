import { useLocalSearchParams } from 'expo-router';
import { resources, type Resource } from '@ecogrowth/contracts';
import { Text } from 'react-native';
import Records from '../../src/Records';
export default function ResourceScreen(){const {resource}=useLocalSearchParams<{resource:string}>();return resources.includes(resource as Resource)?<Records resource={resource as Resource}/>:<Text>Section not found.</Text>;}
