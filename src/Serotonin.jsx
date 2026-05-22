import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckSquare, Layers, BookOpen, Shield, Home, Settings,
  Bell, User, ChevronRight, Menu, X, ArrowLeft, Upload,
  Mail, FolderOpen, FileText, Brain, AlertCircle, CheckCircle,
  Clock, Download, Send, ExternalLink, Search, Building,
  Calendar, Activity, TrendingUp, Database, Grid, List,
  Plus, Filter, AlertTriangle, XCircle, Play, Pause,
  SkipForward, BarChart3, Lock, Circle, LogOut
} from 'lucide-react';

// Serotonin v2.0 — Public Portfolio Demo
// MIT License — https://github.com/YOUR_USERNAME/serotonin

// ─── AUTO SCALE HOOK ─────────────────────────────────────────────────────────
// Scales the entire app so it always fills the viewport correctly.
// Base design width is 1440px — scales up or down from there.

function useViewportScale() {
  const BASE_WIDTH = 1440;
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      const ratio = window.innerWidth / BASE_WIDTH;
      // Clamp between 0.6 (very small screens) and 1.4 (very large monitors)
      setScale(Math.min(Math.max(ratio, 0.6), 1.4));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return scale;
}

// ─── THEME DEFINITIONS ───────────────────────────────────────────────────────

const THEMES = {
  forest: {
    name: 'Forest',
    swatch: '#2D5A27',
    bg:           '#F2EDE4',
    bg2:          '#EAE4DA',
    bg3:          '#E2DAD0',
    text:         '#1A2018',
    text2:        '#6A6050',
    text3:        '#8A8070',
    border:       '#D8D0C4',
    border2:      '#C8BEB0',
    accent:       '#2D5A27',
    accentBg:     '#D8EAD4',
    accentText:   '#1A3A15',
    dim:          '#A89E90',
    heroMuted:    '#7A7060',
    warn:         '#A06830',
    warnBg:       '#F0E4D0',
    warnText:     '#7A4A18',
    done:         '#4A8A40',
    doneBg:       '#D4EAD0',
    doneText:     '#2A6022',
    danger:       '#A03020',
    dangerBg:     '#F5E0DA',
    dangerText:   '#7A2015',
    serifFont:    "'Playfair Display', Georgia, serif",
    sansFont:     "'Darker Grotesque', sans-serif",
    monoFont:     "monospace",
  },
  chalk: {
    name: 'Chalk',
    swatch: '#2D5A27',
    bg:           '#FAFAFA',
    bg2:          '#F4F4F4',
    bg3:          '#EEEEEE',
    text:         '#111111',
    text2:        '#555555',
    text3:        '#A0A0A0',
    border:       '#E2E2E2',
    border2:      '#CCCCCC',
    accent:       '#2D5A27',
    accentBg:     '#D8EAD4',
    accentText:   '#1A3A15',
    dim:          '#C0C0C0',
    heroMuted:    '#B0B0B0',
    warn:         '#C07800',
    warnBg:       '#FDF6DC',
    warnText:     '#7A5000',
    done:         '#2E7D32',
    doneBg:       '#E8F5E9',
    doneText:     '#1B5E20',
    danger:       '#C0392B',
    dangerBg:     '#FDECEA',
    dangerText:   '#921C14',
    serifFont:    "'Libre Baskerville', Georgia, serif",
    sansFont:     "'Darker Grotesque', sans-serif",
    monoFont:     "monospace",
  },
  obsidian: {
    name: 'Obsidian',
    swatch: '#C87941',
    bg:           '#141210',
    bg2:          '#100E0C',
    bg3:          '#1C1814',
    text:         '#F0EAE0',
    text2:        '#8A7A68',
    text3:        '#5A5040',
    border:       '#2A2520',
    border2:      '#3A322A',
    accent:       '#C87941',
    accentBg:     '#251C12',
    accentText:   '#E8A060',
    dim:          '#5A5040',
    heroMuted:    '#6A5E50',
    warn:         '#9A7840',
    warnBg:       '#1E1810',
    warnText:     '#C0A060',
    done:         '#4A7840',
    doneBg:       '#14200E',
    doneText:     '#6A9858',
    danger:       '#9A4030',
    dangerBg:     '#200E0A',
    dangerText:   '#C07060',
    serifFont:    "'Fraunces', Georgia, serif",
    sansFont:     "'Darker Grotesque', sans-serif",
    monoFont:     "monospace",
  },

  // ── Frutiger Aero — glassy web 2.0, Nintendo Wii energy ────────────────────
  aero: {
    name: 'Aero',
    swatch: '#0099CC',
    bg:           '#DCF0FA',   // light sky, almost like a clear winter morning
    bg2:          '#C8E8F6',   // slightly deeper ice blue
    bg3:          '#B4DCEE',   // deeper panel tint
    text:         '#003A52',   // deep teal-navy
    text2:        '#2A6880',   // medium teal
    text3:        '#6AAAC8',   // muted glass blue
    border:       'rgba(255,255,255,0.65)', // glassy highlight border
    border2:      'rgba(0,120,180,0.25)',
    accent:       '#0099CC',   // Wii channel blue
    accentBg:     'rgba(0,153,204,0.12)',
    accentText:   '#005A7A',
    dim:          '#8ABCD0',
    heroMuted:    '#90BCCC',
    warn:         '#E07820',
    warnBg:       'rgba(224,120,32,0.1)',
    warnText:     '#A04000',
    done:         '#32A852',
    doneBg:       'rgba(50,168,82,0.1)',
    doneText:     '#186030',
    danger:       '#D03030',
    dangerBg:     'rgba(208,48,48,0.1)',
    dangerText:   '#901818',
    serifFont:    "'Quicksand', sans-serif",
    sansFont:     "'Nunito', sans-serif",
    monoFont:     "monospace",
    // Aero-specific: glossy surface overlay applied via useThemeStyles
    gloss: true,
  },

  // ── Oklou / choke enough — Y2K trance meets medieval folk, dreamy & fragmented
  oklou: {
    name: 'Oklou',
    swatch: '#9B7FD4',
    bg:           '#0D0B14',   // near-black with a violet undertone — like a 3am bedroom
    bg2:          '#120F1C',   // deep purple-black
    bg3:          '#1A1628',   // slightly lifted purple-dark
    text:         '#E8E0F8',   // ghostly lavender-white
    text2:        '#9080B8',   // muted violet
    text3:        '#5A5070',   // dim lavender-grey
    border:       'rgba(155,127,212,0.15)',
    border2:      'rgba(155,127,212,0.28)',
    accent:       '#9B7FD4',   // soft violet — the main colour
    accentBg:     'rgba(155,127,212,0.1)',
    accentText:   '#C8B0F0',
    dim:          '#40385A',
    heroMuted:    'rgba(232,224,248,0.25)',
    warn:         '#D4927A',   // warm desaturated coral
    warnBg:       'rgba(212,146,122,0.1)',
    warnText:     '#F0B898',
    done:         '#7AB8A0',   // muted sage — like tarnished silver
    doneBg:       'rgba(122,184,160,0.1)',
    doneText:     '#A8D8C8',
    danger:       '#C86080',   // cold magenta-pink
    dangerBg:     'rgba(200,96,128,0.1)',
    dangerText:   '#F090A8',
    serifFont:    "'IM Fell English', Georgia, serif",
    sansFont:     "'Syne', sans-serif",
    monoFont:     "monospace",
  },
};

// ─── THEME CONTEXT HOOK ───────────────────────────────────────────────────────

function useThemeStyles(t) {
  // Aero: glossy card with white gradient shine on top edge
  const cardBase = t.gloss
    ? {
        background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, ${t.bg2} 40%)`,
        border: `1px solid rgba(255,255,255,0.8)`,
        borderBottom: `1px solid rgba(0,100,160,0.2)`,
        borderRadius: 10,
        boxShadow: '0 2px 8px rgba(0,100,180,0.10), inset 0 1px 0 rgba(255,255,255,0.9)',
      }
    : { background: t.bg2, border: `0.5px solid ${t.border}`, borderRadius: 8 };

  const cardInnerBase = t.gloss
    ? {
        background: `linear-gradient(180deg, rgba(255,255,255,0.45) 0%, ${t.bg} 50%)`,
        border: `1px solid rgba(255,255,255,0.7)`,
        borderRadius: 8,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
      }
    : { background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 8 };

  const accentBtnBase = t.gloss
    ? {
        background: `linear-gradient(180deg, rgba(0,180,240,0.9) 0%, rgba(0,120,200,1) 100%)`,
        color: '#fff',
        border: '1px solid rgba(0,100,180,0.6)',
        borderRadius: 8,
        padding: '7px 18px',
        fontFamily: t.sansFont, fontSize: 12, fontWeight: 700,
        letterSpacing: '0.04em', cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(0,100,200,0.3), inset 0 1px 0 rgba(255,255,255,0.5)',
        textShadow: '0 1px 2px rgba(0,0,0,0.2)',
      }
    : {
        background: t.accentBg, color: t.accent,
        border: `0.5px solid ${t.accent}`, borderRadius: 6,
        padding: '6px 16px', fontFamily: t.sansFont, fontSize: 12,
        fontWeight: 600, letterSpacing: '0.04em', cursor: 'pointer',
      };

  return {
    app:        { background: t.bg, color: t.text, fontFamily: t.sansFont, minHeight: '100%' },
    sidebar:    { background: t.bg2, borderRight: `0.5px solid ${t.border}`, width: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 4, flexShrink: 0 },
    header:     { background: t.bg2, borderBottom: `0.5px solid ${t.border}`, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 },
    footer:     { background: t.bg2, borderTop: `0.5px solid ${t.border}`, padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    card:       cardBase,
    cardInner:  cardInnerBase,
    eyebrow:    { fontFamily: t.sansFont, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.text3 },
    label:      { fontFamily: t.sansFont, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.text3 },
    heroSerif:  { fontFamily: t.serifFont, fontWeight: 400, lineHeight: 1.1, color: t.text },
    statNum:    { fontFamily: t.serifFont, fontWeight: 400, lineHeight: 1, color: t.text },
    mono:       { fontFamily: t.monoFont },
    accentBtn:  accentBtnBase,
    ghostBtn:   { background: 'transparent', color: t.text3, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: '6px 14px', fontFamily: t.sansFont, fontSize: 12, fontWeight: 500, cursor: 'pointer' },
    pill:       (bg, color) => ({ background: bg, color: color, fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 3, fontFamily: t.sansFont, textTransform: 'uppercase' }),
    navItem:    (active) => ({ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, color: active ? t.accent : t.dim, background: active ? t.accentBg : 'transparent', cursor: 'pointer', fontSize: 16 }),
    prog:       { height: 2, background: t.border, borderRadius: 1, flex: 1 },
    progFill:   (color, pct) => ({ height: '100%', width: `${pct}%`, background: color, borderRadius: 1 }),
    input:      { background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: '10px 14px', color: t.text, fontFamily: t.sansFont, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none' },
    divider:    { borderTop: `0.5px solid ${t.border}`, margin: '12px 0' },
    row:        { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `0.5px solid ${t.border}` },
  };
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

function ThemeSwitcher({ current, onChange, t }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  // Close on outside click
  React.useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentTheme = THEMES[current];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 11px', borderRadius: 6, cursor: 'pointer',
          fontFamily: t.sansFont, fontSize: 10, fontWeight: 600,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          background: open ? t.accentBg : 'transparent',
          color: t.text3,
          border: `0.5px solid ${open ? t.accent : t.border}`,
          transition: 'all .15s',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontWeight: 600, letterSpacing: '.08em', color: t.text3, fontSize: 10 }}>THEME</span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: currentTheme.swatch, display: 'inline-block', boxShadow: `0 0 0 1.5px ${t.border}` }} />
        <span style={{ color: t.text2 }}>{currentTheme.name}</span>
        <span style={{ fontSize: 8, color: t.text3, marginLeft: 1 }}>▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: t.bg2, border: `0.5px solid ${t.border2}`,
          borderRadius: 8, padding: '5px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 200, minWidth: 160,
        }}>
          {Object.entries(THEMES).map(([key, th]) => (
            <button
              key={key}
              onClick={() => { onChange(key); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                width: '100%', padding: '7px 10px', borderRadius: 5,
                border: 'none', cursor: 'pointer', textAlign: 'left',
                background: current === key ? t.accentBg : 'transparent',
                transition: 'background .12s',
              }}
            >
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: th.swatch, flexShrink: 0,
                boxShadow: current === key ? `0 0 0 2px ${t.accent}` : 'none',
              }} />
              <span style={{
                fontFamily: t.sansFont, fontSize: 12, fontWeight: current === key ? 700 : 500,
                color: current === key ? t.accent : t.text2,
                letterSpacing: '.01em',
              }}>
                {th.name}
              </span>
              {current === key && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: t.accent }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── APPROVAL STEP ────────────────────────────────────────────────────────────

function ApprovalStep({ t, s, vendor, questions, onBack, onComplete }) {
  const [docs,        setDocs]        = useState([]);
  const [emailSent,   setEmailSent]   = useState(false);
  const [pdfExported, setPdfExported] = useState(false);
  const [showGate,    setShowGate]    = useState(false); // confirmation modal

  const dispatched = emailSent || pdfExported;

  const handleFileAdd = (e) => {
    const files = Array.from(e.target.files);
    setDocs(prev => [...prev, ...files.map(f => ({
      id: Date.now() + Math.random(), name: f.name, size: f.size, file: f,
    }))]);
    e.target.value = '';
  };

  const handleRemove = (id) => setDocs(prev => prev.filter(d => d.id !== id));

  const formatSize = (bytes) => {
    if (bytes < 1024)        return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const completion = questions.length > 0
    ? Math.round((questions.filter(q => q.answer?.trim()).length / questions.length) * 100)
    : 0;

  // ── Build PDF ─────────────────────────────────────────────────
  const handleDownloadPDF = () => {
    const rows = questions.map((q, i) =>
      `<div style="margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid #e0dbd2">
        <div style="font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#8A8070;margin-bottom:6px">Question ${i + 1}</div>
        <div style="font-size:15px;font-weight:600;color:#1A2018;margin-bottom:10px">${q.text}</div>
        <div style="font-size:13px;color:#3A3028;background:#f5f0e8;border:1px solid #d8d0c4;border-radius:6px;padding:12px 14px;min-height:48px">${q.answer || '<em style="color:#aaa">No answer provided</em>'}</div>
        ${q.source ? `<div style="font-size:11px;color:#8A8070;margin-top:6px">Source: ${q.source}</div>` : ''}
      </div>`
    ).join('');

    const docList = docs.length > 0
      ? `<div style="margin-top:32px;padding-top:24px;border-top:1px solid #e0dbd2">
          <div style="font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#8A8070;margin-bottom:12px">Attached Documents</div>
          ${docs.map(d => `<div style="font-size:13px;color:#3A3028;padding:6px 0;border-bottom:1px solid #f0ebe2">📄 ${d.name} (${formatSize(d.size)})</div>`).join('')}
        </div>` : '';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <title>Security Questionnaire — ${vendor || 'Unnamed Vendor'}</title>
      <style>body{font-family:Georgia,serif;color:#1A2018;background:#fff;padding:48px;max-width:760px;margin:0 auto}h1{font-size:28px;font-weight:400;margin-bottom:4px}.meta{font-size:12px;color:#8A8070;margin-bottom:36px;letter-spacing:.04em}.footer{margin-top:48px;padding-top:16px;border-top:1px solid #e0dbd2;font-size:11px;color:#aaa}</style>
      </head><body>
      <h1>Security Questionnaire</h1>
      <div class="meta">Vendor: <strong>${vendor || 'Not specified'}</strong> &nbsp;·&nbsp; ${questions.length} questions &nbsp;·&nbsp; Generated ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}</div>
      ${rows}${docList}
      <div class="footer">Generated by Serotonin</div>
      </body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
    setPdfExported(true);
  };

  // ── Send Email ────────────────────────────────────────────────
  const handleSendEmail = () => {
    const body = questions.map((q, i) =>
      `Q${i + 1}: ${q.text}\nA: ${q.answer || '(No answer provided)'}`
    ).join('\n\n');

    const docNames = docs.length > 0
      ? `\n\nAttached documents:\n${docs.map(d => `  • ${d.name}`).join('\n')}` : '';

    const subject   = encodeURIComponent(`Security Questionnaire — ${vendor || 'Completed'}`);
    const emailBody = encodeURIComponent(
      `Hello,\n\nPlease find our completed security questionnaire below.\n\n` +
      `─────────────────────────────\nVendor: ${vendor || 'Not specified'}\nQuestions: ${questions.length}\n` +
      `Completed: ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}\n` +
      `─────────────────────────────\n\n${body}${docNames}\n\n─────────────────────────────\n` +
      `Sent via Serotonin · Security Questionnaire Platform\nPlease let us know if you need any additional information.`
    );

    window.location.href = `mailto:?subject=${subject}&body=${emailBody}`;
    setEmailSent(true);
  };

  // ── Mark complete — only allowed after dispatching ────────────
  const handleMarkComplete = () => {
    if (!dispatched) { setShowGate(true); return; }
    onComplete();
  };

  return (
    <>
      <div style={{ ...s.eyebrow, marginBottom: 6 }}>Final Approval</div>
      <div style={{ ...s.heroSerif, fontSize: 26, marginBottom: 24 }}>
        Review the package<br /><em style={{ color: t.heroMuted }}>before sending.</em>
      </div>

      {/* Dispatch status banner */}
      {dispatched && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: t.accentBg, border: `0.5px solid ${t.accent}`,
          borderRadius: 8, padding: '12px 16px', marginBottom: 14,
        }}>
          <CheckCircle size={16} color={t.accent} />
          <div>
            <div style={{ fontFamily: t.sansFont, fontSize: 13, fontWeight: 600, color: t.accentText }}>
              {emailSent && pdfExported ? 'Emailed and exported' : emailSent ? 'Email drafted in your mail client' : 'PDF exported'}
            </div>
            <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3, marginTop: 2 }}>
              You can send or export again, or click "Mark complete" to finish.
            </div>
          </div>
        </div>
      )}

      {/* Not dispatched warning */}
      {!dispatched && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: t.warnBg, border: `0.5px solid ${t.warn}`,
          borderRadius: 8, padding: '12px 16px', marginBottom: 14,
        }}>
          <AlertTriangle size={16} color={t.warn} />
          <div style={{ fontFamily: t.sansFont, fontSize: 12, color: t.warnText }}>
            Use <strong>Send Email</strong> or <strong>Download PDF</strong> below before marking complete.
          </div>
        </div>
      )}

      {/* Summary */}
      <div style={{ ...s.card, padding: '18px 20px', marginBottom: 14 }}>
        <div style={{ ...s.label, marginBottom: 14 }}>Summary</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            ['Vendor',             vendor || 'Not specified'],
            ['Total questions',    questions.length],
            ['Completion',         `${completion}%`],
            ['Documents attached', docs.length],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ ...s.label, marginBottom: 3 }}>{k}</div>
              <div style={{ fontFamily: t.sansFont, fontSize: 14, fontWeight: 500, color: completion < 100 && k === 'Completion' ? t.warn : t.text }}>{v}</div>
            </div>
          ))}
        </div>
        {/* Incomplete answers warning */}
        {completion < 100 && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: t.warnBg, border: `0.5px solid ${t.warn}`, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={13} color={t.warn} />
            <span style={{ fontFamily: t.sansFont, fontSize: 11, color: t.warnText }}>
              {questions.filter(q => !q.answer?.trim()).length} question{questions.filter(q => !q.answer?.trim()).length !== 1 ? 's' : ''} unanswered —
              <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: t.sansFont, fontSize: 11, color: t.accent, fontWeight: 600, padding: '0 4px' }}>
                go back to review
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Documents */}
      <div style={{ ...s.card, padding: '18px 20px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ ...s.label }}>Attached documents</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: t.accentBg, border: `0.5px solid ${t.accent}`, borderRadius: 6, padding: '5px 12px' }}>
            <input type="file" multiple accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.txt,.png,.jpg" style={{ display: 'none' }} onChange={handleFileAdd} />
            <Upload size={12} color={t.accent} />
            <span style={{ fontFamily: t.sansFont, fontSize: 11, fontWeight: 600, color: t.accentText }}>Attach file</span>
          </label>
        </div>

        {docs.length === 0 ? (
          <label style={{ display: 'block', cursor: 'pointer' }}>
            <input type="file" multiple accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.txt,.png,.jpg" style={{ display: 'none' }} onChange={handleFileAdd} />
            <div style={{ border: `1.5px dashed ${t.border}`, borderRadius: 8, padding: '28px 20px', textAlign: 'center' }}>
              <Upload size={22} color={t.text3} style={{ margin: '0 auto 10px' }} />
              <div style={{ fontFamily: t.sansFont, fontSize: 13, fontWeight: 600, color: t.text2, marginBottom: 4 }}>Click to attach supporting documents</div>
              <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3 }}>SOC 2 reports, policies, BAAs, certificates — PDF, DOCX, XLSX, PNG</div>
            </div>
          </label>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {docs.map(doc => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={14} color={t.accent} />
                  <div>
                    <div style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text, fontWeight: 500 }}>{doc.name}</div>
                    <div style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3 }}>{formatSize(doc.size)}</div>
                  </div>
                </div>
                <button onClick={() => handleRemove(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text3, padding: 4, display: 'flex' }}>
                  <X size={13} />
                </button>
              </div>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 10px' }}>
              <input type="file" multiple accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.txt,.png,.jpg" style={{ display: 'none' }} onChange={handleFileAdd} />
              <Upload size={11} color={t.text3} />
              <span style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3 }}>Add more files</span>
            </label>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: `0.5px solid ${t.border}` }}>
        <button onClick={onBack} style={{ ...s.ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={13} />Back to review
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={handleDownloadPDF} style={{ ...s.ghostBtn, display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
            <Download size={13} />Download PDF
            {pdfExported && <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: t.accent }} />}
          </button>
          <button onClick={handleSendEmail} style={{ ...s.ghostBtn, display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
            <Send size={13} />Send Email
            {emailSent && <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: t.accent }} />}
          </button>
          <button
            onClick={handleMarkComplete}
            style={{ ...s.accentBtn, display: 'flex', alignItems: 'center', gap: 6, opacity: dispatched ? 1 : 0.5, cursor: dispatched ? 'pointer' : 'not-allowed' }}
          >
            <CheckCircle size={13} />Mark complete
          </button>
        </div>
      </div>

      {/* Gate modal — shown when trying to complete without dispatching */}
      {showGate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setShowGate(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: t.bg2, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '32px 28px', maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: t.warnBg, border: `0.5px solid ${t.warn}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <AlertTriangle size={20} color={t.warn} />
            </div>
            <div style={{ fontFamily: t.serifFont, fontSize: 20, fontWeight: 400, color: t.text, marginBottom: 8 }}>Not yet sent or exported</div>
            <div style={{ fontFamily: t.sansFont, fontSize: 13, color: t.text2, lineHeight: 1.6, marginBottom: 24 }}>
              Before marking this questionnaire complete, please either send it via email or download it as a PDF. This ensures a copy exists outside of Serotonin.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => { setShowGate(false); handleSendEmail(); }} style={{ ...s.accentBtn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Send size={13} />Send Email now
              </button>
              <button onClick={() => { setShowGate(false); handleDownloadPDF(); }} style={{ ...s.ghostBtn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Download size={13} />Download PDF instead
              </button>
              <button onClick={() => { setShowGate(false); onBack(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: t.sansFont, fontSize: 12, color: t.text3, padding: '6px', textAlign: 'center' }}>
                ← Go back to review answers
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── QUESTIONNAIRE EDITOR ─────────────────────────────────────────────────────

function QuestionnaireEditor({ t, s, onBack, onAddToKb, drafts = [], onSaveDraft, onDeleteDraft, profile, resumeDraftId, onClearResume }) {

  // ── Load draft if resuming ─────────────────────────────────────
  const resumeDraft = resumeDraftId ? drafts.find(d => d.id === resumeDraftId) : null;

  // ── Restore progress from sessionStorage or resumed draft ──────
  const saved = (() => {
    if (resumeDraft) return resumeDraft;
    try { return JSON.parse(sessionStorage.getItem('serotonin_q_progress') || 'null'); }
    catch { return null; }
  })();

  const [step, setStepState]        = useState(saved?.step     || 'intake');
  const [vendor, setVendorState]    = useState(saved?.vendor   || '');
  const [manualText, setManualText] = useState(saved?.manualText || '');
  const [questions, setQuestionsState] = useState(saved?.questions || []);
  const [draftId]                   = useState(saved?.id || `draft_${Date.now()}`);
  const [assignee, setAssignee]     = useState(saved?.assignee || '');

  // Wrap setters to also persist to sessionStorage
  const persist = (patch) => {
    try {
      const current = JSON.parse(sessionStorage.getItem('serotonin_q_progress') || '{}');
      sessionStorage.setItem('serotonin_q_progress', JSON.stringify({ ...current, ...patch }));
    } catch {}
  };

  const setStep = (v)      => { setStepState(v);      persist({ step: v }); };
  const setVendor = (v)    => {
    const val = typeof v === 'function' ? v(vendor) : v;
    setVendorState(val); persist({ vendor: val });
  };
  const setQuestions = (v) => {
    const val = typeof v === 'function' ? v(questions) : v;
    setQuestionsState(val); persist({ questions: val });
  };

  // Clear saved progress when questionnaire is reset
  const clearProgress = () => {
    sessionStorage.removeItem('serotonin_q_progress');
    if (onDeleteDraft) onDeleteDraft(draftId);
    if (onClearResume) onClearResume();
    setStepState('intake');
    setVendorState('');
    setManualText('');
    setQuestionsState([]);
  };

  // Save current state as a named draft
  const [draftSaved, setDraftSaved] = useState(false);

  const handleSaveDraft = () => {
    const draft = {
      id:           draftId,
      vendor:       vendor || 'Unnamed vendor',
      step,
      questions,
      manualText,
      assignee,
      owner:        profile?.name || 'You',
      ownerInitials:(profile?.name || 'Y').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase(),
      progress:     questions.length > 0
        ? Math.round(questions.filter(q => q.answer?.trim()).length / questions.length * 100)
        : 0,
      questionCount: questions.length,
      savedAt:      new Date().toISOString(),
      savedAtLabel: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    };
    // Save to shared drafts state (shows on Dashboard)
    if (onSaveDraft) onSaveDraft(draft);
    // Also persist locally so it survives a refresh
    persist(draft);
    // Flash confirmation
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2500);
  };

  const [gmailPasteOpen, setGmailPasteOpen] = useState(false);
  const [gmailPasteText, setGmailPasteText] = useState('');
  const parseQuestions = (raw) => {
    return raw
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      // Strip leading numbers/letters: "1.", "1)", "a.", "Q1.", etc.
      .map(l => l.replace(/^(Q?\d+[\.\)]\s*|[a-z][\.\)]\s*)/i, '').trim())
      .filter(l => l.length > 0) // only remove completely empty lines
      .map((text, i) => ({
        id:             i + 1,
        text,
        answer:         '',
        confidence:     0,
        source:         '',
        status:         'needs-input',
        flagReason:     null,
        recommendation: null,
      }));
  };

  // ── Start processing from any source ─────────────────────────
  const startProcessing = (parsedQuestions) => {
    setQuestions(parsedQuestions);
    setStep('processing');
    setTimeout(() => setStep('review'), 2500);
  };

  const stepOrder = ['intake', 'processing', 'review', 'approval', 'complete'];
  const stepIdx = stepOrder.indexOf(step);

  // Scroll to top of main content whenever step changes
  useEffect(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const StepPip = ({ label, idx }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, fontFamily: t.sansFont, background: stepIdx > idx ? t.accentBg : stepIdx === idx ? t.accent : t.bg3, color: stepIdx > idx ? t.accent : stepIdx === idx ? '#fff' : t.dim, border: `0.5px solid ${stepIdx >= idx ? t.accent : t.border}` }}>{idx + 1}</div>
      <span style={{ fontFamily: t.sansFont, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: stepIdx === idx ? t.text : t.text3 }}>{label}</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Step indicators — sticky so always visible while scrolling */}
      <div style={{
        position: 'sticky', top: -32, zIndex: 10,
        background: t.bg,
        marginLeft: -36, marginRight: -36,
        paddingLeft: 36, paddingRight: 36,
        paddingTop: 20, paddingBottom: 14,
        borderBottom: `0.5px solid ${t.border}`,
        marginBottom: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', maxWidth: 860, margin: '0 auto' }}>
          {['Source', 'Process', 'Review', 'Approve', 'Done'].map((l, i) => (
            <React.Fragment key={l}>
              <StepPip label={l} idx={i} />
              {i < 4 && <div style={{ flex: 1, height: 1, background: t.border, minWidth: 16 }} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {step === 'intake' && (
        <>
          {/* Resume banner — shown when saved progress exists */}
          {saved && saved.step && saved.step !== 'intake' && (
            <div style={{ background: t.accentBg, border: `0.5px solid ${t.accent}`, borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Clock size={15} color={t.accent} />
                <div>
                  <div style={{ fontFamily: t.sansFont, fontSize: 13, fontWeight: 600, color: t.accentText }}>
                    You have a questionnaire in progress
                  </div>
                  <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3, marginTop: 2 }}>
                    {saved.vendor || 'Unnamed vendor'} · {saved.questions?.length || 0} questions · Step: {saved.step}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={clearProgress} style={{ ...s.ghostBtn, fontSize: 11, padding: '5px 10px' }}>Discard</button>
                <button onClick={() => setStep(saved.step)} style={{ ...s.accentBtn, fontSize: 11, padding: '5px 12px' }}>Resume →</button>
              </div>
            </div>
          )}
          <div style={{ ...s.eyebrow, marginBottom: 6 }}>New Questionnaire</div>
          <div style={{ ...s.heroSerif, fontSize: 28, marginBottom: 28 }}>Where is the questionnaire<br /><em style={{ color: t.heroMuted }}>coming from?</em></div>

          {/* Ownership row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <div style={{ ...s.label, marginBottom: 6 }}>Vendor name</div>
              <input style={s.input} value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. Acme Corp" />
            </div>
            <div>
              <div style={{ ...s.label, marginBottom: 6 }}>Assign to (optional)</div>
              <input style={s.input} value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="e.g. Sarah L." />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '8px 12px', background: t.bg3, borderRadius: 6, border: `0.5px solid ${t.border}` }}>
            <User size={12} color={t.text3} />
            <span style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3 }}>
              Owner: <strong style={{ color: t.text2 }}>{profile?.name || 'You'}</strong>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>

            {/* ── Gmail — opens Gmail then shows in-app paste modal ── */}
            <button
              onClick={() => {
                window.open('https://mail.google.com/mail/u/0/#search/security+questionnaire', '_blank');
                setGmailPasteOpen(true);
              }}
              style={{ background: t.bg2, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: '16px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, background: t.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Mail size={16} color={t.accent} /></div>
              <div>
                <div style={{ fontFamily: t.sansFont, fontWeight: 600, fontSize: 13, color: t.text, marginBottom: 2 }}>Gmail</div>
                <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3 }}>Opens inbox → paste questions</div>
              </div>
            </button>

            {/* ── Google Drive — paste sharing link (Option C) ── */}
            <button
              onClick={() => {
                const raw = prompt(
                  'Open Google Drive, right-click your questionnaire file → "Copy link", then paste it here:\n\nExample: https://drive.google.com/file/d/FILE_ID/view'
                );
                if (!raw) return;

                // Extract file ID from Drive URL formats:
                // /file/d/FILE_ID/view
                // /open?id=FILE_ID
                // /d/FILE_ID/edit
                const match =
                  raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                  raw.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                  raw.match(/\/d\/([a-zA-Z0-9_-]+)/);

                if (!match) {
                  alert("That doesn't look like a valid Google Drive link. Right-click your file in Drive, choose \"Copy link\", and paste that here.");
                  return;
                }

                const fileId = match[1];
                const nameGuess = raw.split('/').filter(Boolean).pop()?.split('?')[0];
                setVendor(prev => prev || (nameGuess && nameGuess.length < 60 ? nameGuess : 'Drive questionnaire'));
                // Drive link accepted — proceed with empty questions (will be populated by AI later)
                startProcessing([{
                  id: 1, text: `Questions imported from Google Drive (file ID: ${fileId})`,
                  answer: '', confidence: 0, source: 'Google Drive', status: 'needs-input',
                  flagReason: 'File imported from Drive — questions will be extracted automatically once AI processing is connected.',
                  recommendation: 'Connect the Google Drive API to auto-parse this file.',
                }]);
              }}
              style={{ background: t.bg2, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: '16px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, background: t.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FolderOpen size={16} color={t.accent} /></div>
              <div>
                <div style={{ fontFamily: t.sansFont, fontWeight: 600, fontSize: 13, color: t.text, marginBottom: 2 }}>Google Drive</div>
                <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3 }}>Paste Drive sharing link</div>
              </div>
            </button>

            {/* ── Upload file — real file picker ── */}
            <label
              style={{ background: t.bg2, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: '16px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
            >
              <input
                type="file"
                accept=".pdf,.docx,.doc,.xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  setVendor(prev => prev || file.name.replace(/\.[^/.]+$/, ''));
                  // File accepted — placeholder question until file parsing is connected
                  startProcessing([{
                    id: 1,
                    text: `Questions from uploaded file: ${file.name}`,
                    answer: '', confidence: 0, source: file.name, status: 'needs-input',
                    flagReason: 'File uploaded — questions will be extracted automatically once file parsing is connected.',
                    recommendation: 'Connect a file parsing service (PDF.js, Mammoth for DOCX) to auto-extract questions.',
                  }]);
                  e.target.value = '';
                }}
              />
              <div style={{ width: 36, height: 36, borderRadius: 8, background: t.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Upload size={16} color={t.accent} /></div>
              <div>
                <div style={{ fontFamily: t.sansFont, fontWeight: 600, fontSize: 13, color: t.text, marginBottom: 2 }}>Upload file</div>
                <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3 }}>PDF, DOCX, XLSX, CSV</div>
              </div>
            </label>

            {/* ── Manual entry ── */}
            <button
              onClick={() => {
                setStep('manual');
              }}
              style={{ background: t.bg2, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: '16px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, background: t.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FileText size={16} color={t.accent} /></div>
              <div>
                <div style={{ fontFamily: t.sansFont, fontWeight: 600, fontSize: 13, color: t.text, marginBottom: 2 }}>Manual entry</div>
                <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3 }}>Copy and paste</div>
              </div>
            </button>

          </div>
          <div style={{ background: t.accentBg, border: `0.5px solid ${t.accent}`, borderRadius: 8, padding: '14px 16px', display: 'flex', gap: 12 }}>
            <Brain size={16} color={t.accent} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontFamily: t.sansFont, fontSize: 12, color: t.accentText }}>Serotonin will search Vanta, Google Drive, and your knowledge base — auto-filling high-confidence answers and flagging anything uncertain.</div>
          </div>

          {/* ── Gmail paste modal ── */}
          {gmailPasteOpen && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
              onClick={() => setGmailPasteOpen(false)}>
              <div onClick={e => e.stopPropagation()} style={{ background: t.bg2, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '28px', width: 560, maxWidth: '90vw', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: t.accentBg, border: `0.5px solid ${t.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Mail size={14} color={t.accent} />
                    </div>
                    <div style={{ fontFamily: t.serifFont, fontSize: 18, fontWeight: 400, color: t.text }}>Paste from Gmail</div>
                  </div>
                  <button onClick={() => setGmailPasteOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text3, display: 'flex', padding: 4 }}>
                    <X size={16} />
                  </button>
                </div>

                {/* Instructions */}
                <div style={{ background: t.bg3, border: `0.5px solid ${t.border}`, borderRadius: 7, padding: '10px 14px', marginBottom: 16 }}>
                  <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text2, lineHeight: 1.7 }}>
                    <strong style={{ color: t.text }}>In Gmail:</strong> Open the questionnaire email → select the question text → copy it (Ctrl+C / Cmd+C) → come back here and paste below.
                  </div>
                </div>

                {/* Sender / vendor field */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ ...s.label, marginBottom: 6 }}>Sender / vendor name (optional)</div>
                  <input
                    style={s.input}
                    value={vendor}
                    onChange={e => setVendor(e.target.value)}
                    placeholder="e.g. Acme Corp"
                  />
                </div>

                {/* Paste area */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ ...s.label, marginBottom: 6 }}>Paste questions here</div>
                  <textarea
                    autoFocus
                    value={gmailPasteText}
                    onChange={e => setGmailPasteText(e.target.value)}
                    placeholder={'Paste the email content here. One question per line, or paste the full email body — Serotonin will extract the questions automatically.\n\nExample:\n1. Does your organization have SOC 2 Type II?\n2. Describe your data backup procedures.'}
                    style={{ ...s.input, minHeight: 220, resize: 'vertical', lineHeight: 1.6 }}
                  />
                  <div style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3, marginTop: 6 }}>
                    {gmailPasteText.split('\n').filter(l => l.trim()).length} lines detected
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <button
                    onClick={() => { setGmailPasteOpen(false); setGmailPasteText(''); }}
                    style={{ ...s.ghostBtn, fontSize: 12 }}
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!gmailPasteText.trim()}
                    onClick={() => {
                      const parsed = parseQuestions(gmailPasteText);
                      if (parsed.length === 0) {
                        alert('No questions detected. Make sure there is at least one line of text.');
                        return;
                      }
                      setGmailPasteOpen(false);
                      setGmailPasteText('');
                      startProcessing(parsed);
                    }}
                    style={{ ...s.accentBtn, opacity: gmailPasteText.trim() ? 1 : 0.5, cursor: gmailPasteText.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Brain size={13} />Import {gmailPasteText.split('\n').filter(l => l.trim()).length > 0 ? `${parseQuestions(gmailPasteText).length} question${parseQuestions(gmailPasteText).length !== 1 ? 's' : ''}` : 'questions'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {step === 'processing' && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: t.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}><Brain size={28} color={t.accent} /></div>
          <div style={{ ...s.heroSerif, fontSize: 26, marginBottom: 8 }}>Processing questionnaire…</div>
          <div style={{ fontFamily: t.sansFont, fontSize: 13, color: t.text3, marginBottom: 32 }}>Searching Vanta, Google Drive, and knowledge base</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, maxWidth: 480, margin: '0 auto' }}>
            {[
              [questions.length,                                               'Questions'],
              [questions.filter(q => q.status === 'auto-filled').length,      'Auto-filled'],
              [questions.filter(q => q.status === 'flagged' || q.status === 'needs-input').length, 'Flagged'],
            ].map(([v, l]) => (
              <div key={l} style={{ ...s.card, padding: '16px', textAlign: 'center' }}>
                <div style={{ ...s.statNum, fontSize: 26, color: t.accent }}>{v}</div>
                <div style={{ ...s.label, marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 'review' && (
        <>
          <div style={{ ...s.eyebrow, marginBottom: 6 }}>Review & Edit</div>
          <div style={{ ...s.heroSerif, fontSize: 26, marginBottom: 24 }}>Review auto-filled answers,<br /><em style={{ color: t.heroMuted }}>resolve flagged items.</em></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 24 }}>
            {[
              [questions.length,                                                t.text,   'Total'],
              [questions.filter(q => q.status === 'auto-filled').length,        t.accent, 'Auto-filled'],
              [questions.filter(q => q.status === 'flagged').length,            t.warn,   'Flagged'],
              [questions.filter(q => q.status === 'needs-input').length,        t.danger, 'Needs input'],
            ].map(([v, c, l]) => (
              <div key={l} style={{ ...s.card, padding: '14px 16px' }}>
                <div style={{ fontFamily: t.serifFont, fontSize: 24, fontWeight: 400, color: c, lineHeight: 1 }}>{v}</div>
                <div style={{ ...s.label, marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {questions.map(q => (
              <div key={q.id} style={{ ...s.cardInner, padding: 20, border: `0.5px solid ${q.status === 'flagged' ? t.warn : q.status === 'needs-input' ? t.danger : t.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontFamily: t.monoFont, fontSize: 10, color: t.dim }}>Q{q.id}</span>
                  {q.status === 'auto-filled' && <span style={s.pill(t.accentBg, t.accentText)}>Auto-filled</span>}
                  {q.status === 'flagged' && <span style={s.pill(t.warnBg, t.warnText)}>Review</span>}
                  {q.status === 'needs-input' && <span style={s.pill(t.dangerBg, t.dangerText)}>Manual</span>}
                  {q.confidence > 0 && <span style={s.pill(t.bg3, t.text3)}>{q.confidence}% confidence</span>}
                </div>
                <div style={{ fontFamily: t.sansFont, fontSize: 13, fontWeight: 500, color: t.text, marginBottom: 10 }}>{q.text}</div>
                {/* Controlled textarea — updates questions state on every keystroke */}
                <textarea
                  value={q.answer}
                  placeholder="Enter answer…"
                  onChange={e => setQuestions(prev => prev.map(p =>
                    p.id === q.id ? { ...p, answer: e.target.value } : p
                  ))}
                  style={{ ...s.input, minHeight: 80, resize: 'vertical' }}
                />
                {q.source && <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}><FileText size={11} />{q.source}</div>}
                {q.flagReason && (
                  <div style={{ background: q.status === 'needs-input' ? t.dangerBg : t.warnBg, border: `0.5px solid ${q.status === 'needs-input' ? t.danger : t.warn}`, borderRadius: 6, padding: '10px 12px', marginTop: 12 }}>
                    <div style={{ fontFamily: t.sansFont, fontSize: 11, fontWeight: 600, color: q.status === 'needs-input' ? t.dangerText : t.warnText, marginBottom: 4 }}>{q.flagReason}</div>
                    <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3 }}><span style={{ color: t.accent }}>Rec: </span>{q.recommendation}</div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Review gate — warn about unanswered questions before approving */}
          {(() => {
            const unanswered = questions.filter(q => !q.answer?.trim()).length;
            return unanswered > 0 ? (
              <div style={{ background: t.warnBg, border: `0.5px solid ${t.warn}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={15} color={t.warn} />
                <span style={{ fontFamily: t.sansFont, fontSize: 12, color: t.warnText }}>
                  <strong>{unanswered} question{unanswered !== 1 ? 's' : ''} still unanswered</strong> — you can proceed, but the questionnaire won't be complete.
                </span>
              </div>
            ) : (
              <div style={{ background: t.accentBg, border: `0.5px solid ${t.accent}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle size={15} color={t.accent} />
                <span style={{ fontFamily: t.sansFont, fontSize: 12, color: t.accentText }}>
                  All {questions.length} questions answered — ready to approve.
                </span>
              </div>
            );
          })()}

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 16, borderTop: `0.5px solid ${t.border}` }}>
            <button onClick={() => setStep('intake')} style={{ ...s.ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={13} />Back</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSaveDraft}
                style={{
                  ...s.ghostBtn,
                  display: 'flex', alignItems: 'center', gap: 6,
                  ...(draftSaved && { borderColor: t.accent, color: t.accent }),
                  transition: 'all .2s',
                }}
              >
                {draftSaved
                  ? <><CheckCircle size={13} />Saved!</>
                  : <><Clock size={13} />Save draft</>
                }
              </button>
              <button onClick={() => setStep('approval')} style={{ ...s.accentBtn, display: 'flex', alignItems: 'center', gap: 6 }}>Approve & Continue<ChevronRight size={13} /></button>
            </div>
          </div>
        </>
      )}

      {step === 'approval' && (
        <ApprovalStep
          t={t} s={s}
          vendor={vendor}
          questions={questions}
          onBack={() => setStep('review')}
          onComplete={() => {
            // Save completed questionnaire to shared knowledge base
            const entry = {
              id:         Date.now(),
              vendor:     vendor || 'Unnamed vendor',
              date:       new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
              questions:  questions.length,
              answered:   questions.filter(q => q.answer?.trim()).length,
              industry:   'General',
              tags:       ['Completed'],
              confidence: questions.length > 0
                ? Math.round(questions.filter(q => q.answer?.trim()).length / questions.length * 100)
                : 0,
              source:     'Complete questionnaire',
              qaData:     questions.map(q => ({ text: q.text, answer: q.answer, source: q.source })),
            };
            if (onAddToKb) onAddToKb(entry);
            if (onDeleteDraft) onDeleteDraft(draftId); // remove from drafts on completion
            sessionStorage.removeItem('serotonin_q_progress');
            setStep('complete');
          }}
        />
      )}

      {step === 'complete' && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: t.doneBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}><CheckCircle size={32} color={t.done} /></div>
          <div style={{ ...s.heroSerif, fontSize: 28, marginBottom: 8 }}>Questionnaire sent.</div>
          <div style={{ fontFamily: t.sansFont, fontSize: 13, color: t.text3, marginBottom: 32 }}>Delivered to {vendor || 'recipient'} and saved to knowledge base.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, maxWidth: 420, margin: '0 auto 32px' }}>
            {[
              [questions.length,                                                          'Questions answered'],
              [`${questions.filter(q => q.answer?.trim()).length}/${questions.length}`,   'Answers filled'],
              ['3',                                                                        'Docs attached'],
            ].map(([v, l]) => (
              <div key={l} style={{ ...s.card, padding: '16px', textAlign: 'center' }}>
                <div style={{ fontFamily: t.serifFont, fontSize: 22, fontWeight: 400, color: t.accent }}>{v}</div>
                <div style={{ ...s.label, marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
          <button onClick={clearProgress} style={s.accentBtn}>Complete another</button>
        </div>
      )}

      {step === 'manual' && (
        <>
          <div style={{ ...s.eyebrow, marginBottom: 6 }}>Manual Entry</div>
          <div style={{ ...s.heroSerif, fontSize: 26, marginBottom: 24 }}>Paste your questions<br /><em style={{ color: t.heroMuted }}>below.</em></div>
          <div style={{ ...s.card, padding: '18px 20px', marginBottom: 14 }}>
            <div style={{ ...s.label, marginBottom: 10 }}>One question per line — or paste the full questionnaire</div>
            <textarea
              value={manualText}
              onChange={e => setManualText(e.target.value)}
              placeholder={`Example:\n1. Does your organization have a SOC 2 Type II certification?\n2. Describe your data backup procedures.\n3. Do you have a dedicated security team?`}
              style={{ ...s.input, minHeight: 280, resize: 'vertical', lineHeight: 1.6 }}
            />
            <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3, marginTop: 8 }}>
              {manualText.split('\n').filter(l => l.trim()).length} lines detected
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 16, borderTop: `0.5px solid ${t.border}` }}>
            <button onClick={() => setStep('intake')} style={{ ...s.ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={13} />Back</button>
            <button
              onClick={() => {
                if (!manualText.trim()) return;
                const parsed = parseQuestions(manualText);
                if (parsed.length === 0) {
                  alert('No questions detected. Make sure each question is on its own line.');
                  return;
                }
                startProcessing(parsed);
              }}
              disabled={!manualText.trim()}
              style={{ ...s.accentBtn, display: 'flex', alignItems: 'center', gap: 6, opacity: manualText.trim() ? 1 : 0.5, cursor: manualText.trim() ? 'pointer' : 'not-allowed' }}
            >
              Process questions<ChevronRight size={13} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── VENDOR DASHBOARD ─────────────────────────────────────────────────────────

function VendorDashboard({ t, s }) {
  const [view, setView] = useState('intake');

  const WipBanner = () => (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      background: t.warnBg, border: `0.5px solid ${t.warn}`,
      borderRadius: 8, padding: '12px 16px', marginBottom: 24,
    }}>
      <AlertTriangle size={16} color={t.warn} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontFamily: t.sansFont, fontSize: 13, fontWeight: 700, color: t.warnText, marginBottom: 3 }}>
          Work in progress — do not use in production
        </div>
        <div style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text3, lineHeight: 1.6 }}>
          Incoming vendor assessments is under active development. Risk scoring and recommendations shown are a preview and may not be accurate. Do not use this module for real vendor decisions until this notice is removed.
        </div>
      </div>
    </div>
  );

  const getRisk = (level) => ({
    LOW:    { color: t.done,   bg: t.doneBg,   text: t.doneText },
    MEDIUM: { color: t.warn,   bg: t.warnBg,   text: t.warnText },
    HIGH:   { color: t.danger, bg: t.dangerBg, text: t.dangerText },
  }[level] || { color: t.dim, bg: t.bg3, text: t.text3 });

  const vendors = [
    { id: 1, name: 'CloudSync Solutions', industry: 'SaaS / Cloud Storage', date: '2024-05-12', score: 72, level: 'MEDIUM', concerns: 5 },
    { id: 2, name: 'DataGuard Analytics', industry: 'Data Analytics', date: '2024-05-10', score: 45, level: 'HIGH', concerns: 8 },
  ];

  if (view === 'analyzing') return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 0' }}>
      <WipBanner />
      <div style={{ textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: t.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}><Shield size={28} color={t.accent} /></div>
      <div style={{ ...s.heroSerif, fontSize: 26, marginBottom: 8 }}>Analyzing vendor response…</div>
      <div style={{ fontFamily: t.sansFont, fontSize: 13, color: t.text3, marginBottom: 32 }}>Evaluating security posture and identifying risk</div>
      <div style={{ ...s.card, padding: 24, textAlign: 'left' }}>
        {[['Questionnaire parsed — 52 responses identified', true], ['Analyzing compliance certifications…', false], ['Evaluating security controls…', false], ['Comparing against requirements…', false]].map(([msg, done]) => (
          <div key={msg} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            {done ? <CheckCircle size={15} color={t.done} /> : <Activity size={15} color={t.accent} />}
            <span style={{ fontFamily: t.sansFont, fontSize: 12, color: done ? t.text2 : t.text3 }}>{msg}</span>
          </div>
        ))}
      </div>
      </div>{/* end textAlign center */}
    </div>
  );

  if (view === 'results') return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <WipBanner />
      <div style={{ ...s.eyebrow, marginBottom: 6 }}>Incoming Vendor Assessments — Risk Report</div>
      <div style={{ ...s.heroSerif, fontSize: 26, marginBottom: 24 }}>CloudSync Solutions<br /><em style={{ fontSize: 18, color: t.heroMuted }}>SaaS / Cloud Storage</em></div>
      <div style={{ background: t.warnBg, border: `0.5px solid ${t.warn}`, borderRadius: 8, padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <div style={{ fontFamily: t.serifFont, fontSize: 52, fontWeight: 400, color: t.warn, lineHeight: 1 }}>72</div>
          <div><div style={s.pill(t.warnBg, t.warnText)}>Medium Risk</div><div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3, marginTop: 4 }}>Score out of 100</div></div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ ...s.label, marginBottom: 6 }}>Recommendation</div>
          <div style={{ fontFamily: t.sansFont, fontSize: 14, fontWeight: 700, color: t.warnText }}>Conditional Approval</div>
          <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3, marginTop: 2 }}>2 critical items must be resolved</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[['2', 'Critical', t.danger, t.dangerBg], ['3', 'Medium', t.warn, t.warnBg], ['4', 'Strengths', t.done, t.doneBg], ['100%', 'Completion', t.accent, t.accentBg]].map(([v, l, c, bg]) => (
          <div key={l} style={{ background: bg, border: `0.5px solid ${c}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontFamily: t.serifFont, fontSize: 24, fontWeight: 400, color: c, lineHeight: 1 }}>{v}</div>
            <div style={{ ...s.label, marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ ...s.card, padding: '18px 20px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}><XCircle size={16} color={t.danger} /><div style={{ ...s.label, color: t.dangerText }}>Critical concerns — must address</div></div>
        {[['No SOC 2 Type II certification', 'Last audit completed in 2022. No current certification on file.', 'Require updated SOC 2 Type II within 90 days.'], ['Data retention exceeds policy limits', 'Vendor retains data for 7 years; our policy allows maximum 3 years.', 'Negotiate 3-year retention in contract.']].map(([issue, detail, fix]) => (
          <div key={issue} style={{ ...s.cardInner, padding: '14px 16px', marginBottom: 10, border: `0.5px solid ${t.danger}` }}>
            <div style={{ fontFamily: t.sansFont, fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 6 }}>{issue}</div>
            <div style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text3, marginBottom: 8 }}>{detail}</div>
            <div style={{ background: t.dangerBg, borderRadius: 5, padding: '7px 10px' }}>
              <span style={{ fontFamily: t.sansFont, fontSize: 11, fontWeight: 600, color: t.dangerText }}>Required: </span>
              <span style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3 }}>{fix}</span>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => setView('intake')} style={s.ghostBtn}>← Back to dashboard</button>
    </div>
  );

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <WipBanner />
      <div style={{ ...s.eyebrow, marginBottom: 6 }}>Incoming Vendor Assessments</div>
      <div style={{ ...s.heroSerif, fontSize: 28, marginBottom: 28 }}>Review incoming<br /><em style={{ color: t.heroMuted }}>vendor submissions.</em></div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ ...s.label, marginBottom: 12 }}>Pending reviews</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {vendors.filter(v => v.id === 1).map(v => {
            const r = getRisk(v.level);
            return (
              <button key={v.id} onClick={() => { setView('analyzing'); setTimeout(() => setView('results'), 2500); }} style={{ ...s.card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: t.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Building size={16} color={t.accent} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: t.sansFont, fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 3 }}>{v.name}</div>
                  <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3 }}>{v.industry} · Submitted {v.date} · {v.concerns} concerns</div>
                </div>
                <span style={s.pill(t.warnBg, t.warnText)}>Pending review</span>
                <ChevronRight size={14} color={t.dim} />
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div style={{ ...s.label, marginBottom: 12 }}>Start new evaluation</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {[{ icon: Mail, label: 'Gmail', desc: 'Find in inbox' }, { icon: FolderOpen, label: 'Google Drive', desc: 'Select from Drive' }, { icon: Upload, label: 'Upload file', desc: 'PDF, DOCX, XLSX' }].map(opt => (
            <button key={opt.label} onClick={() => { setView('analyzing'); setTimeout(() => setView('results'), 2500); }} style={{ ...s.card, padding: '18px', textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: t.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}><opt.icon size={16} color={t.accent} /></div>
              <div style={{ fontFamily: t.sansFont, fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 2 }}>{opt.label}</div>
              <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── BATCH PROCESSING ─────────────────────────────────────────────────────────

function BatchProcessing({ t, s }) {
  const [view, setView] = useState('queue');
  const [progress, setProgress] = useState(0);

  const WipBanner = () => (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      background: t.warnBg, border: `0.5px solid ${t.warn}`,
      borderRadius: 8, padding: '12px 16px', marginBottom: 24,
    }}>
      <AlertTriangle size={16} color={t.warn} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontFamily: t.sansFont, fontSize: 13, fontWeight: 700, color: t.warnText, marginBottom: 3 }}>
          Work in progress — do not use in production
        </div>
        <div style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text3, lineHeight: 1.6 }}>
          Batch processing is under active development. Features shown are a preview and may not function correctly. Do not rely on this module for real questionnaire processing until this notice is removed.
        </div>
      </div>
    </div>
  );

  const queue = [
    { id: 1, vendor: 'Acme Healthcare', priority: 1, deadline: '2024-05-15', questions: 45, est: '25 min' },
    { id: 2, vendor: 'MedTech Systems', priority: 2, deadline: '2024-05-18', questions: 38, est: '20 min' },
    { id: 3, vendor: 'Cloud Backup Co', priority: 3, deadline: '2024-05-20', questions: 52, est: '30 min' },
  ];

  const priColor = (p) => p === 1 ? { bg: t.dangerBg, color: t.dangerText } : p === 2 ? { bg: t.warnBg, color: t.warnText } : { bg: t.bg3, color: t.text3 };

  const startBatch = () => {
    setView('processing');
    let p = 0;
    const iv = setInterval(() => {
      p += 2;
      setProgress(Math.min(p, 100));
      if (p >= 100) { clearInterval(iv); setTimeout(() => setView('complete'), 800); }
    }, 80);
  };

  if (view === 'processing') return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <WipBanner />
      <div style={{ ...s.eyebrow, marginBottom: 6 }}>Batch Processing</div>
      <div style={{ ...s.heroSerif, fontSize: 26, marginBottom: 28 }}>Processing in progress…<br /><em style={{ color: t.heroMuted }}>1 of 3 questionnaires.</em></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[['1/3', 'Current'], ['0', 'Done'], ['3', 'Remaining'], ['~1h 15m', 'Est. left']].map(([v, l]) => (
          <div key={l} style={{ ...s.card, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontFamily: t.serifFont, fontSize: 22, fontWeight: 400, color: t.accent }}>{v}</div>
            <div style={{ ...s.label, marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ ...s.card, padding: '18px 20px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <div><div style={{ ...s.label, marginBottom: 4 }}>Now processing</div><div style={{ fontFamily: t.sansFont, fontSize: 15, fontWeight: 600, color: t.text }}>Acme Healthcare</div></div>
          <div style={{ fontFamily: t.serifFont, fontSize: 24, color: t.accent }}>{progress}%</div>
        </div>
        <div style={{ height: 4, background: t.border, borderRadius: 2 }}><div style={{ height: '100%', width: `${progress}%`, background: t.accent, borderRadius: 2, transition: 'width .1s' }} /></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
        <button style={{ ...s.ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}><Pause size={13} />Pause</button>
        <button style={{ ...s.ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}><SkipForward size={13} />Skip</button>
      </div>
    </div>
  );

  if (view === 'complete') return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 0' }}>
      <WipBanner />
      <div style={{ textAlign: 'center' }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: t.doneBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}><CheckCircle size={32} color={t.done} /></div>
      <div style={{ ...s.heroSerif, fontSize: 28, marginBottom: 8 }}>Batch complete.</div>
      <div style={{ fontFamily: t.sansFont, fontSize: 13, color: t.text3, marginBottom: 32 }}>3 questionnaires processed successfully</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 32 }}>
        {[['3', 'Completed'], ['~2.5hrs', 'Time saved'], ['87%', 'Avg auto-fill']].map(([v, l]) => (
          <div key={l} style={{ ...s.card, padding: '16px', textAlign: 'center' }}>
            <div style={{ fontFamily: t.serifFont, fontSize: 22, fontWeight: 400, color: t.accent }}>{v}</div>
            <div style={{ ...s.label, marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button style={{ ...s.ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}><Download size={13} />Download all reports</button>
        <button onClick={() => { setView('queue'); setProgress(0); }} style={s.accentBtn}>Start new batch</button>
      </div>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <WipBanner />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ ...s.eyebrow, marginBottom: 6 }}>Batch Processing</div>
          <div style={{ ...s.heroSerif, fontSize: 28 }}>Process multiple<br /><em style={{ color: t.heroMuted }}>questionnaires at once.</em></div>
        </div>
        <button onClick={startBatch} style={{ ...s.accentBtn, display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}><Play size={13} />Start batch</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 24 }}>
        {[['3', 'In queue'], ['135', 'Total questions'], ['~1h 15m', 'Est. time'], ['80%', 'Efficiency gain']].map(([v, l]) => (
          <div key={l} style={{ ...s.card, padding: '14px 16px' }}>
            <div style={{ fontFamily: t.serifFont, fontSize: 22, fontWeight: 400, color: t.text, lineHeight: 1 }}>{v}</div>
            <div style={{ ...s.label, marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ ...s.card, overflow: 'hidden' }}>
        <div style={{ background: t.bg3, borderBottom: `0.5px solid ${t.border}`, padding: '10px 16px' }}><div style={s.label}>Processing queue</div></div>
        {queue.map((item, i) => {
          const pc = priColor(item.priority);
          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: i < queue.length - 1 ? `0.5px solid ${t.border}` : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: 7, background: pc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.serifFont, fontSize: 16, fontWeight: 400, color: pc.color, flexShrink: 0 }}>{item.priority}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: t.sansFont, fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 2 }}>{item.vendor}</div>
                <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3 }}>{item.questions} questions · Due {item.deadline} · ~{item.est}</div>
              </div>
              <span style={s.pill(t.bg3, t.text3)}>Queued</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── KNOWLEDGE BASE ───────────────────────────────────────────────────────────

function KnowledgeBase({ t, s, kbEntries = [], kbDocs = [], onAddDoc, onRemoveDoc, onDeleteEntry }) {
  const [view,          setView]          = useState('library');
  const [viewMode,      setViewMode]      = useState('grid');
  const [search,        setSearch]        = useState('');
  const [showStorage,   setShowStorage]   = useState(false);
  const [selectedTags,  setSelectedTags]  = useState([]);
  const [activeFilter,  setActiveFilter]  = useState('all');
  const [expandedId,    setExpandedId]    = useState(null);
  const [docCategory,   setDocCategory]   = useState('');
  const [docNote,       setDocNote]       = useState('');
  const [importing,     setImporting]     = useState(false);
  const [importedFiles, setImportedFiles] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // entry to confirm-delete

  // Derive tag list from real entries only
  const allTags = [...new Set(kbEntries.flatMap(q => q.tags || []))];

  const filtered = kbEntries.filter(q => {
    const matchSearch = search === '' ||
      q.vendor.toLowerCase().includes(search.toLowerCase()) ||
      (q.tags || []).some(tg => tg.toLowerCase().includes(search.toLowerCase()));
    const matchTags = selectedTags.length === 0 ||
      selectedTags.every(tg => (q.tags || []).includes(tg));
    const matchFilter = activeFilter === 'all' || q.source === 'Complete questionnaire';
    return matchSearch && matchTags && matchFilter;
  });

  const completedCount = kbEntries.filter(q => q.source === 'Complete questionnaire').length;
  const totalQuestions = kbEntries.reduce((sum, q) => sum + (q.questions || 0), 0);
  const avgConfidence  = kbEntries.length > 0
    ? Math.round(kbEntries.reduce((sum, q) => sum + (q.confidence || 0), 0) / kbEntries.length)
    : 0;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {showStorage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 24 }}>
          <div style={{ background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 12, maxWidth: 560, width: '100%', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div><div style={{ ...s.heroSerif, fontSize: 22 }}>Storage & Security</div><div style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text3, marginTop: 4 }}>How Serotonin stores and protects your data</div></div>
              <button onClick={() => setShowStorage(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text3 }}><X size={18} /></button>
            </div>
            {[['Primary', 'Encrypted cloud database (AWS RDS / GCP SQL). Backups every 6 hours.'], ['Files', 'Encrypted object storage (S3/GCS) with versioning enabled.'], ['Search', 'Elasticsearch cluster — full-text search under 500ms.'], ['Backup', 'Geo-redundant, multiple regions, 90-day retention.']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.accent, marginTop: 6, flexShrink: 0 }} />
                <div><span style={{ fontFamily: t.sansFont, fontSize: 12, fontWeight: 600, color: t.text }}>{k}: </span><span style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text3 }}>{v}</span></div>
              </div>
            ))}
            <div style={{ background: t.accentBg, border: `0.5px solid ${t.accent}`, borderRadius: 7, padding: '12px 14px', marginTop: 16 }}>
              <div style={{ ...s.label, color: t.accentText, marginBottom: 8 }}>Compliance certifications</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['SOC 2 Type II', 'ISO 27001', 'HIPAA', 'GDPR'].map(c => <span key={c} style={s.pill(t.bg2, t.accent)}>{c}</span>)}
              </div>
            </div>
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}><button onClick={() => setShowStorage(false)} style={s.accentBtn}>Got it</button></div>
          </div>
        </div>
      )}

      {view === 'library' && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <div style={{ ...s.eyebrow, marginBottom: 6 }}>Knowledge Base</div>
              <div style={{ ...s.heroSerif, fontSize: 28 }}>Search and reference<br /><em style={{ color: t.heroMuted }}>completed assessments.</em></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => setShowStorage(true)} style={{ ...s.ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}><Database size={13} />Storage info</button>
              <button onClick={() => setView('import')} style={{ ...s.accentBtn, display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={13} />Import</button>
            </div>
          </div>

          {/* Stats — derived from real entries */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 22 }}>
            {[
              [kbEntries.length,       'Questionnaires',   t.text],
              [totalQuestions,         'Total questions',  t.text],
              [completedCount,         'Completed docs',   t.accent],
              [kbDocs.length,          'Policy documents', t.accent],
            ].map(([v, l, c]) => (
              <div key={l} style={{ ...s.card, padding: '12px 14px' }}>
                <div style={{ fontFamily: t.serifFont, fontSize: 20, fontWeight: 400, color: c, lineHeight: 1 }}>{v}</div>
                <div style={{ ...s.label, marginTop: 3 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {[
              ['all',       'All entries'],
              ['completed', `Completed (${completedCount})`],
              ['documents', `Policy documents (${kbDocs.length})`],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                style={{
                  padding: '6px 14px', borderRadius: 6,
                  border: `0.5px solid ${activeFilter === key ? t.accent : t.border}`,
                  background: activeFilter === key ? t.accentBg : 'transparent',
                  color: activeFilter === key ? t.accent : t.text3,
                  fontFamily: t.sansFont, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search + view toggle */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={14} color={t.text3} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by vendor, tag…" style={{ ...s.input, paddingLeft: 34 }} />
            </div>
            <div style={{ display: 'flex', gap: 4, background: t.bg2, border: `0.5px solid ${t.border}`, borderRadius: 7, padding: 3 }}>
              <button onClick={() => setViewMode('grid')} style={{ width: 30, height: 30, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: viewMode === 'grid' ? t.accent : 'transparent', border: 'none', cursor: 'pointer', color: viewMode === 'grid' ? '#fff' : t.dim }}><Grid size={14} /></button>
              <button onClick={() => setViewMode('list')} style={{ width: 30, height: 30, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: viewMode === 'list' ? t.accent : 'transparent', border: 'none', cursor: 'pointer', color: viewMode === 'list' ? '#fff' : t.dim }}><List size={14} /></button>
            </div>
          </div>

          {/* Tag filters */}
          {allTags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
              {allTags.map(tag => (
                <button key={tag} onClick={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag])} style={{ padding: '4px 10px', borderRadius: 5, border: `0.5px solid ${selectedTags.includes(tag) ? t.accent : t.border}`, background: selectedTags.includes(tag) ? t.accentBg : 'transparent', color: selectedTags.includes(tag) ? t.accent : t.text3, fontFamily: t.sansFont, fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>{tag}</button>
              ))}
            </div>
          )}

          {/* Policy documents view */}
          {activeFilter === 'documents' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {kbDocs.length === 0 ? (
                <div style={{ ...s.card, padding: '48px 24px', textAlign: 'center' }}>
                  <FileText size={32} color={t.text3} style={{ margin: '0 auto 16px' }} />
                  <div style={{ fontFamily: t.sansFont, fontSize: 15, fontWeight: 600, color: t.text2, marginBottom: 8 }}>No policy documents yet</div>
                  <div style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text3, marginBottom: 20, lineHeight: 1.6 }}>
                    Import access control policies, disaster recovery plans, SOC 2 reports, and other security documents.
                  </div>
                  <button onClick={() => setView('import')} style={{ ...s.accentBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Upload size={13} />Import documents
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                    <button onClick={() => setView('import')} style={{ ...s.accentBtn, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                      <Upload size={12} />Import more
                    </button>
                  </div>
                  {kbDocs.map(doc => (
                    <div key={doc.id} style={{ ...s.card, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      {/* Icon */}
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: t.accentBg, border: `0.5px solid ${t.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <FileText size={18} color={t.accent} />
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: t.sansFont, fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 3 }}>{doc.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={s.pill(t.accentBg, t.accentText)}>{doc.category}</span>
                          <span style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3 }}>{doc.size}</span>
                          <span style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3 }}>{doc.date}</span>
                        </div>
                        {doc.note && (
                          <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text2, marginTop: 6, lineHeight: 1.5 }}>{doc.note}</div>
                        )}
                      </div>
                      {/* Remove */}
                      <button
                        onClick={() => onRemoveDoc && onRemoveDoc(doc.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text3, padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                        title="Remove"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Empty state for other filters */}
          {activeFilter !== 'documents' && filtered.length === 0 && (
            <div style={{ ...s.card, padding: '48px 24px', textAlign: 'center' }}>
              <BookOpen size={32} color={t.text3} style={{ margin: '0 auto 16px' }} />
              <div style={{ fontFamily: t.sansFont, fontSize: 15, fontWeight: 600, color: t.text2, marginBottom: 8 }}>
                {kbEntries.length === 0
                  ? 'No entries yet'
                  : activeFilter === 'completed' ? 'No completed documents yet' : 'No results match your search'}
              </div>
              <div style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text3, lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>
                {kbEntries.length === 0
                  ? 'Complete a questionnaire in the Complete questionnaire tab — it will automatically appear here when marked complete.'
                  : 'Try adjusting your search or filters.'}
              </div>
            </div>
          )}

          {/* Entry cards — questionnaires */}
          {activeFilter !== 'documents' && (
          <div style={viewMode === 'grid' ? { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 } : { display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(q => (
              <div key={q.id} style={{ ...s.card, padding: '16px 18px', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: t.sansFont, fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 2 }}>{q.vendor}</div>
                    <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={11} />{q.date}
                      {q.source && <span style={{ ...s.pill(t.accentBg, t.accentText), marginLeft: 4 }}>{q.source}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ ...s.pill(t.accentBg, t.accentText), fontSize: 11 }}>{q.confidence}%</span>
                    {/* Delete button */}
                    <button
                      onClick={() => setDeleteConfirm(q)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text3, padding: 3, display: 'flex', alignItems: 'center', borderRadius: 4, transition: 'color .15s' }}
                      title="Delete entry"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: `0.5px solid ${t.border}` }}>
                  <div><div style={s.label}>Questions</div><div style={{ fontFamily: t.sansFont, fontSize: 14, fontWeight: 600, color: t.text, marginTop: 2 }}>{q.questions}</div></div>
                  <div><div style={s.label}>Answered</div><div style={{ fontFamily: t.sansFont, fontSize: 14, fontWeight: 600, color: t.accent, marginTop: 2 }}>{q.answered}</div></div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: q.qaData?.length ? 10 : 0 }}>
                  {(q.tags || []).map(tag => <span key={tag} style={s.pill(t.accentBg, t.accentText)}>{tag}</span>)}
                </div>

                {/* Expandable Q&A preview */}
                {q.qaData?.length > 0 && (
                  <>
                    <button
                      onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: t.sansFont, fontSize: 11, color: t.accent, fontWeight: 600, padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      {expandedId === q.id ? <ChevronRight size={12} style={{ transform: 'rotate(90deg)' }} /> : <ChevronRight size={12} />}
                      {expandedId === q.id ? 'Hide' : 'View'} questions & answers
                    </button>

                    {expandedId === q.id && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {q.qaData.map((qa, i) => (
                          <div key={i} style={{ background: t.bg, border: `0.5px solid ${t.border}`, borderRadius: 6, padding: '10px 12px' }}>
                            <div style={{ fontFamily: t.sansFont, fontSize: 11, fontWeight: 600, color: t.text, marginBottom: 4 }}>Q{i + 1}: {qa.text}</div>
                            <div style={{ fontFamily: t.sansFont, fontSize: 11, color: qa.answer ? t.text2 : t.text3, fontStyle: qa.answer ? 'normal' : 'italic' }}>
                              {qa.answer || 'No answer provided'}
                            </div>
                            {qa.source && <div style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3, marginTop: 4 }}>Source: {qa.source}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          )} {/* end activeFilter !== documents */}

          {/* ── Delete confirmation modal ── */}
          {deleteConfirm && (
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
              onClick={() => setDeleteConfirm(null)}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{ background: t.bg2, border: `0.5px solid ${t.border}`, borderRadius: 12, padding: '28px 28px 24px', maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
              >
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: t.dangerBg, border: `0.5px solid ${t.danger}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <AlertTriangle size={20} color={t.danger} />
                </div>
                <div style={{ fontFamily: t.serifFont, fontSize: 20, fontWeight: 400, color: t.text, marginBottom: 8 }}>
                  Delete this entry?
                </div>
                <div style={{ fontFamily: t.sansFont, fontSize: 13, color: t.text2, lineHeight: 1.6, marginBottom: 6 }}>
                  <strong style={{ color: t.text }}>{deleteConfirm.vendor}</strong>
                </div>
                <div style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text3, lineHeight: 1.6, marginBottom: 24 }}>
                  This will permanently remove {deleteConfirm.questions} question{deleteConfirm.questions !== 1 ? 's' : ''} and all answers from your knowledge base. This cannot be undone.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    style={{ ...s.ghostBtn, flex: 1 }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (onDeleteEntry) onDeleteEntry(deleteConfirm.id);
                      setDeleteConfirm(null);
                    }}
                    style={{
                      flex: 1, background: t.danger, color: '#fff',
                      border: 'none', borderRadius: 6, padding: '7px 16px',
                      fontFamily: t.sansFont, fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', letterSpacing: '.02em',
                    }}
                  >
                    Yes, delete permanently
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {view === 'import' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <button onClick={() => setView('library')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text3, display: 'flex', padding: 2 }}><ArrowLeft size={16} /></button>
            <div style={{ ...s.eyebrow }}>Import documents</div>
          </div>
          <div style={{ ...s.heroSerif, fontSize: 26, marginBottom: 6 }}>
            Add security documents<br /><em style={{ color: t.heroMuted }}>to your library.</em>
          </div>
          <div style={{ fontFamily: t.sansFont, fontSize: 13, color: t.text3, marginBottom: 28, lineHeight: 1.6 }}>
            Import access control policies, disaster recovery plans, SOC 2 reports, BCP docs, and any other security reference material. These will be available to reference when completing questionnaires.
          </div>

          {/* Category selector */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...s.label, marginBottom: 8 }}>Document category</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {[
                'Access Control Policy',
                'Disaster Recovery Plan',
                'Business Continuity Plan',
                'SOC 2 Report',
                'Information Security Policy',
                'Incident Response Plan',
                'Data Classification Policy',
                'Vendor Management Policy',
                'Risk Assessment',
                'Penetration Test Report',
                'Business Associate Agreement',
                'Other',
              ].map(cat => (
                <button
                  key={cat}
                  onClick={() => setDocCategory(cat)}
                  style={{
                    padding: '8px 12px', borderRadius: 6, textAlign: 'left',
                    border: `0.5px solid ${docCategory === cat ? t.accent : t.border}`,
                    background: docCategory === cat ? t.accentBg : t.bg2,
                    color: docCategory === cat ? t.accent : t.text2,
                    fontFamily: t.sansFont, fontSize: 11, fontWeight: docCategory === cat ? 600 : 400,
                    cursor: 'pointer', transition: 'all .15s',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Notes field */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ ...s.label, marginBottom: 6 }}>Notes (optional)</div>
            <input
              value={docNote}
              onChange={e => setDocNote(e.target.value)}
              placeholder="e.g. Last reviewed Q1 2025 · Version 3.2 · Approved by CISO"
              style={s.input}
            />
          </div>

          {/* File drop zone */}
          <label style={{ display: 'block', cursor: 'pointer', marginBottom: 16 }}>
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.txt,.csv"
              style={{ display: 'none' }}
              onChange={e => {
                const files = Array.from(e.target.files);
                setImportedFiles(prev => [
                  ...prev,
                  ...files.map(f => ({ name: f.name, size: f.size, file: f }))
                ]);
                e.target.value = '';
              }}
            />
            <div style={{
              border: `1.5px dashed ${importedFiles.length > 0 ? t.accent : t.border}`,
              borderRadius: 10, padding: '32px 24px', textAlign: 'center',
              background: importedFiles.length > 0 ? t.accentBg : 'transparent',
              transition: 'all .2s',
            }}>
              <Upload size={28} color={importedFiles.length > 0 ? t.accent : t.text3} style={{ margin: '0 auto 12px' }} />
              <div style={{ fontFamily: t.sansFont, fontSize: 14, fontWeight: 600, color: importedFiles.length > 0 ? t.accent : t.text2, marginBottom: 4 }}>
                {importedFiles.length > 0 ? `${importedFiles.length} file${importedFiles.length !== 1 ? 's' : ''} selected` : 'Click to select files'}
              </div>
              <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3 }}>
                PDF, DOCX, DOC, XLSX, PPTX, TXT, CSV
              </div>
            </div>
          </label>

          {/* Selected files list */}
          {importedFiles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              {importedFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: t.bg2, border: `0.5px solid ${t.border}`, borderRadius: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={13} color={t.accent} />
                    <div>
                      <div style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text, fontWeight: 500 }}>{f.name}</div>
                      <div style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3 }}>
                        {f.size < 1024 ? f.size + ' B' : f.size < 1048576 ? (f.size/1024).toFixed(1) + ' KB' : (f.size/1048576).toFixed(1) + ' MB'}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setImportedFiles(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text3, display: 'flex', padding: 4 }}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Validation hint */}
          {!docCategory && importedFiles.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: t.warnBg, border: `0.5px solid ${t.warn}`, borderRadius: 7, marginBottom: 16 }}>
              <AlertTriangle size={14} color={t.warn} />
              <span style={{ fontFamily: t.sansFont, fontSize: 12, color: t.warnText }}>Please select a document category above before importing.</span>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: `0.5px solid ${t.border}` }}>
            <button onClick={() => { setView('library'); setImportedFiles([]); setDocCategory(''); setDocNote(''); }} style={{ ...s.ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft size={13} />Cancel
            </button>
            <button
              disabled={importedFiles.length === 0 || !docCategory || importing}
              onClick={() => {
                if (!docCategory || importedFiles.length === 0) return;
                setImporting(true);
                // Simulate brief import then save each file to kbDocs
                setTimeout(() => {
                  importedFiles.forEach(f => {
                    onAddDoc && onAddDoc({
                      id:       Date.now() + Math.random(),
                      name:     f.name,
                      category: docCategory,
                      note:     docNote,
                      size:     f.size < 1024 ? f.size + ' B' : f.size < 1048576 ? (f.size/1024).toFixed(1) + ' KB' : (f.size/1048576).toFixed(1) + ' MB',
                      date:     new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
                      source:   'Imported',
                      tags:     [docCategory],
                    });
                  });
                  setImporting(false);
                  setImportedFiles([]);
                  setDocCategory('');
                  setDocNote('');
                  setActiveFilter('documents');
                  setView('library');
                }, 800);
              }}
              style={{
                ...s.accentBtn,
                display: 'flex', alignItems: 'center', gap: 6,
                opacity: (importedFiles.length === 0 || !docCategory || importing) ? 0.5 : 1,
                cursor: (importedFiles.length === 0 || !docCategory || importing) ? 'not-allowed' : 'pointer',
              }}
            >
              {importing ? (
                <><Activity size={13} />Importing…</>
              ) : (
                <><CheckCircle size={13} />Import {importedFiles.length > 0 ? `${importedFiles.length} document${importedFiles.length !== 1 ? 's' : ''}` : 'documents'}</>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── INTERNAL WIKI ────────────────────────────────────────────────────────────

const WIKI = [
  {
    id: 'getting-started',
    icon: '🚀',
    title: 'Getting started',
    subtitle: 'New to Serotonin? Start here.',
    articles: [
      {
        id: 'what-is-serotonin',
        title: 'What is Serotonin?',
        content: `Serotonin is an internal GRC operations platform that automates the security questionnaire lifecycle. Instead of spending 4+ hours manually answering the same security questions every time a vendor or customer asks, Serotonin helps you complete questionnaires in about 25 minutes by drawing from your existing compliance data.

**What it does:**
- Completes outbound security questionnaires on your behalf using your compliance history
- Scores incoming vendor questionnaires for risk (0–100)
- Batches and automates multiple questionnaires overnight
- Maintains a searchable knowledge base of every past questionnaire

**Who it's for:**
This platform is for GRC analysts, security team members, and anyone responsible for responding to vendor security questionnaires or evaluating third-party risk.`,
      },
      {
        id: 'first-questionnaire',
        title: 'Completing your first questionnaire',
        content: `This walkthrough takes you through the complete flow from start to finish.

**Step 1 — Navigate to Complete questionnaire**
Click "Complete questionnaire" in the left sidebar or click the card on the Dashboard.

**Step 2 — Choose your source**
You'll be asked where the questionnaire is coming from:
- **Gmail** — opens your inbox filtered to security questionnaires. Copy the questions and paste them in.
- **Google Drive** — paste the sharing link to your Drive file.
- **Upload file** — select a PDF, DOCX, XLSX, or CSV from your computer.
- **Manual entry** — paste questions directly, one per line.

**Step 3 — Enter the vendor name**
Type the name of the company requesting the questionnaire in the Vendor name field. You can also assign it to a team member.

**Step 4 — Review answers**
Serotonin populates answers from your knowledge base. Review each one:
- Green "Auto-filled" tags mean high confidence
- Amber "Review" tags need your attention
- Red "Manual" tags have no match — you'll need to fill these in yourself

**Step 5 — Approve and send**
Click "Approve & Continue", attach any supporting documents (SOC 2 reports, policies, BAAs), then either Download PDF or Send Email. You must do one before marking complete.

**Step 6 — It's saved automatically**
Once marked complete, the questionnaire is added to your Knowledge base for future reference.`,
      },
      {
        id: 'saving-drafts',
        title: 'Saving and resuming drafts',
        content: `You don't have to complete a questionnaire in one sitting.

**To save a draft:**
While on the Review step, click the "Save draft" button in the bottom-right. The button briefly shows "Saved!" with a green checkmark to confirm.

**To resume a draft:**
Go to the Dashboard. Any saved drafts appear in the Active assessments panel with a progress bar and the step you were on. Click any row to resume exactly where you left off — all your answers are preserved.

**Draft details shown on Dashboard:**
- Vendor name
- Current step (Source / Review / Approval)
- Owner (who created it)
- Assignee (if assigned to someone)
- Time since last save
- Answer completion percentage

**To discard a draft:**
Resume it, then click the "Complete another" button on the final screen, or use the Discard button on the resume banner.`,
      },
    ],
  },
  {
    id: 'modules',
    icon: '🗂',
    title: 'Modules guide',
    subtitle: 'How each section of the app works.',
    articles: [
      {
        id: 'dashboard',
        title: 'Dashboard',
        content: `The Dashboard is your home base. It gives you a live overview of everything happening across the platform.

**Active assessments panel**
Shows all in-progress questionnaires saved as drafts. Each row shows:
- Vendor name
- Step badge (what stage it's at)
- Owner and assignee
- How long ago it was last saved
- A progress bar showing answer completion

Click any row to resume that questionnaire.

**Module cards**
Quick navigation to Complete questionnaire, Incoming vendor assessments, and Batch processing.

**Knowledge base shortcut**
Shows how many completed questionnaires are in your library.

**This month stats**
Live counts of completed questionnaires, in-progress drafts, and total questions answered — all derived from your real data, not estimates.`,
      },
      {
        id: 'complete-questionnaire',
        title: 'Complete questionnaire',
        content: `The Complete questionnaire module is the core of Serotonin. It takes you through a 5-step workflow.

**Step 1 — Source**
Choose where to import the questionnaire from. You can also set a vendor name and optionally assign the questionnaire to a team member.

**Step 2 — Process**
Serotonin searches your knowledge base and auto-fills answers. The stats panel shows how many questions were found, auto-filled, and flagged.

**Step 3 — Review**
Edit any answer directly in the text fields. The status banner at the bottom tells you in real time how many questions are still unanswered and turns green when all are filled.

**Step 4 — Approve**
Final review before sending. Attach supporting documents (SOC 2 reports, policies, BAAs) using the file upload area. You must either Send Email or Download PDF before marking complete — this ensures a copy exists outside the system.

**Step 5 — Done**
The questionnaire is saved to your knowledge base and removed from active drafts.`,
      },
      {
        id: 'vendor-assessments',
        title: 'Incoming vendor assessments',
        content: `Use this module to evaluate security questionnaires submitted by third-party vendors.

**How scoring works**
Serotonin analyses vendor responses and outputs a risk score from 0 to 100:
- **75–100** — Low risk. Vendor has strong security posture.
- **50–74** — Medium risk. Conditional approval recommended.
- **Below 50** — High risk. Significant gaps identified.

**What you see in results**
- Overall risk score with a recommendation (Approve / Conditional / Reject)
- Critical concerns — issues that must be resolved before approval
- Medium concerns — items to monitor
- Compliance strengths — positive findings
- Remediation guidance for each concern

**Recommendation types**
- **Approve** — proceed with vendor relationship
- **Conditional approval** — approve with specific contractual requirements
- **Reject** — risk level too high to proceed`,
      },
      {
        id: 'batch-processing',
        title: 'Batch processing',
        content: `Batch processing lets you queue multiple questionnaires and process them automatically — useful for high-volume periods or overnight runs.

**Adding to the queue**
Each item in the queue shows vendor name, priority level (1–3), deadline, estimated question count, and processing time.

**Priority levels**
- Priority 1 (red) — process first, typically time-sensitive
- Priority 2 (amber) — standard processing
- Priority 3 (grey) — low urgency, process last

**Controls**
- **Start batch** — begins processing all items in queue order
- **Pause** — suspends processing after the current questionnaire finishes
- **Skip** — skips the current item and moves to the next
- **Resume** — continues a paused batch

**Progress tracking**
A live progress bar shows the current questionnaire's completion. Stats update in real time showing how many are done, remaining, and estimated time left.`,
      },
      {
        id: 'knowledge-base',
        title: 'Knowledge base',
        content: `The Knowledge base is Serotonin's institutional memory. Every questionnaire you complete is automatically added here.

**Three filter tabs**
- **All entries** — everything in the library
- **Completed** — questionnaires marked complete through the editor
- **Policy documents** — manually imported policy and compliance documents

**Searching**
Type any vendor name or tag in the search bar. Results filter in real time.

**Tag filtering**
Click tag chips below the search bar to filter by category (SOC 2, HIPAA, Completed, etc.)

**Viewing Q&A**
Each card has a "View questions & answers" toggle that expands to show every question and its answer inline.

**Deleting an entry**
Click the × button on any card. A confirmation modal will ask you to confirm before permanently deleting — this cannot be undone.

**Importing documents**
Click Import to add policy documents, SOC 2 reports, disaster recovery plans, and other security reference material. Select a category, add optional notes, then upload one or more files.`,
      },
    ],
  },
  {
    id: 'data-security',
    icon: '🔒',
    title: 'Data & security',
    subtitle: 'How your data is protected.',
    articles: [
      {
        id: 'encryption',
        title: 'Encryption and data protection',
        content: `Serotonin takes data security seriously. Here is exactly how your data is protected at every layer.

**Encryption at rest**
All data stored in the database (questionnaires, questions, answers, profiles, documents) is encrypted using AES-256. This means even if someone physically obtained the storage media, the data would be unreadable without the encryption key.

**Encryption in transit**
All connections between your browser and Serotonin's servers use TLS 1.2/1.3. Your data is never transmitted unencrypted.

**File storage**
Uploaded documents (PDFs, DOCX files, SOC 2 reports) are stored in encrypted object storage, also using AES-256 at the object level.

**Row-level security**
The database enforces row-level security (RLS) on every table. This means each user can only read and write their own data — even at the database query level, not just the application level.

**Session management**
Sessions automatically expire after 15 minutes of inactivity (HIPAA requirement). A 2-minute warning appears before the session ends.`,
      },
      {
        id: 'access-control',
        title: 'Access control',
        content: `**Authentication**
Serotonin uses Supabase Auth for all authentication. You can sign in with:
- Email and password
- Google SSO (single sign-on)

New accounts require an administrator invitation — there is no self-registration.

**Authorization**
Every database table has row-level security enabled. Users can only access data they created. There is no way to access another user's questionnaires, knowledge base entries, or profile.

**Session tokens**
Sessions use JWT tokens managed by Supabase. Tokens are stored in memory only — not in localStorage — and are invalidated on sign-out.

**Password reset**
Use the Forgot password link on the sign-in screen. A reset link is sent to your email. Links expire after 24 hours.

**Sign out**
Click your profile avatar in the top-right corner, then click Sign out. This immediately invalidates your session server-side.`,
      },
      {
        id: 'compliance',
        title: 'HIPAA & SOC 2 compliance posture',
        content: `**Current compliance controls in place:**

- AES-256 encryption at rest and TLS in transit
- Row-level security on all database tables
- 15-minute automatic session timeout (HIPAA §164.312(a)(2)(iii))
- Audit log capturing every create, update, delete action with user ID and timestamp
- HTTP security headers: HSTS, CSP, X-Frame-Options, X-Content-Type-Options
- No credentials or sensitive data in client-side code
- Supabase is SOC 2 Type II certified

**For full HIPAA compliance you additionally need:**
- A signed Business Associate Agreement (BAA) with Supabase (Pro plan)
- A signed BAA with Vercel (Enterprise plan) or equivalent hosting provider
- Written Information Security Policy
- Incident Response Plan
- Risk Assessment documentation (annual)
- Workforce training records

**Supabase compliance certifications:**
SOC 2 Type II · ISO 27001 · HIPAA-eligible infrastructure (with BAA)`,
      },
    ],
  },
  {
    id: 'tips',
    icon: '💡',
    title: 'Tips & best practices',
    subtitle: 'Get the most out of Serotonin.',
    articles: [
      {
        id: 'building-kb',
        title: 'Building a strong knowledge base',
        content: `The more questionnaires you complete in Serotonin, the better it gets at auto-filling future ones. Here's how to build a strong knowledge base quickly.

**Start by importing your existing documents**
Go to Knowledge base → Import and upload your existing SOC 2 reports, Information Security Policy, Incident Response Plan, and any other compliance documents. This gives the AI agent context to pull from immediately.

**Complete questionnaires through the app**
Every questionnaire you mark complete is automatically added to the knowledge base. Even if auto-fill only handles 40% of questions at first, that grows as the library fills up.

**Write good answers**
Answers that are specific, accurate, and complete will be reused in future questionnaires. Vague or incomplete answers get flagged as low confidence and will need re-editing every time.

**Use the vendor name field consistently**
Name vendors consistently (e.g. always "Acme Corp" not sometimes "Acme" or "acme corp"). This makes filtering and searching more accurate.

**Review flagged answers carefully**
When an answer is flagged for review, take the time to verify and update it. An incorrect answer auto-filled into future questionnaires causes more work than writing it fresh.`,
      },
      {
        id: 'assigning-work',
        title: 'Assigning questionnaires to team members',
        content: `Serotonin tracks ownership and assignment for every questionnaire.

**Owner vs Assignee**
- **Owner** — the person who created the questionnaire. Set automatically from your profile. Cannot be changed.
- **Assignee** — the person responsible for completing it. Optional, set manually in the intake step.

**Setting an assignee**
In the intake step (Source), type a name in the "Assign to" field. This is currently a free-text field — future versions will support selecting from your team roster.

**Viewing assignments on the Dashboard**
The Active assessments panel shows both owner and assignee for every draft. This makes it easy to see at a glance who owns what and whether anything is blocked.

**Best practice for team workflows**
One person imports and sets up the questionnaire, assigns it to the subject matter expert for their section, then takes it back for final review and approval.`,
      },
      {
        id: 'themes',
        title: 'Themes and display preferences',
        content: `Serotonin has five built-in themes accessible from the header dropdown.

**Forest** (default) — warm parchment tones, forest green accent. Clean and professional.

**Chalk** — crisp white background, minimal and bright. Good for high-contrast environments.

**Obsidian** — dark mode with copper accents. Easy on the eyes for long sessions.

**Aero** — sky blue, glassy web 2.0 aesthetic. Light and optimistic.

**Oklou** — deep violet-black with lavender accents. Editorial and atmospheric.

**Switching themes**
Click the theme dropdown in the top-right header. Your selection is saved automatically and persists across browser sessions.

**Your profile**
Click your avatar (top-right) to update your name, title, department, and profile photo. Preferences set here appear in draft ownership records.`,
      },
    ],
  },
  {
    id: 'troubleshooting',
    icon: '🔧',
    title: 'Troubleshooting',
    subtitle: 'Common issues and how to fix them.',
    articles: [
      {
        id: 'common-issues',
        title: 'Common issues',
        content: `**Page refreshes and I lose my work**
Serotonin saves questionnaire progress automatically to your browser's session storage. If you see the "You have a questionnaire in progress" banner on the Complete questionnaire page, click Resume to pick up where you left off. If the banner doesn't appear, the progress was lost — this can happen if you cleared your browser data.

To prevent data loss, use the Save draft button during the Review step. This saves your progress to the server so it persists across devices and browser restarts.

**The "Send Email" button opened my email client but I don't see a draft**
Some email clients handle mailto: links differently. If the email didn't appear, use Download PDF instead and attach it manually when composing your email.

**A question shows 0% confidence and "No match found"**
This means your knowledge base doesn't have a prior answer for this type of question yet. Type your answer manually — once the questionnaire is completed and saved to the knowledge base, similar questions in future will auto-fill.

**I'm stuck on the loading screen**
If the app shows "Serotonin…" and doesn't load after 5 seconds, try a hard refresh (Ctrl+Shift+R on Windows, Cmd+Shift+R on Mac). If the issue persists, your Supabase connection may be down — check the system status.

**I can't see documents I uploaded**
Uploaded policy documents appear in Knowledge base → Policy documents tab. Make sure you selected the correct filter tab.`,
      },
      {
        id: 'contact',
        title: 'Getting help',
        content: `**Platform owner**
Serotonin is built and maintained by Your Name.

**For technical issues**
If you encounter a bug or unexpected behaviour, note the exact steps that caused it and reach out directly.

**For access issues**
If you need a new account or can't sign in, contact your administrator. New accounts require an invitation — there is no self-registration.

**For compliance questions**
Questions about HIPAA, SOC 2, BAAs, or data handling policies should be directed to your organization's security or legal team.

**Session expired unexpectedly?**
Serotonin signs you out automatically after 15 minutes of inactivity. This is a HIPAA security requirement. Simply sign back in — your saved drafts will still be there.`,
      },
    ],
  },
];

function InternalWiki({ t, s, onNavigate }) {
  const [activeSection, setActiveSection] = useState(null); // null = home
  const [activeArticle, setActiveArticle] = useState(null);
  const [search, setSearch] = useState('');

  // Flat list of all articles for search
  const allArticles = WIKI.flatMap(sec =>
    sec.articles.map(a => ({ ...a, sectionId: sec.id, sectionTitle: sec.title, sectionIcon: sec.icon }))
  );

  const searchResults = search.trim().length > 1
    ? allArticles.filter(a =>
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.content.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  const currentSection = activeSection ? WIKI.find(s => s.id === activeSection) : null;
  const currentArticle = activeArticle && currentSection
    ? currentSection.articles.find(a => a.id === activeArticle)
    : null;

  // Render markdown-lite: bold, line breaks, bullet lists
  const renderContent = (text) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('**') && line.endsWith('**')) {
        return (
          <div key={i} style={{ fontFamily: t.sansFont, fontSize: 13, fontWeight: 700, color: t.text, marginTop: i > 0 ? 16 : 0, marginBottom: 4 }}>
            {line.replace(/\*\*/g, '')}
          </div>
        );
      }
      if (line.startsWith('- ')) {
        return (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <span style={{ color: t.accent, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>·</span>
            <span style={{ fontFamily: t.sansFont, fontSize: 13, color: t.text2, lineHeight: 1.65 }}>
              {line.slice(2).split(/\*\*(.*?)\*\*/g).map((part, j) =>
                j % 2 === 1 ? <strong key={j} style={{ color: t.text }}>{part}</strong> : part
              )}
            </span>
          </div>
        );
      }
      if (line.trim() === '') return <div key={i} style={{ height: 8 }} />;
      return (
        <p key={i} style={{ fontFamily: t.sansFont, fontSize: 13, color: t.text2, lineHeight: 1.7, marginBottom: 0 }}>
          {line.split(/\*\*(.*?)\*\*/g).map((part, j) =>
            j % 2 === 1 ? <strong key={j} style={{ color: t.text }}>{part}</strong> : part
          )}
        </p>
      );
    });
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <button
            onClick={() => { setActiveSection(null); setActiveArticle(null); setSearch(''); }}
            style={{ background: 'none', border: 'none', cursor: activeSection ? 'pointer' : 'default', fontFamily: t.sansFont, fontSize: 11, fontWeight: 600, color: activeSection ? t.accent : t.text3, padding: 0 }}
          >
            Wiki
          </button>
          {currentSection && (
            <>
              <span style={{ color: t.text3, fontSize: 11 }}>/</span>
              <button
                onClick={() => setActiveArticle(null)}
                style={{ background: 'none', border: 'none', cursor: currentArticle ? 'pointer' : 'default', fontFamily: t.sansFont, fontSize: 11, fontWeight: 600, color: currentArticle ? t.accent : t.text3, padding: 0 }}
              >
                {currentSection.title}
              </button>
            </>
          )}
          {currentArticle && (
            <>
              <span style={{ color: t.text3, fontSize: 11 }}>/</span>
              <span style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3 }}>{currentArticle.title}</span>
            </>
          )}
        </div>

        {!activeSection && (
          <>
            <div style={{ ...s.eyebrow, marginBottom: 6 }}>Internal wiki</div>
            <div style={{ ...s.heroSerif, fontSize: 32, marginBottom: 12 }}>
              How to use Serotonin.<br />
              <em style={{ color: t.heroMuted }}>Everything in one place.</em>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', maxWidth: 480 }}>
              <Search size={14} color={t.text3} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search the wiki…"
                style={{ ...s.input, paddingLeft: 34, fontSize: 13 }}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Search results ── */}
      {search.trim().length > 1 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ ...s.label, marginBottom: 12 }}>
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{search}"
          </div>
          {searchResults.length === 0 ? (
            <div style={{ ...s.card, padding: 24, textAlign: 'center', color: t.text3, fontFamily: t.sansFont, fontSize: 13 }}>
              No articles match your search.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {searchResults.map(a => (
                <button
                  key={a.id}
                  onClick={() => { setActiveSection(a.sectionId); setActiveArticle(a.id); setSearch(''); }}
                  style={{ ...s.card, padding: '14px 18px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{a.sectionIcon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: t.sansFont, fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 2 }}>{a.title}</div>
                    <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3 }}>{a.sectionTitle}</div>
                  </div>
                  <ChevronRight size={14} color={t.text3} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Home — section grid ── */}
      {!activeSection && !search.trim() && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
            {WIKI.map(sec => (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                style={{ ...s.card, padding: '20px 22px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 14 }}
              >
                <span style={{ fontSize: 24, flexShrink: 0, lineHeight: 1 }}>{sec.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: t.sansFont, fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 }}>{sec.title}</div>
                  <div style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text3, marginBottom: 10, lineHeight: 1.5 }}>{sec.subtitle}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {sec.articles.map(a => (
                      <span key={a.id} style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3, background: t.bg3, border: `0.5px solid ${t.border}`, borderRadius: 3, padding: '2px 7px' }}>{a.title}</span>
                    ))}
                  </div>
                </div>
                <ChevronRight size={16} color={t.text3} style={{ flexShrink: 0, marginTop: 2 }} />
              </button>
            ))}
          </div>

          {/* Quick start banner */}
          <div style={{ background: t.accentBg, border: `0.5px solid ${t.accent}`, borderRadius: 10, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 20 }}>🚀</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: t.sansFont, fontSize: 13, fontWeight: 700, color: t.accentText, marginBottom: 3 }}>New to Serotonin?</div>
              <div style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text3 }}>Read the getting started guide first — it walks you through your first questionnaire in under 5 minutes.</div>
            </div>
            <button
              onClick={() => { setActiveSection('getting-started'); setActiveArticle('first-questionnaire'); }}
              style={{ ...s.accentBtn, fontSize: 11, padding: '7px 14px', flexShrink: 0 }}
            >
              Start here →
            </button>
          </div>
        </>
      )}

      {/* ── Section view — article list ── */}
      {currentSection && !currentArticle && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <span style={{ fontSize: 28 }}>{currentSection.icon}</span>
            <div>
              <div style={{ fontFamily: t.serifFont, fontSize: 26, fontWeight: 400, color: t.text }}>{currentSection.title}</div>
              <div style={{ fontFamily: t.sansFont, fontSize: 13, color: t.text3 }}>{currentSection.subtitle}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {currentSection.articles.map((article, i) => (
              <button
                key={article.id}
                onClick={() => setActiveArticle(article.id)}
                style={{ ...s.card, padding: '16px 20px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 6, background: t.accentBg, border: `0.5px solid ${t.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: t.monoFont, fontSize: 11, color: t.accent, fontWeight: 700 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: t.sansFont, fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 2 }}>{article.title}</div>
                  <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3, lineHeight: 1.5 }}>
                    {article.content.split('\n').find(l => l.trim() && !l.startsWith('**'))?.slice(0, 100)}…
                  </div>
                </div>
                <ChevronRight size={14} color={t.text3} flexShrink={0} />
              </button>
            ))}
          </div>

          {/* Related sections */}
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: `0.5px solid ${t.border}` }}>
            <div style={{ ...s.label, marginBottom: 12 }}>Other sections</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {WIKI.filter(sec => sec.id !== currentSection.id).map(sec => (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id)}
                  style={{ ...s.ghostBtn, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                >
                  <span>{sec.icon}</span>{sec.title}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Article view ── */}
      {currentArticle && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 28 }}>

            {/* Sidebar — article list */}
            <div>
              <div style={{ ...s.label, marginBottom: 10 }}>{currentSection.title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {currentSection.articles.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setActiveArticle(a.id)}
                    style={{
                      background: a.id === activeArticle ? t.accentBg : 'transparent',
                      border: `0.5px solid ${a.id === activeArticle ? t.accent : 'transparent'}`,
                      borderRadius: 6, padding: '7px 10px', textAlign: 'left', cursor: 'pointer',
                      fontFamily: t.sansFont, fontSize: 12,
                      fontWeight: a.id === activeArticle ? 600 : 400,
                      color: a.id === activeArticle ? t.accent : t.text3,
                      lineHeight: 1.4,
                    }}
                  >
                    {a.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Article content */}
            <div>
              <h2 style={{ fontFamily: t.serifFont, fontSize: 24, fontWeight: 400, color: t.text, marginBottom: 20, lineHeight: 1.2 }}>
                {currentArticle.title}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {renderContent(currentArticle.content)}
              </div>

              {/* Next article */}
              {(() => {
                const idx = currentSection.articles.findIndex(a => a.id === activeArticle);
                const next = currentSection.articles[idx + 1];
                return next ? (
                  <div style={{ marginTop: 32, paddingTop: 20, borderTop: `0.5px solid ${t.border}` }}>
                    <div style={{ ...s.label, marginBottom: 8 }}>Next</div>
                    <button
                      onClick={() => setActiveArticle(next.id)}
                      style={{ ...s.card, padding: '12px 16px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: t.sansFont, fontSize: 12, fontWeight: 600, color: t.text }}>{next.title}</div>
                      </div>
                      <ChevronRight size={14} color={t.accent} />
                    </button>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

function Dashboard({ t, s, onNavigate, kbEntries = [], drafts = [], onResumeDraft, profile }) {

  const stepLabel = { intake: 'Source', processing: 'Processing', review: 'Review', approval: 'Approval', complete: 'Done', manual: 'Manual entry' };

  const timeAgo = (iso) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ ...s.eyebrow, marginBottom: 8 }}>Serotonin — Operations Hub</div>
        <div style={{ ...s.heroSerif, fontSize: 38, marginBottom: 8 }}>
          Security compliance,<br />
          <em style={{ color: t.heroMuted }}>simplified.</em>
        </div>
        <div style={{ fontFamily: t.sansFont, fontSize: 14, color: t.text3 }}>
          {drafts.length} active assessment{drafts.length !== 1 ? 's' : ''} · {kbEntries.length} completed
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 14 }}>
        {[
          { module: 'editor', icon: CheckSquare, label: 'Complete', action: 'Questionnaire →', desc: 'Start or continue a security assessment with AI-assisted drafting.' },
          { module: 'vendor', icon: Shield, label: 'Incoming assessments', action: 'Vendor inbox →', desc: 'Work in progress — not yet available for production use.', wip: true },
          { module: 'batch',  icon: Layers,       label: 'Batch process', action: 'Queue tools →', desc: 'Work in progress — not yet available for production use.', wip: true },
        ].map(card => (
          <button key={card.module} onClick={() => onNavigate(card.module)} style={{ ...s.card, padding: '20px', textAlign: 'left', cursor: 'pointer', display: 'block', opacity: card.wip ? 0.65 : 1, position: 'relative' }}>
            {card.wip && (
              <span style={{ position: 'absolute', top: 12, right: 12, fontFamily: t.monoFont, fontSize: 8, fontWeight: 700, letterSpacing: '.06em', color: t.warnText, background: t.warnBg, border: `0.5px solid ${t.warn}`, borderRadius: 3, padding: '2px 6px' }}>
                WIP
              </span>
            )}
            <div style={{ width: 38, height: 38, borderRadius: 8, background: t.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><card.icon size={17} color={t.accent} /></div>
            <div style={{ ...s.label, marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontFamily: t.serifFont, fontSize: 16, fontWeight: 400, color: t.accent, marginBottom: 10 }}>{card.action}</div>
            <div style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text3, lineHeight: 1.5 }}>{card.desc}</div>
          </button>
        ))}
      </div>

      <button onClick={() => onNavigate('knowledge')} style={{ ...s.card, padding: '18px 20px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, width: '100%', marginBottom: 20 }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: t.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><BookOpen size={17} color={t.accent} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ ...s.label, marginBottom: 4 }}>Knowledge base</div>
          <div style={{ fontFamily: t.sansFont, fontSize: 13, color: t.text3 }}>
            {kbEntries.length > 0
              ? `${kbEntries.length} completed questionnaire${kbEntries.length !== 1 ? 's' : ''} in your library`
              : 'No completed questionnaires yet — finish one to populate your library'}
          </div>
        </div>
        <div style={{ fontFamily: t.serifFont, fontSize: 16, color: t.accent }}>Search library →</div>
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 14 }}>

        {/* ── Active assessments ── */}
        <div style={{ ...s.card, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={s.label}>Active assessments</div>
            <button
              onClick={() => onNavigate('editor')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: t.sansFont, fontSize: 11, color: t.accent, fontWeight: 600, padding: 0 }}
            >
              + New
            </button>
          </div>

          {drafts.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <div style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text3, marginBottom: 10 }}>No active assessments</div>
              <button
                onClick={() => onNavigate('editor')}
                style={{ ...s.accentBtn, fontSize: 11, padding: '5px 14px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <CheckSquare size={11} />Start one
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {drafts.map(a => {
                const progress = a.progress || 0;
                const isComplete = a.step === 'complete';
                return (
                  <button
                    key={a.id}
                    onClick={() => onResumeDraft && onResumeDraft(a)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 14px', background: t.bg,
                      border: `0.5px solid ${t.border}`, borderRadius: 7,
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      transition: 'border-color .15s',
                    }}
                  >
                    {/* Step badge */}
                    <div style={{
                      fontFamily: t.monoFont, fontSize: 9, fontWeight: 600,
                      color: isComplete ? t.done : t.accent,
                      background: isComplete ? t.doneBg : t.accentBg,
                      border: `0.5px solid ${isComplete ? t.done : t.accent}`,
                      borderRadius: 4, padding: '2px 6px', flexShrink: 0, letterSpacing: '.04em',
                      textTransform: 'uppercase',
                    }}>
                      {stepLabel[a.step] || a.step}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: t.sansFont, fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.vendor}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {/* Owner */}
                        <span style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <User size={9} color={t.text3} />
                          {a.owner || 'You'}
                        </span>
                        {/* Assignee */}
                        {a.assignee && (
                          <span style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ color: t.border2 }}>→</span>
                            {a.assignee}
                          </span>
                        )}
                        {/* Time */}
                        <span style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3 }}>
                          {timeAgo(a.savedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Progress bar + % */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <div style={{ width: 50, height: 3, background: t.border, borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${progress}%`, background: isComplete ? t.done : progress > 60 ? t.accent : t.warn, borderRadius: 2, transition: 'width .3s' }} />
                      </div>
                      <div style={{ fontFamily: t.sansFont, fontSize: 10, fontWeight: 700, color: isComplete ? t.done : t.accent, width: 28, textAlign: 'right' }}>
                        {isComplete ? '✓' : `${progress}%`}
                      </div>
                    </div>

                    {/* Resume arrow */}
                    <ChevronRight size={13} color={t.text3} style={{ flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ ...s.card, padding: '16px 18px' }}>
            <div style={{ ...s.label, marginBottom: 12 }}>System status</div>
            {[['AI engine', 'Operational'], ['Vanta sync', '1 min ago'], ['Drive sync', '5 min ago']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text3 }}>{k}</span>
                <span style={{ fontFamily: t.sansFont, fontSize: 10, fontWeight: 600, color: t.done, letterSpacing: '0.06em' }}>{v.toUpperCase()}</span>
              </div>
            ))}
          </div>
          <div style={{ ...s.card, padding: '16px 18px' }}>
            <div style={{ ...s.label, marginBottom: 12 }}>This month</div>
            {[
              [kbEntries.length,  'Completed'],
              [drafts.length,     'In progress'],
              [kbEntries.reduce((s, e) => s + (e.questions || 0), 0), 'Questions answered'],
            ].map(([v, l]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text3 }}>{l}</span>
                <span style={{ fontFamily: t.serifFont, fontSize: 16, fontWeight: 400, color: t.accent }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── NOTIFICATION TYPES & ICONS ──────────────────────────────────────────────

const NOTIF_META = {
  review:    { icon: FileText,      label: 'Ready for review' },
  assigned:  { icon: User,          label: 'Assigned to you'  },
  batch:     { icon: Layers,        label: 'Batch complete'   },
  vendor:    { icon: Shield,        label: 'Vendor submission' },
  approval:  { icon: CheckCircle,   label: 'Approval needed'  },
  mention:   { icon: Bell,          label: 'Mention'          },
  system:    { icon: Activity,      label: 'System'           },
};

const INITIAL_NOTIFS = [
  { id: 1,  type: 'review',   module: 'editor',    cta: 'Open in editor',       title: 'Acme Corp questionnaire ready',         body: 'AI processing complete — 38 auto-filled, 7 flagged for your review.',           time: '2 min ago',  read: false },
  { id: 2,  type: 'vendor',   module: 'vendor',    cta: 'Review submission',    title: 'New vendor submission received',         body: 'DataGuard Analytics submitted their security questionnaire.',                   time: '14 min ago', read: false },
  { id: 3,  type: 'assigned', module: 'editor',    cta: 'Open questionnaire',   title: 'You were assigned to Global Logistics',  body: 'Mike R. assigned you as reviewer on the Global Logistics SaaS Q.',              time: '1 hr ago',   read: false },
  { id: 4,  type: 'approval', module: 'knowledge', cta: 'Review request',       title: 'Delete request needs your approval',     body: 'Sarah L. requested deletion of "FinTech 2022 Assessment". Reason attached.',   time: '2 hr ago',   read: false },
  { id: 5,  type: 'batch',    module: 'batch',     cta: 'View batch results',   title: 'Batch #12 processing complete',          body: '5 questionnaires processed. 87% avg auto-fill rate. Reports ready.',            time: '3 hr ago',   read: true  },
  { id: 6,  type: 'assigned', module: 'editor',    cta: 'Open questionnaire',   title: 'MedTech Systems assigned to you',        body: 'You have been assigned as lead reviewer on MedTech Systems Q3 audit.',          time: 'Yesterday',  read: true  },
  { id: 7,  type: 'mention',  module: 'editor',    cta: 'View comment',         title: 'Sarah mentioned you in a comment',       body: '"@BF can you verify the MTTD figure on Q2 before we send this out?"',           time: 'Yesterday',  read: true  },
  { id: 8,  type: 'system',   module: 'knowledge', cta: 'Open knowledge base',  title: 'Vanta sync completed',                   body: 'Knowledge base updated with latest compliance data from Vanta.',                time: '2 days ago', read: true  },
];

// ─── NOTIFICATIONS PANEL ─────────────────────────────────────────────────────

function NotificationsPanel({ t, s, notifs, onClear, onClearAll, onMarkRead, onMarkAllRead, onNavigate, onClose }) {
  const [filter, setFilter] = useState('all');
  const unread = notifs.filter(n => !n.read).length;

  const filtered = notifs.filter(n => {
    if (filter === 'unread') return !n.read;
    if (filter === 'review')   return n.type === 'review' || n.type === 'approval';
    if (filter === 'assigned') return n.type === 'assigned';
    if (filter === 'vendor')   return n.type === 'vendor';
    return true;
  });

  const filters = [
    { id: 'all',      label: 'All' },
    { id: 'unread',   label: 'Unread' },
    { id: 'review',   label: 'Review' },
    { id: 'assigned', label: 'Assigned' },
    { id: 'vendor',   label: 'Vendor' },
  ];

  return (
    <div style={{ position: 'absolute', top: 52, right: 12, width: 380, background: t.bg, border: `0.5px solid ${t.border2}`, borderRadius: 10, boxShadow: `0 4px 24px rgba(0,0,0,0.12)`, zIndex: 100, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 560 }}>

      {/* Panel header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: `0.5px solid ${t.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontFamily: t.serifFont, fontSize: 16, fontWeight: 400, color: t.text }}>Notifications</div>
            {unread > 0 && (
              <div style={{ background: t.accent, color: '#fff', fontFamily: t.sansFont, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10 }}>{unread}</div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {unread > 0 && (
              <button onClick={onMarkAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: t.sansFont, fontSize: 10, fontWeight: 600, color: t.accent, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                Mark all read
              </button>
            )}
            <button onClick={onClearAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: t.sansFont, fontSize: 10, fontWeight: 600, color: t.text3, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
              Clear all
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text3, display: 'flex', padding: 0 }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {filters.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: '3px 10px', borderRadius: 5, border: `0.5px solid ${filter === f.id ? t.accent : t.border}`, background: filter === f.id ? t.accentBg : 'transparent', color: filter === f.id ? t.accent : t.text3, fontFamily: t.sansFont, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notification list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: t.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
              <Bell size={18} color={t.dim} />
            </div>
            <div style={{ fontFamily: t.sansFont, fontSize: 12, color: t.text3 }}>No notifications here</div>
          </div>
        ) : (
          filtered.map((n, i) => {
            const meta = NOTIF_META[n.type] || NOTIF_META.system;
            const Icon = meta.icon;
            const handleClick = () => {
              onMarkRead(n.id);
              if (n.module) { onNavigate(n.module); onClose(); }
            };
            return (
              <div
                key={n.id}
                onClick={handleClick}
                style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: i < filtered.length - 1 ? `0.5px solid ${t.border}` : 'none', background: n.read ? 'transparent' : t.accentBg, cursor: 'pointer', transition: 'background .15s' }}
              >
                {/* Icon */}
                <div style={{ width: 32, height: 32, borderRadius: 8, background: n.read ? t.bg2 : t.bg, border: `0.5px solid ${n.read ? t.border : t.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <Icon size={14} color={n.read ? t.dim : t.accent} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                    <div style={{ fontFamily: t.sansFont, fontSize: 12, fontWeight: n.read ? 500 : 700, color: t.text, lineHeight: 1.3 }}>{n.title}</div>
                    {!n.read && <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.accent, flexShrink: 0, marginTop: 4 }} />}
                  </div>
                  <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3, lineHeight: 1.4, marginBottom: 6 }}>{n.body}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ background: n.read ? t.bg3 : t.bg, border: `0.5px solid ${t.border}`, color: t.text3, fontFamily: t.sansFont, fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', padding: '1px 6px', borderRadius: 3, textTransform: 'uppercase' }}>{meta.label}</span>
                      <span style={{ fontFamily: t.sansFont, fontSize: 10, color: t.dim }}>{n.time}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {n.cta && (
                        <span style={{ fontFamily: t.sansFont, fontSize: 10, fontWeight: 600, color: t.accent, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                          {n.cta} <ChevronRight size={10} />
                        </span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); onClear(n.id); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.dim, display: 'flex', padding: 2, borderRadius: 4 }}
                        title="Dismiss"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Panel footer */}
      {notifs.length > 0 && (
        <div style={{ borderTop: `0.5px solid ${t.border}`, padding: '10px 16px', flexShrink: 0 }}>
          <div style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3, textAlign: 'center' }}>
            Notifications are retained for 30 days · <span style={{ color: t.accent, cursor: 'pointer', fontWeight: 600 }}>Manage preferences</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PROFILE PANEL ───────────────────────────────────────────────────────────

function ProfilePanel({ t, s, profile, authUser, onUpdateProfile, onOpenSettings, onSignOut, onClose }) {
  const [activeTab, setActiveTab] = useState('profile');
  const [editName,  setEditName]  = useState(profile.name);
  const [editTitle, setEditTitle] = useState(profile.title);
  const [editDept,  setEditDept]  = useState(profile.department);
  const [saved, setSaved] = useState(false);
  const [prefs, setPrefs] = useState(profile.prefs);

  // Email always comes from auth — never editable by the user
  const authEmail = authUser?.email || profile.email || '—';

  // Sync local state if profile changes externally
  useEffect(() => {
    setEditName(profile.name);
    setEditTitle(profile.title);
    setEditDept(profile.department);
    setPrefs(profile.prefs);
  }, [profile]);

  const handleSaveProfile = () => {
    onUpdateProfile({
      ...profile,
      name:       editName,
      title:      editTitle,
      email:      authEmail, // always keep the auth email
      department: editDept,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTogglePref = (key) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    onUpdateProfile({ ...profile, prefs: updated });
  };

  const tabs = [
    { id: 'profile',     label: 'Profile' },
    { id: 'preferences', label: 'Preferences' },
  ];

  const prefGroups = [
    {
      label: 'Notifications',
      items: [
        { key: 'notifReview',    label: 'Questionnaire ready for review',     desc: 'Alert when AI processing completes' },
        { key: 'notifAssigned',  label: 'Assigned to questionnaire',          desc: 'Alert when a task is assigned to you' },
        { key: 'notifVendor',    label: 'New vendor submission',              desc: 'Alert when a vendor submits a questionnaire' },
        { key: 'notifBatch',     label: 'Batch processing complete',          desc: 'Alert when a batch job finishes' },
        { key: 'notifMention',   label: 'Mentions and comments',              desc: 'Alert when someone tags you' },
      ],
    },
    {
      label: 'Workflow',
      items: [
        { key: 'autoAttach',     label: 'Auto-attach documents',             desc: 'Automatically attach SOC 2, policies, BAAs' },
        { key: 'autoSaveKB',     label: 'Auto-save to knowledge base',       desc: 'Save completed questionnaires automatically' },
        { key: 'confirmSend',    label: 'Confirm before sending',            desc: 'Show approval step before emailing' },
      ],
    },
    {
      label: 'Display',
      items: [
        { key: 'compactView',    label: 'Compact sidebar',                   desc: 'Collapse sidebar by default on load' },
        { key: 'showConfidence', label: 'Always show confidence scores',     desc: 'Show % on every answer in review mode' },
      ],
    },
  ];

  // Generate initials from name
  const initials = editName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{ position: 'absolute', top: 52, right: 0, width: 340, background: t.bg, border: `0.5px solid ${t.border2}`, borderRadius: 10, boxShadow: `0 4px 24px rgba(0,0,0,0.12)`, zIndex: 100, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 580 }}>

      {/* Avatar hero */}
      <div style={{ background: t.bg2, borderBottom: `0.5px solid ${t.border}`, padding: '20px 18px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>

          {/* Avatar with upload overlay */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: t.accentBg, border: `1.5px solid ${t.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.serifFont, fontSize: 18, fontWeight: 400, fontStyle: 'italic', color: t.accent, overflow: 'hidden' }}>
              {profile.avatarUrl
                ? <img src={profile.avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials
              }
            </div>
            <label title="Upload photo" style={{ position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: '50%', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `1.5px solid ${t.bg}` }}>
              <Upload size={9} color="#fff" />
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                const file = e.target.files[0];
                if (!file) return;
                const url = URL.createObjectURL(file);
                onUpdateProfile({ ...profile, avatarUrl: url });
              }} />
            </label>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: t.sansFont, fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{editName || 'Your Name'}</div>
            <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3, marginBottom: 4 }}>{editTitle || 'Role'}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: t.accentBg, border: `0.5px solid ${t.accent}`, borderRadius: 4, padding: '2px 7px' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: t.accent }} />
              <span style={{ fontFamily: t.sansFont, fontSize: 9, fontWeight: 700, color: t.accentText, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {editTitle || 'Team Member'}
              </span>
            </div>
          </div>

          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text3, display: 'flex', padding: 0, alignSelf: 'flex-start' }}>
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: '5px 0', borderRadius: 5, border: `0.5px solid ${activeTab === tab.id ? t.accent : t.border}`, background: activeTab === tab.id ? t.accentBg : 'transparent', color: activeTab === tab.id ? t.accent : t.text3, fontFamily: t.sansFont, fontSize: 10, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ overflowY: 'auto', flex: 1 }}>

        {activeTab === 'profile' && (
          <div style={{ padding: '16px 18px' }}>

            {/* Editable fields */}
            {[
              { label: 'Full name',   val: editName,  set: setEditName,  ph: 'Your full name' },
              { label: 'Job title',   val: editTitle, set: setEditTitle, ph: 'e.g. GRC Analyst' },
              { label: 'Department',  val: editDept,  set: setEditDept,  ph: 'e.g. Security & Compliance' },
            ].map(field => (
              <div key={field.label} style={{ marginBottom: 14 }}>
                <div style={{ ...s.label, marginBottom: 6 }}>{field.label}</div>
                <input
                  value={field.val}
                  onChange={e => field.set(e.target.value)}
                  placeholder={field.ph}
                  style={{ ...s.input, fontSize: 12, padding: '8px 12px' }}
                />
              </div>
            ))}

            {/* Email — read-only, sourced from authentication */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...s.label, marginBottom: 6 }}>Email</div>
              <div style={{ position: 'relative' }}>
                <input
                  value={authEmail}
                  readOnly
                  style={{
                    ...s.input, fontSize: 12, padding: '8px 12px',
                    background: t.bg3,
                    color: t.text3,
                    cursor: 'not-allowed',
                    border: `0.5px solid ${t.border}`,
                  }}
                />
                <div style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  fontFamily: t.monoFont, fontSize: 9, color: t.text3,
                  letterSpacing: '.04em', textTransform: 'uppercase',
                }}>
                  auth
                </div>
              </div>
              <div style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3, marginTop: 4 }}>
                Set by your sign-in account — cannot be changed here.
              </div>
            </div>

            <button onClick={handleSaveProfile} style={{ ...s.accentBtn, width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              {saved ? <><CheckCircle size={12} />Saved</> : 'Save profile'}
            </button>
          </div>
        )}

        {activeTab === 'preferences' && (
          <div style={{ padding: '14px 18px' }}>
            <div style={{ fontFamily: t.sansFont, fontSize: 11, color: t.text3, marginBottom: 14, lineHeight: 1.5 }}>
              These preferences are synced with{' '}
              <span onClick={onOpenSettings} style={{ color: t.accent, fontWeight: 600, cursor: 'pointer' }}>Settings</span>
              {' '}and apply to your account across all sessions.
            </div>

            {prefGroups.map((group, gi) => (
              <div key={group.label} style={{ marginBottom: gi < prefGroups.length - 1 ? 18 : 0 }}>
                <div style={{ ...s.label, marginBottom: 10, color: t.text2 }}>{group.label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {group.items.map(item => (
                    <div key={item.key} onClick={() => handleTogglePref(item.key)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', borderRadius: 7, cursor: 'pointer', background: prefs[item.key] ? t.accentBg : 'transparent' }}>
                      {/* Toggle */}
                      <div style={{ width: 28, height: 16, borderRadius: 8, background: prefs[item.key] ? t.accent : t.border, position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
                        <div style={{ position: 'absolute', top: 2, left: prefs[item.key] ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: t.sansFont, fontSize: 12, fontWeight: 500, color: prefs[item.key] ? t.text : t.text2, lineHeight: 1.2 }}>{item.label}</div>
                        <div style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3, marginTop: 1 }}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sign out footer */}
      <div style={{ borderTop: `0.5px solid ${t.border}`, padding: '10px 18px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3 }}>
          Signed in as <span style={{ color: t.text2, fontWeight: 600 }}>{authEmail}</span>
        </div>
        <button onClick={onSignOut} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `0.5px solid ${t.border}`, borderRadius: 5, padding: '5px 10px', cursor: 'pointer', color: t.danger, fontFamily: t.sansFont, fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' }}>
          <LogOut size={11} />
          Sign out
        </button>
      </div>
    </div>
  );
}

// ─── SUPABASE CLIENT (lazy — only loads if env vars are present) ─────────────

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = import.meta.env?.VITE_SUPABASE_URL;
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  // Dynamically import so the app still runs without Supabase configured
  return null; // replaced below when imported
}

// ─── SIGN IN / LANDING PAGE ───────────────────────────────────────────────────

function SignInScreen({ onSignIn }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [mode,     setMode]     = useState('signin'); // signin | forgot
  const [sent,     setSent]     = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      );
      if (mode === 'forgot') {
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setSent(true);
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onSignIn(data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSSO = async () => {
    setLoading(true);
    setError('');
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      );
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const features = [
    { icon: CheckSquare, title: 'Complete questionnaires',     desc: 'AI auto-fills answers from your knowledge base. 86% average accuracy.' },
    { icon: Shield,      title: 'Incoming vendor assessments', desc: 'Score vendor submissions 0–100 with risk categorization and remediation guidance.' },
    { icon: Layers,      title: 'Batch processing',            desc: 'Queue multiple questionnaires and process them automatically overnight.' },
    { icon: BookOpen,    title: 'Knowledge base',              desc: 'Search 2,000+ answered questions across every past assessment instantly.' },
  ];

  const inp = {
    width: '100%', background: 'rgba(255,255,255,0.07)',
    border: '0.5px solid rgba(255,255,255,0.15)',
    borderRadius: 7, padding: '11px 14px', fontSize: 13,
    color: '#F0EAE0', boxSizing: 'border-box', outline: 'none',
    fontFamily: "'Darker Grotesque', sans-serif",
    letterSpacing: '0.01em',
  };

  const lbl = {
    display: 'block', fontSize: 10, fontWeight: 600,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    color: 'rgba(240,234,224,0.5)', marginBottom: 6,
    fontFamily: "'Darker Grotesque', sans-serif",
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0E0C0A',
      display: 'flex',
      fontFamily: "'Darker Grotesque', sans-serif",
      color: '#F0EAE0',
      overflow: 'hidden',
    }}>

      {/* ── Left panel — branding & features ── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 56px',
        background: 'linear-gradient(160deg, #141210 0%, #0E0C0A 60%, #111A0E 100%)',
        borderRight: '0.5px solid rgba(255,255,255,0.06)',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Background texture */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 60% 50% at 20% 80%, rgba(45,90,39,0.12) 0%, transparent 70%)',
        }} />

        {/* Logo */}
        <div>
          <div style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 28, fontStyle: 'italic',
            fontWeight: 400, color: '#F0EAE0',
            marginBottom: 4,
          }}>
            Serotonin
          </div>
          <div style={{
            fontSize: 10, fontWeight: 600,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'rgba(240,234,224,0.35)',
          }}>
            Security Questionnaire Platform
          </div>
        </div>

        {/* Hero text */}
        <div>
          <div style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 44, fontWeight: 400,
            lineHeight: 1.1, letterSpacing: '-0.02em',
            color: '#F0EAE0', marginBottom: 16,
          }}>
            Security compliance,<br />
            <em style={{ color: 'rgba(240,234,224,0.45)' }}>simplified.</em>
          </div>
          <div style={{
            fontSize: 15, color: 'rgba(240,234,224,0.5)',
            lineHeight: 1.6, maxWidth: 420, fontWeight: 400,
          }}>
            Automate the security questionnaire lifecycle — from AI-powered completion to vendor risk scoring — so your GRC team can focus on what actually matters.
          </div>
        </div>

        {/* Feature list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {features.map(f => (
            <div key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                background: 'rgba(45,90,39,0.2)',
                border: '0.5px solid rgba(45,90,39,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <f.icon size={15} color="#6AAA60" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#F0EAE0', marginBottom: 2 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: 'rgba(240,234,224,0.4)', lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          fontSize: 10, color: 'rgba(240,234,224,0.2)',
          fontFamily: "'Darker Grotesque', sans-serif",
          letterSpacing: '0.04em',
        }}>
          © 2025 Serotonin — MIT License
        </div>
      </div>

      {/* ── Right panel — sign in form ── */}
      <div style={{
        width: 460,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '48px 52px',
        background: '#141210',
      }}>

        {/* Sent confirmation */}
        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(45,90,39,0.15)',
              border: '0.5px solid rgba(45,90,39,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <CheckCircle size={24} color="#6AAA60" />
            </div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, marginBottom: 8 }}>Check your email</div>
            <div style={{ fontSize: 13, color: 'rgba(240,234,224,0.5)', lineHeight: 1.6, marginBottom: 24 }}>
              We sent a password reset link to<br />
              <strong style={{ color: '#F0EAE0' }}>{email}</strong>
            </div>
            <button
              onClick={() => { setMode('signin'); setSent(false); setError(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6AAA60', fontWeight: 600, fontFamily: "'Darker Grotesque', sans-serif" }}
            >
              ← Back to sign in
            </button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 32 }}>
              <div style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 26, fontWeight: 400, color: '#F0EAE0', marginBottom: 6,
              }}>
                {mode === 'forgot' ? 'Reset password' : 'Welcome back'}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(240,234,224,0.4)' }}>
                {mode === 'forgot'
                  ? "Enter your email and we'll send a reset link."
                  : 'Sign in to access your operations hub.'}
              </div>
            </div>

            {/* Google SSO */}
            {mode === 'signin' && (
              <>
                <button
                  onClick={handleGoogleSSO}
                  disabled={loading}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 10,
                    background: 'rgba(255,255,255,0.06)',
                    border: '0.5px solid rgba(255,255,255,0.12)',
                    borderRadius: 7, padding: '11px 14px',
                    fontSize: 13, fontWeight: 600, color: '#F0EAE0',
                    cursor: 'pointer', marginBottom: 20,
                    fontFamily: "'Darker Grotesque', sans-serif",
                    letterSpacing: '0.02em',
                    transition: 'background .15s',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.08)' }} />
                  <span style={{ fontSize: 10, color: 'rgba(240,234,224,0.3)', fontWeight: 600, letterSpacing: '0.1em' }}>OR</span>
                  <div style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.08)' }} />
                </div>
              </>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Email address</label>
                <input
                  type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  required placeholder="your@email.com"
                  style={inp}
                />
              </div>

              {mode === 'signin' && (
                <div style={{ marginBottom: 6 }}>
                  <label style={lbl}>Password</label>
                  <input
                    type="password" value={password}
                    onChange={e => setPassword(e.target.value)}
                    required placeholder="••••••••"
                    style={inp}
                  />
                </div>
              )}

              {mode === 'signin' && (
                <div style={{ textAlign: 'right', marginBottom: 22 }}>
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#6AAA60', fontWeight: 600, fontFamily: "'Darker Grotesque', sans-serif" }}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {mode === 'forgot' && <div style={{ marginBottom: 22 }} />}

              {error && (
                <div style={{
                  fontSize: 11, color: '#E8A090', marginBottom: 14,
                  padding: '9px 12px',
                  background: 'rgba(160,48,32,0.15)',
                  border: '0.5px solid rgba(160,48,32,0.3)',
                  borderRadius: 6,
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', background: '#2D5A27',
                  color: '#fff', border: 'none', borderRadius: 7,
                  padding: '12px', fontSize: 13, fontWeight: 700,
                  letterSpacing: '0.04em', cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  fontFamily: "'Darker Grotesque', sans-serif",
                  transition: 'opacity .15s',
                }}
              >
                {loading ? 'Please wait…' : mode === 'forgot' ? 'Send reset email' : 'Sign in'}
              </button>

              {mode === 'forgot' && (
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setError(''); }}
                  style={{
                    width: '100%', background: 'none', border: 'none',
                    cursor: 'pointer', fontSize: 11,
                    color: 'rgba(240,234,224,0.35)', marginTop: 14,
                    fontFamily: "'Darker Grotesque', sans-serif",
                  }}
                >
                  ← Back to sign in
                </button>
              )}
            </form>

            <div style={{
              marginTop: 28, paddingTop: 20,
              borderTop: '0.5px solid rgba(255,255,255,0.06)',
              fontSize: 11, color: 'rgba(240,234,224,0.25)',
              textAlign: 'center', lineHeight: 1.6,
            }}>
              Don't have an account?<br />
              Contact your administrator to receive an invitation.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────

export default function Serotonin() {
  // ── Hash-based routing — keeps correct module on refresh ──────
  const VALID_MODULES = ['dashboard', 'editor', 'vendor', 'batch', 'knowledge'];
  const getModuleFromHash = () => {
    const hash = window.location.hash.replace('#', '');
    return VALID_MODULES.includes(hash) ? hash : 'dashboard';
  };

  const [module, setModuleState] = useState(getModuleFromHash);
  const [resumeDraftId, setResumeDraftId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [themeKey, setThemeKey]   = useState(() => sessionStorage.getItem('serotonin_theme') || 'forest');
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifs, setNotifs]       = useState(INITIAL_NOTIFS);
  // Public demo mode — no auth required
  const authUser = { email: 'demo@serotonin.app' };
  const scale = useViewportScale();

  // ── Draft questionnaires — shared between Dashboard and Editor ─
  const [drafts, setDrafts] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('serotonin_drafts') || '[]'); }
    catch { return []; }
  });

  const saveDraft = (draft) => {
    setDrafts(prev => {
      // Update existing or prepend new
      const exists = prev.find(d => d.id === draft.id);
      const next = exists
        ? prev.map(d => d.id === draft.id ? draft : d)
        : [draft, ...prev];
      try { sessionStorage.setItem('serotonin_drafts', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const deleteDraft = (id) => {
    setDrafts(prev => {
      const next = prev.filter(d => d.id !== id);
      try { sessionStorage.setItem('serotonin_drafts', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const [kbEntries, setKbEntries] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('serotonin_kb') || '[]'); }
    catch { return []; }
  });

  const addKbEntry = (entry) => {
    setKbEntries(prev => {
      const next = [entry, ...prev];
      try { sessionStorage.setItem('serotonin_kb', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const deleteKbEntry = (id) => {
    setKbEntries(prev => {
      const next = prev.filter(e => e.id !== id);
      try { sessionStorage.setItem('serotonin_kb', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // ── Imported policy documents ──────────────────────────────────
  const [kbDocs, setKbDocs] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('serotonin_kb_docs') || '[]'); }
    catch { return []; }
  });

  const addKbDoc = (doc) => {
    setKbDocs(prev => {
      const next = [doc, ...prev];
      try { sessionStorage.setItem('serotonin_kb_docs', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const removeKbDoc = (id) => {
    setKbDocs(prev => {
      const next = prev.filter(d => d.id !== id);
      try { sessionStorage.setItem('serotonin_kb_docs', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Wrap setModule to also update the URL hash
  const setModule = (mod) => {
    setModuleState(mod);
    window.location.hash = mod === 'dashboard' ? '' : mod;
  };

  // Listen for browser back/forward navigation
  useEffect(() => {
    const onHashChange = () => setModuleState(getModuleFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // ── Dynamically load theme fonts on demand ─────────────────────
  useEffect(() => {
    const fontMap = {
      aero:    'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&family=Quicksand:wght@400;500;600;700&display=swap',
      oklou:   'https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Syne:wght@400;500;600;700&display=swap',
    };
    const url = fontMap[themeKey];
    if (!url) return;
    const id = `font-${themeKey}`;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id   = id;
    link.rel  = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
  }, [themeKey]);

  // Persist theme preference
  useEffect(() => {
    sessionStorage.setItem('serotonin_theme', themeKey);
  }, [themeKey]);
  const [profile, setProfile] = useState({
    name:       '',
    title:      '',
    email:      '',
    department: '',
    avatarUrl:  null,
    prefs: {
      notifReview:    true,
      notifAssigned:  true,
      notifVendor:    true,
      notifBatch:     false,
      notifMention:   true,
      autoAttach:     true,
      autoSaveKB:     true,
      confirmSend:    true,
      compactView:    false,
      showConfidence: true,
    },
  });

  // Demo profile pre-seeded
  useEffect(() => {
    setProfile(prev => ({
      ...prev,
      name:  prev.name  || 'Demo User',
      email: 'demo@serotonin.app',
    }));
  }, []);

  const t = THEMES[themeKey];
  const s = useThemeStyles(t);
  const unreadCount = notifs.filter(n => !n.read).length;

  // Session timeout removed for public demo


    const handleClearNotif  = (id) => setNotifs(prev => prev.filter(n => n.id !== id));
  const handleClearAll    = ()   => setNotifs([]);
  const handleMarkRead    = (id) => setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  const handleMarkAllRead = ()   => setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  const handleOpenSettings = ()  => { setProfileOpen(false); setModule('settings'); };

  const handleSignOut = () => {
    // Demo mode — sign out reloads the page
    setProfileOpen(false);
    setModule('dashboard');
  };

  // ── Auth gate — after all hooks ─────────────────────────────────────────────
  // Demo mode — app loads directly, no auth required

  // ── App renders below ───────────────────────────────────────────────────────
  const initials = profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const navItems = [
    { id: 'dashboard', icon: Home,         label: 'Dashboard' },
    { id: 'editor',    icon: CheckSquare,   label: 'Complete questionnaire' },
    { id: 'vendor',    icon: Shield,        label: 'Incoming vendor assessments', wip: true },
    { id: 'batch',     icon: Layers,        label: 'Batch processing' },
    { id: 'knowledge', icon: BookOpen,      label: 'Knowledge base' },
  ];

  const currentLabel = navItems.find(n => n.id === module)?.label || 'Dashboard';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      overflow: 'hidden',
      background: t.bg,
    }}>
      {/* Inner wrapper */}
      <div style={{
        width: '100%',
        height: '100%',
        zoom: scale,
        display: 'flex',
        flexDirection: 'column',
        ...s.app,
        // Aero: sky gradient background
        ...(themeKey === 'aero' && {
          background: 'linear-gradient(180deg, #C8E8FA 0%, #DCF0FC 40%, #EEF8FF 100%)',
        }),
        // Oklou: deep violet-black with faint radial shimmer
        ...(themeKey === 'oklou' && {
          background: 'radial-gradient(ellipse 80% 60% at 30% 20%, rgba(155,127,212,0.08) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 70% 80%, rgba(200,96,128,0.05) 0%, transparent 55%), #0D0B14',
        }),
      }}>

      {/* Click-outside overlay to close notif panel */}
      {(notifOpen || profileOpen) && (
        <div onClick={() => { setNotifOpen(false); setProfileOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
      )}

      {/* Demo banner */}
      <div style={{ background: t.accent, padding: '6px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, zIndex: 96 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: t.monoFont, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Public Demo</span>
          <div style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.3)' }} />
          <span style={{ fontFamily: t.sansFont, fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>
            This is a portfolio demonstration. All data is local to your browser session and resets on refresh.
          </span>
        </div>
        <a
          href="https://github.com/YOUR_USERNAME/serotonin"
          target="_blank"
          rel="noreferrer"
          style={{ fontFamily: t.sansFont, fontSize: 11, fontWeight: 600, color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, opacity: 0.9 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
          View source
        </a>
      </div>

      {/* Top header */}
      <div style={{ ...s.header, position: 'relative', zIndex: 95 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => setSidebarOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text3, display: 'flex', padding: 0 }}>
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div style={{ fontFamily: t.serifFont, fontSize: 17, fontWeight: 400, color: t.text, fontStyle: 'italic' }}>Serotonin</div>
          <div style={{ width: 1, height: 18, background: t.border }} />
          <div style={{ ...s.label, color: t.text2 }}>{currentLabel}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <ThemeSwitcher current={themeKey} onChange={setThemeKey} t={t} />
          <div style={{ width: 1, height: 18, background: t.border }} />

          {/* Bell button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setNotifOpen(o => !o)}
              style={{ background: notifOpen ? t.accentBg : 'none', border: notifOpen ? `0.5px solid ${t.accent}` : 'none', borderRadius: 7, cursor: 'pointer', color: notifOpen ? t.accent : t.text3, position: 'relative', display: 'flex', padding: 6 }}
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, borderRadius: 7, background: t.accent, color: '#fff', fontFamily: t.sansFont, fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notifications panel */}
            {notifOpen && (
              <NotificationsPanel
                t={t} s={s}
                notifs={notifs}
                onClear={handleClearNotif}
                onClearAll={handleClearAll}
                onMarkRead={handleMarkRead}
                onMarkAllRead={handleMarkAllRead}
                onNavigate={setModule}
                onClose={() => setNotifOpen(false)}
              />
            )}
          </div>

          {/* Avatar / profile button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setProfileOpen(o => !o); setNotifOpen(false); }}
              style={{ width: 32, height: 32, borderRadius: '50%', background: profileOpen ? t.accent : t.accentBg, border: `1.5px solid ${t.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', padding: 0 }}
            >
              {profile.avatarUrl
                ? <img src={profile.avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontFamily: t.serifFont, fontSize: 11, fontWeight: 400, fontStyle: 'italic', color: profileOpen ? '#fff' : t.accent }}>{initials}</span>
              }
            </button>

            {/* Profile panel */}
            {profileOpen && (
              <ProfilePanel
                t={t} s={s}
                profile={profile}
                authUser={authUser}
                onUpdateProfile={setProfile}
                onOpenSettings={handleOpenSettings}
                onSignOut={handleSignOut}
                onClose={() => setProfileOpen(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Sidebar */}
        {sidebarOpen && (
          <div style={{ ...s.sidebar, width: 232, alignItems: 'flex-start', padding: '16px 10px', gap: 2 }}>
            {navItems.map(item => {
              const active = module === item.id;
              const isWip  = !!item.wip;
              return (
                <button key={item.id} onClick={() => setModule(item.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, background: active ? t.accentBg : 'transparent', border: 'none', cursor: 'pointer', color: active ? t.accent : t.text3, opacity: item.wip ? 0.6 : 1 }}>
                  <item.icon size={15} />
                  <span style={{ fontFamily: t.sansFont, fontSize: 12, fontWeight: active ? 600 : 500, letterSpacing: '0.01em', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>{item.label}</span>
                  {isWip && (
                    <span style={{ fontFamily: t.monoFont, fontSize: 8, fontWeight: 700, letterSpacing: '.06em', color: t.warnText, background: t.warnBg, border: `0.5px solid ${t.warn}`, borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
                      WIP
                    </span>
                  )}
                </button>
              );
            })}
            <div style={{ flex: 1 }} />
            <div style={{ ...s.divider, margin: '8px 0', width: '100%' }} />
            <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, background: 'transparent', border: 'none', cursor: 'pointer', color: t.text3 }}>
              <Settings size={15} />
              <span style={{ fontFamily: t.sansFont, fontSize: 12, fontWeight: 500 }}>Settings</span>
            </button>
          </div>
        )}

        {/* Main content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px 36px 80px', scrollBehavior: 'smooth' }}>
          {module === 'dashboard' && <Dashboard t={t} s={s} onNavigate={setModule} kbEntries={kbEntries} drafts={drafts} onResumeDraft={(draft) => { setResumeDraftId(draft.id); setModule('editor'); }} profile={profile} />}
          {module === 'editor'    && <QuestionnaireEditor t={t} s={s} onBack={() => { setResumeDraftId(null); setModule('dashboard'); }} onAddToKb={addKbEntry} drafts={drafts} onSaveDraft={saveDraft} onDeleteDraft={deleteDraft} profile={profile} resumeDraftId={resumeDraftId} onClearResume={() => setResumeDraftId(null)} />}
          {module === 'vendor'    && <VendorDashboard t={t} s={s} />}
          {module === 'batch'     && <BatchProcessing t={t} s={s} />}
          {module === 'knowledge' && <KnowledgeBase t={t} s={s} kbEntries={kbEntries} kbDocs={kbDocs} onAddDoc={addKbDoc} onRemoveDoc={removeKbDoc} onDeleteEntry={deleteKbEntry} />}
          {module === 'wiki'      && <InternalWiki t={t} s={s} onNavigate={setModule} />}
        </main>
      </div>

      {/* Footer */}
      <div style={s.footer}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontFamily: t.serifFont, fontSize: 13, fontStyle: 'italic', color: t.text2 }}>Serotonin</span>
          <span style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3 }}>© 2025 Serotonin — MIT License</span>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <span style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3, cursor: 'pointer' }}>System status</span>
          <span style={{ fontFamily: t.sansFont, fontSize: 10, color: t.text3, cursor: 'pointer' }} onClick={() => setModule('knowledge')}>Security docs</span>
          <span style={{ fontFamily: t.sansFont, fontSize: 10, color: t.accent, fontWeight: 600, cursor: 'pointer' }} onClick={() => setModule('wiki')}>Internal wiki</span>
        </div>
      </div>

      </div>{/* end scaled inner wrapper */}



    </div>  /* end outer fixed container */
  );
}
