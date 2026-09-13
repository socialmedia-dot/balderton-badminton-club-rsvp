// Mock data for preview only — not used in production
const MOCK_MEMBERS = [
  { id: 'm01', name: 'Sarah Thompson', created_at: '2026-09-01' },
  { id: 'm02', name: 'James Mitchell', created_at: '2026-09-01' },
  { id: 'm03', name: 'Oliver Davies', created_at: '2026-09-01' },
  { id: 'm04', name: 'Emily Roberts', created_at: '2026-09-01' },
  { id: 'm05', name: 'Harry Patel', created_at: '2026-09-01' },
  { id: 'm06', name: 'Charlie Bennett', created_at: '2026-09-01' },
  { id: 'm07', name: 'Sophie Clarke', created_at: '2026-09-01' },
  { id: 'm08', name: 'Liam Walsh', created_at: '2026-09-01' },
  { id: 'm09', name: 'Ava Hughes', created_at: '2026-09-02' },
  { id: 'm10', name: 'Noah Foster', created_at: '2026-09-02' },
  { id: 'm11', name: 'Isabella Khan', created_at: '2026-09-03' },
  { id: 'm12', name: 'Ethan Murphy', created_at: '2026-09-03' },
];

// Generate sessions: 3 per week for past 4 weeks + this week
function generateMockSessions() {
  const sessions = [];
  const today = new Date('2026-09-14'); // fixed date for preview
  let id = 1;
  const templates = [
    { dow: 5, time: '20:00', title: 'Friday Night Social', max: 12 },
    { dow: 6, time: '10:00', title: 'Saturday Morning Drills', max: 10 },
    { dow: 0, time: '18:00', title: 'Sunday Evening Mixed Doubles', max: 12 },
  ];
  for (let week = -4; week <= 1; week++) {
    templates.forEach(t => {
      const d = new Date(today);
      const offset = ((t.dow - d.getDay() + 7) % 7);
      d.setDate(d.getDate() + week * 7 + offset);
      sessions.push({
        id: 's' + String(id).padStart(2, '0'),
        date: d.toISOString().split('T')[0],
        time: t.time,
        court: 'Court 1',
        location: 'Newark Leisure Centre',
        max_spots: t.max,
        title: t.title,
        created_at: '2026-09-01',
      });
      id++;
    });
  }
  return sessions;
}

const MOCK_SESSIONS = generateMockSessions();

// Mock attendance: random yes/no/maybe
function generateMockAttendance() {
  const attendance = [];
  const statuses = ['yes', 'yes', 'yes', 'yes', 'no', 'maybe'];
  MOCK_SESSIONS.forEach(s => {
    const fillRate = 0.5 + Math.random() * 0.5;
    const yesCount = Math.round(s.max_spots * fillRate);
    const shuffled = [...MOCK_MEMBERS].sort(() => Math.random() - 0.5);
    shuffled.slice(0, yesCount).forEach(m => {
      attendance.push({
        member_id: m.id,
        session_id: s.id,
        status: 'yes',
        updated_at: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
      });
    });
    // Add some no/maybe
    if (Math.random() > 0.5) {
      attendance.push({
        member_id: shuffled[yesCount]?.id || 'm01',
        session_id: s.id,
        status: 'no',
        updated_at: new Date().toISOString(),
      });
    }
  });
  return attendance;
}

const MOCK_ATTENDANCE = generateMockAttendance();

const MOCK_ACTIVITY = MOCK_ATTENDANCE.slice(-20).map((a, i) => ({
  timestamp: new Date(Date.now() - i * 600000).toISOString(),
  member_id: a.member_id,
  member_name: MOCK_MEMBERS.find(m => m.id === a.member_id)?.name,
  session_id: a.session_id,
  status: a.status,
  action: a.status === 'yes' ? 'in' : a.status === 'no' ? 'out' : 'maybe',
}));

window.MOCK_DATA = {
  members: MOCK_MEMBERS,
  sessions: MOCK_SESSIONS,
  attendance: MOCK_ATTENDANCE,
  activity: MOCK_ACTIVITY,
};
