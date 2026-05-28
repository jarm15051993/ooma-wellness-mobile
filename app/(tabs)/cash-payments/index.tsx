import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, Modal, StyleSheet, RefreshControl,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { C, F } from '@/constants/theme'

type CashRequest = {
  id: string
  type: 'MEMBERSHIP' | 'SUBSCRIPTION' | 'ONE_TIME_CLASS'
  amount: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  requestedAt: string
  processedAt: string | null
  user: { name: string | null; lastName: string | null; email: string }
  package: { name: string } | null
}

function typeLabel(type: CashRequest['type']): string {
  if (type === 'MEMBERSHIP') return 'Membership'
  if (type === 'SUBSCRIPTION') return 'Package'
  return 'One-Time Class'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CashPaymentsScreen() {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const insets = useSafeAreaInsets()
  const [subTab, setSubTab] = useState<'pending' | 'processed'>('pending')
  const [requests, setRequests] = useState<CashRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [confirm, setConfirm] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null)
  const [processing, setProcessing] = useState(false)

  const fetchRequests = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { data } = await api.get('/api/admin/cash-payments')
      setRequests(data.requests ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchRequests(true)
  }, [fetchRequests])

  const handleAction = async () => {
    if (!confirm) return
    setProcessing(true)
    try {
      await api.post(`/api/admin/cash-payments/${confirm.id}/${confirm.action}`, {})
      fetchRequests(true)
    } catch {
      // ignore
    } finally {
      setProcessing(false)
      setConfirm(null)
    }
  }

  const visible = requests.filter(r =>
    subTab === 'pending' ? r.status === 'PENDING' : r.status !== 'PENDING'
  )

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.titleRow}>
          <Text style={s.title}>{t('cashPayments.title')}</Text>
          <TouchableOpacity style={s.signOutBtn} onPress={signOut}>
            <Text style={s.signOutText}>SIGN OUT</Text>
          </TouchableOpacity>
        </View>

        <View style={s.subTabs}>
          {(['pending', 'processed'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[s.subTab, subTab === tab && s.subTabActive]}
              onPress={() => setSubTab(tab)}
            >
              <Text style={[s.subTabText, subTab === tab && s.subTabTextActive]}>
                {t(`cashPayments.${tab}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={C.burg} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.burg} />}
          ListEmptyComponent={
            <Text style={s.empty}>{t('cashPayments.empty')}</Text>
          }
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.cardTop}>
                <Text style={s.userName}>
                  {[item.user.name, item.user.lastName].filter(Boolean).join(' ') || item.user.email}
                </Text>
                {subTab === 'processed' && (
                  <View style={[s.badge, item.status === 'APPROVED' ? s.badgeApproved : s.badgeRejected]}>
                    <Text style={s.badgeText}>{t(`cashPayments.status.${item.status.toLowerCase()}`)}</Text>
                  </View>
                )}
              </View>
              <Text style={s.cardSub}>{item.user.email}</Text>
              <Text style={s.cardDetail}>
                {typeLabel(item.type)}{item.package ? ` · ${item.package.name}` : ''}
              </Text>
              <View style={s.cardBottom}>
                <Text style={s.amount}>€{item.amount.toFixed(2)}</Text>
                <Text style={s.date}>{formatDate(item.requestedAt)}</Text>
              </View>
              {subTab === 'pending' && (
                <View style={s.actions}>
                  <TouchableOpacity
                    style={s.approveBtn}
                    onPress={() => setConfirm({ id: item.id, action: 'approve' })}
                  >
                    <Text style={s.approveBtnText}>{t('cashPayments.approve')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.rejectBtn}
                    onPress={() => setConfirm({ id: item.id, action: 'reject' })}
                  >
                    <Text style={s.rejectBtnText}>{t('cashPayments.reject')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        />
      )}

      <Modal visible={!!confirm} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>
              {confirm?.action === 'approve' ? t('cashPayments.confirmApprove') : t('cashPayments.confirmReject')}
            </Text>
            <TouchableOpacity
              style={[s.sheetBtn, confirm?.action === 'approve' ? s.sheetBtnApprove : s.sheetBtnReject]}
              onPress={handleAction}
              disabled={processing}
            >
              {processing
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.sheetBtnText}>
                    {confirm?.action === 'approve' ? t('cashPayments.approve') : t('cashPayments.reject')}
                  </Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetCancel} onPress={() => setConfirm(null)} disabled={processing}>
              <Text style={s.sheetCancelText}>{t('cashPayments.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontFamily: F.serif, fontSize: 32, color: C.ink },
  signOutBtn: { backgroundColor: '#8B1A1A', borderRadius: 4, paddingHorizontal: 10, paddingVertical: 6 },
  signOutText: { fontFamily: F.sansMed, fontSize: 10, color: '#fff', letterSpacing: 1 },
  subTabs: { flexDirection: 'row', gap: 8 },
  subTab: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: C.rule,
  },
  subTabActive: { backgroundColor: C.ink, borderColor: C.ink },
  subTabText: { fontFamily: F.sansMed, fontSize: 13, color: C.midGray },
  subTabTextActive: { color: C.warmWhite ?? '#FAFAF7' },
  list: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 12 },
  empty: { fontFamily: F.sans, fontSize: 14, color: C.midGray, textAlign: 'center', marginTop: 32 },
  card: {
    backgroundColor: C.warmWhite ?? '#FAFAF7',
    borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: C.rule,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  userName: { fontFamily: F.sansMed, fontSize: 15, color: C.ink, flex: 1 },
  cardSub: { fontFamily: F.sans, fontSize: 12, color: C.midGray, marginBottom: 4 },
  cardDetail: { fontFamily: F.sans, fontSize: 13, color: C.ink, marginBottom: 8 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontFamily: F.sansMed, fontSize: 16, color: C.ink },
  date: { fontFamily: F.sans, fontSize: 12, color: C.midGray },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeApproved: { backgroundColor: '#dcfce7' },
  badgeRejected: { backgroundColor: '#fee2e2' },
  badgeText: { fontFamily: F.sansMed, fontSize: 11, color: C.ink },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  approveBtn: {
    flex: 1, backgroundColor: C.ink,
    paddingVertical: 10, borderRadius: 8, alignItems: 'center',
  },
  approveBtnText: { fontFamily: F.sansMed, fontSize: 13, color: '#fff' },
  rejectBtn: {
    flex: 1, borderWidth: 1, borderColor: C.rule,
    paddingVertical: 10, borderRadius: 8, alignItems: 'center',
  },
  rejectBtnText: { fontFamily: F.sansMed, fontSize: 13, color: C.ink },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.cream, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 28, gap: 12 },
  sheetTitle: { fontFamily: F.serifReg, fontSize: 22, color: C.ink },
  sheetBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  sheetBtnApprove: { backgroundColor: C.ink },
  sheetBtnReject: { backgroundColor: C.burg ?? '#8B1A1A' },
  sheetBtnText: { fontFamily: F.sansMed, fontSize: 14, color: '#fff', letterSpacing: 0.5 },
  sheetCancel: { borderWidth: 1, borderColor: C.rule, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  sheetCancelText: { fontFamily: F.sansMed, fontSize: 14, color: C.ink },
})
