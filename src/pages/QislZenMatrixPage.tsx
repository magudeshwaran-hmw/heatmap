/**
 * QislZenMatrixPage.tsx — employee self-rating for the QISL / QE-taxonomy skills.
 *
 * Same ZenMatrix look & feel as SkillMatrixPage, but the top selector is the
 * job FAMILIES (from qeSkillTaxonomy.ts) and each family's skills are shown
 * flattened (no group headings). Ratings (0–3) persist to the database via
 * /api/qisl-skills/:employeeId.
 */
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronLeft, Save, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { useDark, mkTheme } from '@/lib/themeContext';
import { QE_FAMILIES, groupsForFamily, essentialSkillsFor } from '@/lib/qeSkillTaxonomy';
import { apiGetQislSkills, apiSaveQislSkills } from '@/lib/api';

type Level = 0 | 1 | 2 | 3;
const LVL_LABEL: Record<number, string> = { 0: 'N/A', 1: 'Beginner', 2: 'Intermediate', 3: 'Expert' };
const FAM_COLORS = ['#3B82F6', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6'];

// Family → its skills, flattened across groups and de-duplicated (no group level).
const FAMILY_SKILLS: { family: string; color: string; skills: string[] }[] = QE_FAMILIES.map((fam, i) => {
  const seen = new Set<string>();
  const skills: string[] = [];
  groupsForFamily(fam).forEach(grp => essentialSkillsFor(fam, grp).forEach(sk => {
    if (!seen.has(sk)) { seen.add(sk); skills.push(sk); }
  }));
  return { family: fam, color: FAM_COLORS[i % FAM_COLORS.length], skills };
});
// Every distinct skill name across the whole taxonomy.
const ALL_SKILLS: string[] = Array.from(new Set(FAMILY_SKILLS.flatMap(f => f.skills)));

export default function QislZenMatrixPage({ isPopup = false, employeeId: employeeIdProp }: { isPopup?: boolean; employeeId?: string } = {}) {
  const navigate = useNavigate();
  const { employeeId: authEmployeeId } = useAuth();
  // In the admin preview popup the viewed employee is passed in as a prop.
  const employeeId = employeeIdProp || authEmployeeId;
  const { dark } = useDark();
  const T = mkTheme(dark);
  const LVL_COLOR: Record<number, string> = { 0: dark ? '#D1D5DB' : '#4B5563', 1: '#D97706', 2: '#2563EB', 3: '#059669' };

  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [activeIdx, setActiveIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load saved ratings from the database on mount.
  useEffect(() => {
    if (!employeeId || employeeId === 'new') { setLoading(false); return; }
    (async () => {
      try {
        const res = await apiGetQislSkills(employeeId);
        setRatings(res.ratings || {});
      } catch { /* keep empty — nothing rated yet */ }
      finally { setLoading(false); }
    })();
  }, [employeeId]);

  const activeFamily = FAMILY_SKILLS[activeIdx];
  const totalRated = useMemo(() => ALL_SKILLS.filter(s => (ratings[s] || 0) > 0).length, [ratings]);
  const completion = Math.round((totalRated / ALL_SKILLS.length) * 100);

  const famDone = (skills: string[]) => skills.filter(s => (ratings[s] || 0) > 0).length;

  const setLevel = (skill: string, level: Level) =>
    setRatings(prev => ({ ...prev, [skill]: level }));

  const handleSave = async () => {
    if (!employeeId || employeeId === 'new') { toast.error('Please sign in to save.'); return; }
    setSaving(true);
    try {
      await apiSaveQislSkills(employeeId, ratings);
      toast.success('QI SL ZenMatrix saved to database ✓');
    } catch (e: any) {
      toast.error('Could not save: ' + (e?.message || 'server error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: isPopup ? 'auto' : '100vh', background: T.bg, color: T.text, fontFamily: "'Inter', sans-serif", transition: 'background 0.35s, color 0.35s' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isPopup ? '8px 4px 40px' : '36px 24px 80px' }}>

        {/* Header */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!isPopup && (
              <button onClick={() => navigate('/employee/dashboard')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'transparent', border: `1px solid ${T.bdr}`, color: T.sub, cursor: 'pointer', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                <ChevronLeft size={15} /> Back
              </button>
            )}
            <div>
              <h1 style={{ fontSize: 'clamp(22px,3vw,28px)', fontWeight: 800, color: T.text, fontFamily: "'Space Grotesk',sans-serif", marginBottom: 4 }}>QI SL ZenMatrix</h1>
              <p style={{ color: T.sub, fontSize: 13 }}>Rate your proficiency across each job family's skills.</p>
            </div>
          </div>
          <button onClick={handleSave} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 9, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 0 20px rgba(59,130,246,0.35)', opacity: saving ? 0.7 : 1 }}>
            <Save size={15} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {/* Completion card */}
        <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 18, padding: 24, marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.sub }}>Overall Completion</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{totalRated} of {ALL_SKILLS.length} skills rated</div>
            </div>
            <span style={{ fontSize: 38, fontWeight: 800, fontFamily: "'Space Grotesk',sans-serif", backgroundImage: completion >= 75 ? 'linear-gradient(135deg,#10B981,#3B82F6)' : completion >= 50 ? 'linear-gradient(135deg,#3B82F6,#8B5CF6)' : 'linear-gradient(135deg,#F59E0B,#EF4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{completion}%</span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.10)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${completion}%`, borderRadius: 999, transition: 'width 0.8s ease', background: completion >= 75 ? 'linear-gradient(90deg,#10B981,#3B82F6)' : completion >= 50 ? 'linear-gradient(90deg,#3B82F6,#8B5CF6)' : 'linear-gradient(90deg,#F59E0B,#EF4444)' }} />
          </div>
        </div>

        {/* Family selector (top row, like ZenMatrix categories) */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 24 }}>
          {FAMILY_SKILLS.map((f, i) => {
            const on = i === activeIdx;
            const done = famDone(f.skills);
            const complete = done === f.skills.length && f.skills.length > 0;
            return (
              <button key={f.family} onClick={() => setActiveIdx(i)}
                style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start', padding: '12px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', minWidth: 175, maxWidth: 240,
                  background: on ? `${f.color}18` : T.card, border: `1.5px solid ${on ? f.color : (complete ? '#10B981' : T.bdr)}` }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: f.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: on ? T.text : T.sub }}>{f.family}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: complete ? '#10B981' : T.muted, marginLeft: 18 }}>
                  {complete && <CheckCircle2 size={12} />} {done}/{f.skills.length} rated
                </span>
              </button>
            );
          })}
        </div>

        {/* Active family header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ width: 12, height: 12, borderRadius: 999, background: activeFamily.color }} />
          <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{activeFamily.family}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>{activeFamily.skills.length} skills</span>
        </div>

        {/* Skills list — flattened, no group headings */}
        {loading ? (
          <div style={{ textAlign: 'center', color: T.sub, padding: 48 }}>Loading your ratings…</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {activeFamily.skills.map(skill => {
              const lvl = (ratings[skill] || 0) as Level;
              const rated = lvl > 0;
              return (
                <div key={skill} style={{ background: rated ? `${LVL_COLOR[lvl]}0D` : T.card, border: `1px solid ${rated ? `${LVL_COLOR[lvl]}33` : T.bdr}`, borderRadius: 13, padding: '16px 22px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
                  <div style={{ flex: '1 1 180px', minWidth: 160, fontSize: 14, fontWeight: 700, color: T.text }}>{skill}</div>
                  <div style={{ textAlign: 'right', minWidth: 96 }}>
                    <div style={{ fontSize: 10, color: T.muted }}>MY LEVEL</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: rated ? LVL_COLOR[lvl] : T.muted }}>{LVL_LABEL[lvl]}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([0, 1, 2, 3] as Level[]).map(l => (
                      <button key={l} onClick={() => setLevel(skill, l)} style={{ width: 42, height: 42, borderRadius: 9, fontWeight: 800, border: `2px solid ${lvl === l ? LVL_COLOR[l] : T.bdr}`, background: lvl === l ? `${LVL_COLOR[l]}28` : T.card, color: lvl === l ? LVL_COLOR[l] : T.muted, cursor: 'pointer' }}>{l}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
          <button onClick={() => setActiveIdx(i => Math.max(0, i - 1))} disabled={activeIdx === 0} style={{ padding: '11px 22px', borderRadius: 9, background: T.card, border: `1px solid ${T.bdr}`, color: T.text, cursor: activeIdx === 0 ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: activeIdx === 0 ? 0.5 : 1 }}>Previous</button>
          {activeIdx < FAMILY_SKILLS.length - 1 ? (
            <button onClick={() => setActiveIdx(i => Math.min(FAMILY_SKILLS.length - 1, i + 1))} style={{ padding: '11px 22px', borderRadius: 9, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>Next Family</button>
          ) : (
            <button onClick={handleSave} disabled={saving} style={{ padding: '12px 28px', borderRadius: 10, background: 'linear-gradient(135deg,#10B981,#3B82F6)', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
          )}
        </div>

      </div>
    </div>
  );
}
