import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDark, mkTheme } from '@/lib/themeContext';
import { toast } from '@/lib/ToastContext';
import { ArrowLeft, Download, RefreshCw, Upload, Search, FileText, Layers, Eye } from 'lucide-react';
import {
  apiListResumes, apiDownloadResume, apiResumeBlobUrl, apiGetResumeText, apiStoreResume, fileToBase64,
  apiSaveTaxonomySkills, type ResumeMeta,
} from '@/lib/api';
import { extractTextFromFile, extractTaxonomySkillsFromResume } from '@/lib/resumeExtraction';

// Admin-only "Resume Vault": every uploaded resume is stored (compressed) with a DB
// reference. Here an admin can search a person and Download / Re-scan / Re-upload,
// or Re-scan everyone. Re-scan re-runs the current 166-skill extraction on the stored
// resume text — no re-upload needed.
export default function AdminResumesPage() {
  const navigate = useNavigate();
  const { dark } = useDark();
  const T = mkTheme(dark);

  const [resumes, setResumes] = useState<ResumeMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scanAll, setScanAll] = useState<{ done: number; total: number } | null>(null);
  const reuploadRef = useRef<HTMLInputElement>(null);
  const reuploadFor = useRef<ResumeMeta | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { resumes } = await apiListResumes(); setResumes(resumes); }
    catch (e: any) { toast.error(e?.message || 'Could not load resumes'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return resumes;
    return resumes.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.employee_id || '').toLowerCase().includes(q) ||
      (r.zensar_id || '').toLowerCase().includes(q) ||
      (r.file_name || '').toLowerCase().includes(q));
  }, [resumes, query]);

  // Re-run the 166-skill taxonomy extraction on a resume's text and save the chain.
  const rescanText = async (empId: string, text: string, years: number) => {
    const taxo = await extractTaxonomySkillsFromResume(text, years || 0);
    const chainSkills = [
      ...taxo.skills.map(s => ({ id: s.id, name: s.name, family: s.family, group: s.group, proficiency: s.proficiency, priority: s.priority })),
      ...taxo.others.map(o => ({ name: o.name, family: o.family, proficiency: o.proficiency, priority: null })),
    ];
    if (chainSkills.length > 0) {
      await apiSaveTaxonomySkills(empId, {
        source: 'ai', primarySkill: taxo.primarySkill, secondarySkill: taxo.secondarySkill,
        tertiarySkill: taxo.tertiarySkill, skills: chainSkills,
      });
    }
    return taxo.matchedCount || taxo.skills.length;
  };

  const onView = async (r: ResumeMeta) => {
    // Open the tab synchronously (on the click gesture) so pop-up blockers don't
    // eat it, then point it at the authed blob once fetched.
    const win = window.open('', '_blank');
    try {
      const url = await apiResumeBlobUrl(r.employee_id);
      if (win) win.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) { win?.close(); toast.error(e?.message || 'Could not open resume'); }
  };

  const onDownload = async (r: ResumeMeta) => {
    try { await apiDownloadResume(r.employee_id, r.file_name); }
    catch (e: any) { toast.error(e?.message || 'Download failed'); }
  };

  const onRescan = async (r: ResumeMeta) => {
    setBusyId(r.employee_id);
    try {
      const { text } = await apiGetResumeText(r.employee_id);
      if (!text || !text.trim()) { toast.error('No stored text to re-scan — use Re-upload instead.'); return; }
      const n = await rescanText(r.employee_id, text, r.years_it || 0);
      toast.success(`Re-scanned ${r.name || r.employee_id}: ${n} QI SL skills mapped ✓`);
    } catch (e: any) { toast.error(e?.message || 'Re-scan failed'); }
    finally { setBusyId(null); }
  };

  const onRescanAll = async () => {
    if (!window.confirm(`Re-scan all ${filtered.length} stored resume(s)? This re-runs the 166-skill extraction on each.`)) return;
    let done = 0;
    for (const r of filtered) {
      setScanAll({ done, total: filtered.length });
      try {
        const { text } = await apiGetResumeText(r.employee_id);
        if (text && text.trim()) await rescanText(r.employee_id, text, r.years_it || 0);
      } catch (e) { console.warn('rescan-all failed for', r.employee_id, e); }
      done++;
    }
    setScanAll(null);
    toast.success(`Re-scanned ${done} resume(s) ✓`);
  };

  const pickReupload = (r: ResumeMeta) => { reuploadFor.current = r; reuploadRef.current?.click(); };
  const onReuploadFile = async (file: File | null) => {
    const r = reuploadFor.current;
    if (!file || !r) return;
    setBusyId(r.employee_id);
    try {
      const text = await extractTextFromFile(file);
      const dataBase64 = await fileToBase64(file);
      await apiStoreResume(r.employee_id, { filename: file.name, mimeType: file.type || 'application/octet-stream', dataBase64, extractedText: text, zensarId: r.zensar_id || undefined });
      const n = await rescanText(r.employee_id, text, r.years_it || 0);
      toast.success(`Replaced & re-scanned ${r.name || r.employee_id}: ${n} skills ✓`);
      await load();
    } catch (e: any) { toast.error(e?.message || 'Re-upload failed'); }
    finally { setBusyId(null); reuploadFor.current = null; if (reuploadRef.current) reuploadRef.current.value = ''; }
  };

  const fmtSize = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString(); } catch { return ''; } };

  const btn = (color: string, filled = false) => ({
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8,
    background: filled ? color : `${color}1a`, border: 'none', color: filled ? '#fff' : color,
    fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' as const,
  });

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, padding: '30px 6vw 90px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <button onClick={() => navigate('/admin')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: T.sub, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>
          <ArrowLeft size={16} /> Back to Admin
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
          <div>
            <h1 style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>🗄️ Resume Vault</h1>
            <p style={{ margin: 0, color: T.sub, fontSize: 14.5, maxWidth: 620 }}>Every uploaded resume is stored here (compressed). Download the original, re-scan skills from the stored copy, or replace it with a new upload.</p>
          </div>
          <button onClick={onRescanAll} disabled={!!scanAll || filtered.length === 0} style={{ ...btn('#8B5CF6', true), padding: '10px 16px', fontSize: 13, opacity: scanAll ? 0.7 : 1 }}>
            <Layers size={15} /> {scanAll ? `Re-scanning ${scanAll.done}/${scanAll.total}…` : `Re-scan all (${filtered.length})`}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 20px', maxWidth: 420, background: T.input, border: `1px solid ${T.inputBdr}`, borderRadius: 10, padding: '9px 12px' }}>
          <Search size={16} color={T.muted} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, ID, or file…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: T.text, fontSize: 13.5 }} />
        </div>

        <input ref={reuploadRef} type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }} onChange={e => onReuploadFile(e.target.files?.[0] || null)} />

        {loading ? (
          <p style={{ color: T.sub, fontSize: 14 }}>Loading resumes…</p>
        ) : filtered.length === 0 ? (
          <div style={{ background: T.card, border: `1px solid ${T.bdr}`, borderRadius: 16, padding: 40, textAlign: 'center' }}>
            <FileText size={28} color={T.muted} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 15, fontWeight: 700 }}>{query ? 'No resumes match your search.' : 'No resumes stored yet.'}</div>
            <div style={{ fontSize: 13, color: T.sub, marginTop: 4 }}>{query ? 'Try a different name or ID.' : 'Upload resumes from the admin dashboard — they’ll appear here automatically.'}</div>
          </div>
        ) : (
          <div style={{ background: T.cardSolid, border: `1px solid ${T.bdr}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 720 }}>
                <thead>
                  <tr style={{ background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', textAlign: 'left' }}>
                    {['Person', 'File', 'Updated', ''].map((h, i) => (
                      <th key={i} style={{ padding: '12px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: T.sub, fontWeight: 800 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const busy = busyId === r.employee_id;
                    return (
                      <tr key={r.employee_id} style={{ borderTop: `1px solid ${T.bdr}`, opacity: busy ? 0.6 : 1 }}>
                        <td style={{ padding: '11px 16px' }}>
                          <div style={{ fontWeight: 700, color: T.text }}>{r.name || 'Unknown'}</div>
                          <div style={{ fontSize: 12, color: T.muted }}>{r.zensar_id || r.employee_id}{r.designation ? ` · ${r.designation}` : ''}</div>
                        </td>
                        <td style={{ padding: '11px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.sub }}>
                            <FileText size={14} /> <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.file_name}</span>
                          </div>
                          <div style={{ fontSize: 11.5, color: T.muted }}>{fmtSize(r.size_bytes)}{r.has_text ? '' : ' · no text (re-upload to re-scan)'}</div>
                        </td>
                        <td style={{ padding: '11px 16px', color: T.sub, whiteSpace: 'nowrap' }}>{fmtDate(r.updated_at)}</td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button onClick={() => onView(r)} style={btn('#6366F1')}><Eye size={13} /> View</button>
                            <button onClick={() => onDownload(r)} style={btn('#3B82F6')}><Download size={13} /> Download</button>
                            <button onClick={() => onRescan(r)} disabled={busy || !r.has_text} style={{ ...btn('#10B981'), opacity: !r.has_text ? 0.4 : 1 }}><RefreshCw size={13} /> Re-scan</button>
                            <button onClick={() => pickReupload(r)} disabled={busy} style={btn('#F59E0B')}><Upload size={13} /> Re-upload</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
