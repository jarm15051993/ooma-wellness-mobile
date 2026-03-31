// Redirect to the students tab — this route is used by exitTenantSession()
import { Redirect } from 'expo-router'

export default function AdminSearchRedirect() {
  return <Redirect href="/(tabs)/students" />
}
