// ============================================================
// Balderton Badminton Club — Admin Dashboard
// ============================================================

const { createApp, ref, computed, onMounted } = Vue;

// ============================================================
// CONFIG
// ============================================================
const API_URL = 'https://script.google.com/macros/s/AKfycbwP3uqxzkQmv-3V2lXV-IY2PKvUkwUB-6dIcVxU1L8PnAkVEwBPRSPDB3k6hWAuZGUx/exec';
// Admin password is stored in Apps Script (Code.gs) as ADMIN_PASSWORD constant
// Here we just collect it and send it with admin requests for verification

createApp({
  setup() {
    const authed = ref(false);
    const passwordInput = ref('');
    const loginError = ref('');
    const adminPw = ref('');

    const loading = ref(true);
    const error = ref(null);
    const members = ref([]);
    const sessions = ref([]);
    const attendance = ref([]);
    const activity = ref([]);
    const lastSync = ref('');

    const showAddSession = ref(false);
    const showAddMember = ref(false);
    const modalSubmitting = ref(false);
    const modalError = ref('');

    const newSession = ref({ title: '', date: '', time: '', court: '', location: '', max_spots: 12 });
    const newMember = ref({ name: '' });

    // ----- Login -----
    async function login() {
      loginError.value = '';
      // Test by fetching with pw param
      try {
        const res = await fetch(API_URL + '?pw=' + encodeURIComponent(passwordInput.value));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data.error === 'invalid_password') {
          loginError.value = 'Wrong password.';
          return;
        }
        members.value = data.members || [];
        sessions.value = data.sessions || [];
        attendance.value = data.attendance || [];
        activity.value = data.activity || [];
        adminPw.value = passwordInput.value;
        authed.value = true;
        lastSync.value = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        loading.value = false;
      } catch (e) {
        if (API_URL === 'PASTE_APPS_SCRIPT_WEB_APP_URL_HERE') {
          loginError.value = 'API URL not configured. Ask Hermes to set it.';
        } else {
          loginError.value = 'Could not connect: ' + e.message;
        }
      }
    }

    // ----- Computed -----
    const sessionsThisWeek = computed(() => {
      const weekStart = getWeekStart();
      const weekEnd = getWeekEnd();
      return sessions.value
        .filter(s => s.date >= weekStart && s.date <= weekEnd)
        .sort((a, b) => a.date.localeCompare(b.date));
    });

    const thisWeekLabel = computed(() => {
      const ws = getWeekStart();
      const we = getWeekEnd();
      return formatFullDate(ws) + ' – ' + formatFullDate(we);
    });

    const last12Sessions = computed(() => {
      const today = new Date().toISOString().split('T')[0];
      return sessions.value
        .filter(s => s.date <= today)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 12)
        .reverse();
    });

    const optionA = computed(() => {
      const courts = sessionsThisWeek.value.reduce((sum, s) => sum + getRecommendedCourts(getYesCount(s.id)), 0);
      return { courts, cost: courts * 24 };
    });

    const optionB = computed(() => {
      const courts = sessionsThisWeek.value.length * 3;
      return { courts, cost: courts * 24 };
    });

    const optionC = computed(() => {
      const courts = sessionsThisWeek.value.length * 4;
      return { courts, cost: courts * 24 };
    });

    const avgAttendance = computed(() => {
      const recent = last12Sessions.value.slice(-4);
      if (recent.length === 0) return 0;
      const total = recent.reduce((sum, s) => sum + (getYesCount(s.id) / s.max_spots), 0);
      return Math.round((total / recent.length) * 100);
    });

    // ----- Helpers -----
    function getRecommendedCourts(yesCount) {
      return Math.ceil(yesCount / 4);
    }
    function getBadgeClass(yesCount) {
      const courts = getRecommendedCourts(yesCount);
      if (courts === 1) return 'bg-emerald-100 text-emerald-800';
      if (courts === 2) return 'bg-emerald-100 text-emerald-800';
      if (courts === 3) return 'bg-amber-100 text-amber-800';
      return 'bg-red-100 text-red-800';
    }
    function getYesCount(sessionId) {
      return attendance.value.filter(a => a.session_id === sessionId && a.status === 'yes').length;
    }
    function getMemberName(id) {
      const m = members.value.find(x => x.id === id);
      return m ? m.name : id;
    }
    function initials(name) {
      return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
    }
    function getHeatmapClass(memberId, sessionId) {
      const a = attendance.value.find(x => x.member_id === memberId && x.session_id === sessionId);
      if (!a) return 'bg-gray-100';
      const pct = getYesCount(sessionId) / sessions.value.find(s => s.id === sessionId)?.max_spots;
      if (a.status === 'no') return 'bg-red-100';
      if (a.status === 'maybe') return 'bg-amber-100';
      // yes — color by session fill rate
      if (pct >= 0.85) return 'bg-emerald-800';
      if (pct >= 0.7) return 'bg-emerald-500';
      if (pct >= 0.5) return 'bg-emerald-300';
      return 'bg-emerald-100';
    }
    function getWeekStart() {
      const d = new Date();
      const day = d.getDay() || 7; // Mon=1, Sun=7
      d.setDate(d.getDate() - day + 1);
      return d.toISOString().split('T')[0];
    }
    function getWeekEnd() {
      const d = new Date();
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - day + 7);
      return d.toISOString().split('T')[0];
    }

    // ----- Date formatters (UK) -----
    function formatDay(dateStr) {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
    }
    function formatNum(dateStr) {
      return new Date(dateStr + 'T00:00:00').getDate();
    }
    function formatMonth(dateStr) {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' });
    }
    function formatMonthNum(dateStr) {
      return (new Date(dateStr + 'T00:00:00').getMonth() + 1).toString().padStart(2, '0');
    }
    function formatFullDate(dateStrOrSessionId) {
      // If it's a session_id (s01 etc), look up
      let dateStr = dateStrOrSessionId;
      if (dateStrOrSessionId.startsWith('s')) {
        const s = sessions.value.find(x => x.id === dateStrOrSessionId);
        if (s) dateStr = s.date;
        else return dateStrOrSessionId;
      }
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    }
    function formatTime(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      const now = new Date();
      const diffMs = now - d;
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'just now';
      if (diffMin < 60) return diffMin + ' min ago';
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return diffHr + ' hr ago';
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }

    // ----- API calls -----
    async function refresh() {
      try {
        const res = await fetch(API_URL + '?pw=' + encodeURIComponent(adminPw.value));
        const data = await res.json();
        if (data.error === 'invalid_password') {
          authed.value = false;
          return;
        }
        members.value = data.members || [];
        sessions.value = data.sessions || [];
        attendance.value = data.attendance || [];
        activity.value = data.activity || [];
        lastSync.value = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        // silent
      }
    }

    async function addSession() {
      modalError.value = '';
      modalSubmitting.value = true;
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'add_session',
            admin_pw: adminPw.value,
            ...newSession.value,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed');
        showAddSession.value = false;
        newSession.value = { title: '', date: '', time: '', court: '', location: '', max_spots: 12 };
        await refresh();
      } catch (e) {
        modalError.value = e.message;
      } finally {
        modalSubmitting.value = false;
      }
    }

    async function addMember() {
      modalError.value = '';
      modalSubmitting.value = true;
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'add_member',
            admin_pw: adminPw.value,
            name: newMember.value.name,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed');
        showAddMember.value = false;
        newMember.value = { name: '' };
        await refresh();
      } catch (e) {
        modalError.value = e.message;
      } finally {
        modalSubmitting.value = false;
      }
    }

    onMounted(() => {
      if (authed.value) {
        // Refresh every 60s
        setInterval(refresh, 60000);
      }
    });

    return {
      authed, passwordInput, loginError, login,
      loading, error,
      members, sessions, attendance, activity, lastSync,
      sessionsThisWeek, thisWeekLabel, last12Sessions,
      optionA, optionB, optionC, avgAttendance,
      showAddSession, showAddMember, modalSubmitting, modalError,
      newSession, newMember, addSession, addMember,
      getRecommendedCourts, getBadgeClass, getYesCount, getMemberName,
      initials, getHeatmapClass,
      formatDay, formatNum, formatMonth, formatMonthNum, formatFullDate, formatTime,
    };
  }
}).mount('#app');
