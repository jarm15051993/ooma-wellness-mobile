// Redirect to the admin tab — this route is used by exitTenantSession()
import { Redirect } from 'expo-router'

export default function AdminSearchRedirect() {
  return <Redirect href="/(tabs)/admin" />
}
