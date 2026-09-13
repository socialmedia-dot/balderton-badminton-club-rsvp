// ============================================================
// Balderton Badminton Club — Member View
// ============================================================

const { createApp, ref, computed, onMounted } = Vue;

// ============================================================
// CONFIG: Hermes sets this URL after KC deploys Apps Script
// ============================================================
const API_URL = 'PASTE_APPS_SCRIPT_WEB_APP_URL_HERE';

createApp({
  setup() {
    const loading = ref(true);
    const error = ref(null);
    const members = ref([]);
    const sessions = ref([]);
    const attendance = ref([]);
    const currentMemberId = ref(localStorage.getItem('bbc_member_id') || '');
    const submitting = ref(false);
    const toast = ref({ sessionId: null, message: '', success: true });
    const lastSync = ref('');

    // ----- Computed -----
    const upcomingSessions = computed(() => {
      const today = new Date().toISOString().split('T')[0];
      return sessions.value
        .filter(s => s.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date));
    });

    const pastSessions = computed(() => {
      const today = new Date().toISOString().split('T')[0];
      return sessions.value
        .filter(s => s.date < today)
        .sort((a, b) => b.date.localeCompare(a.date));
    });

    // ----- Helpers -----
    function getYesCount(sessionId) {
      return attendance.value.filter(a => a.session_id === sessionId && a.status === 'yes').length;
    }
    function getNoCount(sessionId) {
      return attendance.value.filter(a => a.session_id === sessionId && a.status === 'no').length;
    }
    function getMaybeCount(sessionId) {
      return attendance.value.filter(a => a.session_id === sessionId && a.status === 'maybe').length;
    }
    function getMyStatus(sessionId) {
      const a = attendance.value.find(x => x.member_id === currentMemberId.value && x.session_id === sessionId);
      return a ? a.status : null;
    }

    // ----- Date formatters (UK) -----
    function formatDay(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-GB', { weekday: 'short' });
    }
    function formatNum(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      return d.getDate();
    }
    function formatMonth(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-GB', { month: 'short' });
    }
    function formatFullDate(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    }
    function isTomorrow(dateStr) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return dateStr === tomorrow.toISOString().split('T')[0];
    }

    // ----- API calls -----
    async function fetchAll() {
      if (API_URL === 'PASTE_APPS_SCRIPT_WEB_APP_URL_HERE') {
        error.value = 'API URL not configured. Ask Hermes to set it.';
        loading.value = false;
        return;
      }
      try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        members.value = data.members || [];
        sessions.value = data.sessions || [];
        attendance.value = data.attendance || [];
        lastSync.value = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        error.value = null;
      } catch (e) {
        error.value = 'Could not load data: ' + e.message;
      } finally {
        loading.value = false;
      }
    }

    async function rsvp(sessionId, status) {
      if (!currentMemberId.value || submitting.value) return;
      submitting.value = true;
      toast.value = { sessionId, message: '', success: true };
      try {
        const member = members.value.find(m => m.id === currentMemberId.value);
        const res = await fetch(API_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'rsvp',
            member_id: currentMemberId.value,
            member_name: member ? member.name : '',
            session_id: sessionId,
            status: status,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Unknown error');
        toast.value = { sessionId, message: `✓ Saved: ${status.toUpperCase()}`, success: true };
        await fetchAll();
      } catch (e) {
        toast.value = { sessionId, message: `✗ Failed: ${e.message}`, success: false };
      } finally {
        submitting.value = false;
        setTimeout(() => {
          if (toast.value.sessionId === sessionId) toast.value = { sessionId: null, message: '', success: true };
        }, 3000);
      }
    }

    function onMemberChange() {
      localStorage.setItem('bbc_member_id', currentMemberId.value);
    }

    onMounted(() => {
      fetchAll();
      // Refresh every 60s
      setInterval(fetchAll, 60000);
    });

    return {
      loading, error, members, sessions, attendance,
      currentMemberId, submitting, toast, lastSync,
      upcomingSessions, pastSessions,
      getYesCount, getNoCount, getMaybeCount, getMyStatus,
      formatDay, formatNum, formatMonth, formatFullDate, isTomorrow,
      rsvp, onMemberChange,
    };
  }
}).mount('#app');
