/* global React, fmtVnd, fmtFull, fmtPct, PLATFORM_COLORS, PLATFORM_NAME, KPI, I, Sparkline, AreaChart, BarChart, Donut, RankedBars */

// ── Page: KẾ HOẠCH (Sales Target) ───────────────────────────────────────

function PagePlan({ data }) {
  const t = useT();
  const plan = data.plan || {};
  const revenueMetric = (plan.metrics || []).find(m => m.key === 'revenue') || {};
  const yearTarget = safeNum(revenueMetric.target);
  const monthsCompleted = safeNum(plan.elapsed_months, new Date().getMonth() + 1);
  const monthsRemaining = safeNum(plan.remaining_months, Math.max(0, 12 - monthsCompleted));
  const ytdActual = safeNum(revenueMetric.actual_ytd);
  const achievement = safePct(ytdActual, yearTarget);
  const runRateNeeded = safeNum(revenueMetric.avg_needed_month);
  const onTrack = revenueMetric.status === 'on_track';
  const planMetrics = plan.metrics || [];
  const monthly = plan.monthly || [];

  // Build 12-month series (target line vs actual)
  const months = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
  const targetCum = months.map((_, i) => (yearTarget / 12) * (i+1));
  let runningActual = 0;
  const actualCum = months.map((_, i) => {
    runningActual += safeNum(monthly[i]?.revenue);
    return i < monthsCompleted ? runningActual : null;
  });
  const forecastCum = months.map((_, i) => {
    if (i < monthsCompleted) return null;
    return ytdActual + runRateNeeded * (i+1 - monthsCompleted);
  });

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>

      {/* Hero progress card */}
      <div className="row row-hero">
        <div className="kpi-hero" style={{minHeight: 260}}>
          <div className="kpi-hero-top">
            <div>
              <div className="kpi-hero-label">{t('plan.hero.label')} {plan.year || new Date().getFullYear()}</div>
              <div style={{fontSize:11.5, opacity:0.7, marginTop:4, fontWeight:600}}>
                {t('plan.ytd_progress')} · {monthsCompleted}/12 {t('plan.months_of_12')}
              </div>
            </div>
            <span className={onTrack ? 'delta delta-up' : 'delta delta-down'}>
              {onTrack ? t('plan.on_track') : t('plan.behind')}
            </span>
          </div>
          <div className="kpi-hero-value" style={{fontSize:'clamp(36px, 6vw, 64px)'}}>
            {achievement.toFixed(1)}<span style={{fontSize:'0.45em', opacity:0.8}}>%</span>
          </div>
          <div className="kpi-hero-sub">
            <span>{fmtVnd(ytdActual)}₫ / {fmtVnd(yearTarget)}₫</span>
          </div>
          {/* Progress meter */}
          <div className="kpi-hero-foot">
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:11, fontWeight:600, marginBottom:6, opacity:0.85}}>
                <span>{t('plan.progress_label')}</span>
                <span>{t('plan.remaining')} {fmtVnd(Math.max(0, yearTarget - ytdActual))}₫</span>
              </div>
              <div style={{height:12, borderRadius:99, background:'rgba(255,255,255,0.18)', overflow:'hidden', position:'relative'}}>
                <div style={{
                  height:'100%',
                  width: Math.min(100, achievement) + '%',
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.9), rgba(255,255,255,0.7))',
                  borderRadius: 99,
                  transition: 'width 1s cubic-bezier(0.4,0,0.2,1)',
                }} />
                {/* Pace marker */}
                <div style={{
                  position:'absolute', top:-4, bottom:-4,
                  left: safePct(monthsCompleted, 12)+'%',
                  width: 2, background: 'rgba(255,255,255,0.95)',
                  boxShadow:'0 0 8px rgba(255,255,255,0.6)',
                }} />
              </div>
              <div style={{display:'flex', gap:14, marginTop:10, fontSize:11.5, fontWeight:600}}>
                <span style={{display:'flex', alignItems:'center', gap:6}}>
                  <span style={{width:8, height:8, borderRadius:2, background:'#fff'}}/>
                  {t('plan.achieved')}
                </span>
                <span style={{display:'flex', alignItems:'center', gap:6, opacity:0.8}}>
                  <span style={{width:2, height:10, background:'#fff'}}/>
                  {t('plan.pace_marker')} {monthsCompleted}/12 {t('plan.months')} ({safePct(monthsCompleted, 12).toFixed(0)}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: quick KPIs */}
        <div style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>
          <div className="card" style={{padding: 18}}>
            <div style={{fontSize:11.5, color:'var(--ink-3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em'}}>{t('plan.runrate_label')}</div>
            <div style={{fontSize:28, fontWeight:800, marginTop:6, letterSpacing:'-0.02em'}}>{fmtVnd(runRateNeeded)}₫</div>
            <div style={{fontSize:12, color:'var(--ink-3)', marginTop:4}}>{t('plan.runrate_sub')} · {monthsRemaining} {t('plan.months')}</div>
          </div>
          <div className="card" style={{padding: 18}}>
            <div style={{fontSize:11.5, color:'var(--ink-3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em'}}>{t('plan.current_month')}</div>
            <div style={{fontSize:28, fontWeight:800, marginTop:6, letterSpacing:'-0.02em'}}>{fmtVnd(data.summary.total_revenue)}₫</div>
            <div style={{fontSize:12, color:'var(--ink-3)', marginTop:4, fontWeight:600}}>Actual của kỳ đang xem</div>
          </div>
        </div>
      </div>

      <div className="card card-lg card-flush">
        <div style={{padding:'20px 22px 14px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12}}>
          <div>
            <h3>Target YTD / YTG</h3>
            <div className="sub" style={{fontSize:11.5, color:'var(--ink-3)', marginTop:2}}>Bảng thông số theo mục tiêu năm, thực đạt hiện tại và trung bình cần đạt cho các tháng còn lại</div>
          </div>
          <span className="status status-pending">FY {plan.year || new Date().getFullYear()}</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Chỉ tiêu</th>
              <th className="num">Target FY</th>
              <th className="num">Target YTD</th>
              <th className="num">Actual YTD</th>
              <th className="num">% YTD</th>
              <th className="num">Gap YTD</th>
              <th className="num">YTG</th>
              <th className="num">TB/tháng còn lại</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {planMetrics.length ? planMetrics.map(m => {
              const money = m.key === 'revenue';
              const fmtMetric = (v) => money ? fmtFull(v) + '₫' : fmtFull(v);
              const gap = safeNum(m.gap_ytd);
              return (
                <tr key={m.key}>
                  <td style={{fontWeight:800}}>{m.label}</td>
                  <td className="num">{fmtMetric(m.target)}</td>
                  <td className="num">{fmtMetric(m.target_ytd)}</td>
                  <td className="num">{fmtMetric(m.actual_ytd)}</td>
                  <td className="num">{fmtPct(safeNum(m.ytd_rate))}</td>
                  <td className="num" style={{color: gap >= 0 ? 'var(--green)' : 'var(--red)', fontWeight:800}}>{gap >= 0 ? '+' : ''}{fmtMetric(gap)}</td>
                  <td className="num">{fmtMetric(m.ytg)}</td>
                  <td className="num">{fmtMetric(m.avg_needed_month)}</td>
                  <td>{m.status === 'on_track' ? <span className="status status-done">Đúng tiến độ</span> : <span className="status status-pending">Cần bù</span>}</td>
                </tr>
              );
            }) : (
              <tr><td colSpan="9"><div className="empty-state">Chưa có dữ liệu kế hoạch.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card card-lg card-flush">
        <div style={{padding:'20px 22px 14px'}}>
          <h3>Chi tiết theo tháng</h3>
          <div className="sub" style={{fontSize:11.5, color:'var(--ink-3)', marginTop:2}}>Thực đạt từng tháng so với mục tiêu trung bình tháng</div>
        </div>
        <div className="plan-month-scroll">
          <table className="table plan-month-table">
            <thead>
              <tr>
                <th>Chỉ tiêu</th>
                {months.map(m => <th key={m} className="num">{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Doanh số', key: 'revenue', targetKey: 'revenue_target', money: true },
                { label: 'Lượt truy cập', key: 'visits', targetKey: 'visits_target', money: false },
              ].map(row => (
                <tr key={row.key}>
                  <td style={{fontWeight:800}}>{row.label}</td>
                  {months.map((m, i) => {
                    const value = safeNum(monthly[i]?.[row.key]);
                    const target = safeNum(monthly[i]?.[row.targetKey]);
                    const rate = target > 0 ? safePct(value, target) : 0;
                    const tone = target <= 0 ? 'neutral' : rate >= 90 ? 'good' : rate >= 80 ? 'warn' : 'bad';
                    return (
                      <td key={m} className={`num plan-month-cell plan-month-${tone}`}>
                        <div style={{fontWeight:800}}>{row.money ? fmtVnd(value)+'₫' : fmtFull(value)}</div>
                        <div style={{fontSize:10.5, marginTop:2}}>Target {row.money ? fmtVnd(target)+'₫' : fmtFull(target)}</div>
                        <div style={{fontSize:10, marginTop:2, fontWeight:800}}>{target > 0 ? fmtPct(rate) : '—'}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Target vs Actual chart */}
      <div className="card card-lg">
        <div className="card-head">
          <div>
            <h3>Mục tiêu vs Thực hiện theo tháng</h3>
            <div className="sub">Lũy tiến cả năm — đường mục tiêu (mảnh) so với thực tế (đậm) và dự báo (gạch ngang)</div>
          </div>
          <div className="legend">
            <div className="legend-item"><span className="legend-swatch" style={{background:'var(--ink-4)'}}/>Mục tiêu</div>
            <div className="legend-item"><span className="legend-swatch" style={{background:'var(--brand-1)'}}/>Thực hiện</div>
            <div className="legend-item"><span className="legend-swatch" style={{background:'var(--accent)'}}/>Dự báo</div>
          </div>
        </div>
        <PlanChart months={months} target={targetCum} actual={actualCum} forecast={forecastCum} />
      </div>

    </div>
  );
}

function PlanChart({ months, target, actual, forecast }) {
  const [ref, w] = (function(){const r=React.useRef(null);const [W,setW]=React.useState(800);
    React.useLayoutEffect(()=>{if(!r.current)return;const ro=new ResizeObserver(es=>{const cw=es[0].contentRect.width;if(cw)setW(cw);});ro.observe(r.current);return()=>ro.disconnect();},[]);
    return [r, W];
  })();
  const H = 300, ML=56, MR=20, MT=20, MB=30;
  const innerW = w-ML-MR, innerH = H-MT-MB;
  const maxV = Math.max(...target, ...actual.filter(v=>v!=null), ...forecast.filter(v=>v!=null), 1) * 1.05;
  const x = i => ML + (i/(months.length-1))*innerW;
  const y = v => MT + innerH - (v/maxV)*innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t=>t*maxV);

  const pathFrom = (vals) => {
    const pts = vals.map((v,i)=>v==null?null:[x(i),y(v)]).filter(Boolean);
    if (!pts.length) return '';
    return pts.map((p,i)=>(i?'L':'M')+p[0]+','+p[1]).join(' ');
  };

  return (
    <div ref={ref} style={{width:'100%'}}>
      <svg width={w} height={H} style={{display:'block'}}>
        {/* Grid */}
        {ticks.map((t,i)=>(
          <g key={i}>
            <line x1={ML} x2={ML+innerW} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="2 4"/>
            <text x={ML-8} y={y(t)+4} textAnchor="end" fill="var(--ink-4)" fontSize="10.5" fontWeight="500">{fmtVnd(t)}</text>
          </g>
        ))}
        {months.map((m,i)=>(
          <text key={i} x={x(i)} y={H-10} textAnchor="middle" fill="var(--ink-4)" fontSize="11" fontWeight="600">{m}</text>
        ))}
        {/* Target line */}
        <path d={pathFrom(target)} fill="none" stroke="var(--ink-4)" strokeWidth="1.8" strokeDasharray="6 4"/>
        {/* Forecast */}
        <path d={pathFrom(forecast)} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeDasharray="2 6" strokeLinecap="round"/>
        {/* Actual */}
        <defs>
          <linearGradient id="actGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-1)" stopOpacity="0.35"/>
            <stop offset="100%" stopColor="var(--brand-1)" stopOpacity="0.02"/>
          </linearGradient>
        </defs>
        {(() => {
          const pts = actual.map((v,i)=>v==null?null:[x(i),y(v)]).filter(Boolean);
          if (!pts.length) return null;
          const lp = pts.map((p,i)=>(i?'L':'M')+p[0]+','+p[1]).join(' ');
          const area = lp + ` L ${pts[pts.length-1][0]},${H-MB} L ${pts[0][0]},${H-MB} Z`;
          return (
            <>
              <path d={area} fill="url(#actGrad)"/>
              <path d={lp} fill="none" stroke="var(--brand-1)" strokeWidth="3" strokeLinecap="round"/>
              {pts.map((p,i)=>(
                <circle key={i} cx={p[0]} cy={p[1]} r="5" fill="var(--brand-1)" stroke="var(--surface)" strokeWidth="2.5"/>
              ))}
            </>
          );
        })()}
      </svg>
    </div>
  );
}

// ── Page: ĐỐI SOÁT GBS (Reconciliation) ────────────────────────────────

function PageReconcile({ data }) {
  const totalOrders = data.summary.total_orders;
  const matched = Math.round(totalOrders * 0.913);
  const discrepancy = Math.round(totalOrders * 0.072);
  const missing = totalOrders - matched - discrepancy;

  const files = [
    { name: 'GBS_T03_2026_Shopee.xlsx', date: '31/03/2026 14:22', status: 'matched', rows: 1199, platform: 'shopee' },
    { name: 'GBS_T03_2026_Lazada.xlsx', date: '31/03/2026 14:20', status: 'matched', rows: 7, platform: 'lazada' },
    { name: 'GBS_T03_2026_TikTok.xlsx', date: '31/03/2026 14:18', status: 'partial', rows: 14, platform: 'tiktok' },
    { name: 'GBS_T02_2026_Shopee.xlsx', date: '01/03/2026 09:15', status: 'matched', rows: 1078, platform: 'shopee' },
    { name: 'GBS_T02_2026_Lazada.xlsx', date: '01/03/2026 09:12', status: 'matched', rows: 12, platform: 'lazada' },
  ];

  const discrepancies = [
    { id: '260331HBWR9W3C', platform: 'shopee', system: 227800, gbs: 215000, diff: -12800, reason: 'Phí vận chuyển sai lệch' },
    { id: '260331HCCUSA8J', platform: 'shopee', system: 232900, gbs: 220000, diff: -12900, reason: 'Phí dịch vụ chưa cộng' },
    { id: '260330FEB87NYJ', platform: 'lazada', system: 144800, gbs: 132500, diff: -12300, reason: 'Giảm giá voucher' },
    { id: '260330FHD63AQ0', platform: 'shopee', system: 257000, gbs: 268000, diff: 11000, reason: 'GBS làm tròn lên' },
    { id: '260331J7DCVUWV', platform: 'shopee', system: 222439, gbs: 222000, diff: -439, reason: 'Làm tròn' },
  ];

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>

      <div className="row row-4">
        <KPI label="Tổng đơn cần đối soát" value={fmtFull(totalOrders)} sub="Tháng 03/2026" accent="brand" icon={I.cart}/>
        <KPI label="Đã khớp" value={fmtFull(matched)} sub={fmtPct(safePct(matched, totalOrders))} accent="green" icon={I.check}/>
        <KPI label="Sai lệch" value={fmtFull(discrepancy)} sub="cần xem xét" accent="amber" icon={I.pct}/>
        <KPI label="Chưa khớp" value={fmtFull(missing)} sub="thiếu trong GBS" accent="red" icon={I.x}/>
      </div>

      <div className="row row-1-2">
        <div className="card card-lg">
          <div className="card-head">
            <div>
              <h3>Tải file GBS lên</h3>
              <div className="sub">Hỗ trợ .xlsx, .xls</div>
            </div>
          </div>
          <UploadZone label="Kéo file GBS vào đây hoặc click để chọn" accept=".xlsx,.xls"/>
        </div>

        <div className="card card-lg card-flush">
          <div style={{padding:'20px 22px 14px', display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
            <div>
              <h3>File GBS đã tải lên</h3>
              <div className="sub" style={{fontSize:11.5, color:'var(--ink-3)', marginTop:2}}>5 file gần đây</div>
            </div>
            <button className="chip" style={{padding:'6px 12px', fontSize:11.5}}>Xem tất cả</button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>File</th>
                <th>Sàn</th>
                <th className="num">Số dòng</th>
                <th>Trạng thái</th>
                <th>Thời gian</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {files.map((f,i) => (
                <tr key={i}>
                  <td style={{fontWeight:600, fontSize:12.5}}>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <span style={{width:24, height:24, borderRadius:6, background:'var(--surface-3)', display:'grid', placeItems:'center', fontSize:10, fontWeight:800, color:'var(--green)'}}>X</span>
                      {f.name}
                    </div>
                  </td>
                  <td><span className={`platform-tag ${f.platform}`}>{PLATFORM_NAME[f.platform]}</span></td>
                  <td className="num">{fmtFull(f.rows)}</td>
                  <td>
                    {f.status === 'matched'
                      ? <span className="status status-done">Đã khớp</span>
                      : <span className="status status-pending">Một phần</span>}
                  </td>
                  <td className="mono" style={{fontSize:11, color:'var(--ink-3)'}}>{f.date}</td>
                  <td>
                    <button style={{background:'transparent', border:'none', cursor:'pointer', color:'var(--ink-3)', padding:4}}>⋯</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-lg card-flush">
        <div style={{padding:'20px 22px 16px', display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
          <div>
            <h3>Chi tiết đơn sai lệch</h3>
            <div className="sub" style={{fontSize:11.5, color:'var(--ink-3)', marginTop:2}}>Đơn có chênh lệch giữa hệ thống và GBS</div>
          </div>
          <div className="tabs">
            <button className="tab active">Tất cả</button>
            <button className="tab">Hệ thống &gt; GBS</button>
            <button className="tab">GBS &gt; Hệ thống</button>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Sàn</th>
              <th className="num">Hệ thống</th>
              <th className="num">GBS</th>
              <th className="num">Chênh lệch</th>
              <th>Lý do</th>
            </tr>
          </thead>
          <tbody>
            {discrepancies.map((d,i) => (
              <tr key={i}>
                <td className="mono" style={{fontWeight:600, fontSize:11.5}}>{d.id}</td>
                <td><span className={`platform-tag ${d.platform}`}>{PLATFORM_NAME[d.platform]}</span></td>
                <td className="num">{fmtFull(d.system)}₫</td>
                <td className="num">{fmtFull(d.gbs)}₫</td>
                <td className="num">
                  <span style={{color: d.diff < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700}}>
                    {d.diff > 0 ? '+' : ''}{fmtFull(d.diff)}₫
                  </span>
                </td>
                <td style={{fontSize:12, color:'var(--ink-2)'}}>{d.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UploadZone({ label, accent, accept = '.xlsx,.xls,.csv', onFile, file: controlledFile }) {
  const [drag, setDrag] = React.useState(false);
  const [localFile, setLocalFile] = React.useState(null);
  const file = controlledFile !== undefined ? controlledFile : localFile;
  const setSelectedFile = (nextFile) => {
    if (onFile) onFile(nextFile);
    else setLocalFile(nextFile);
  };
  return (
    <div
      onDragOver={(e)=>{e.preventDefault(); setDrag(true);}}
      onDragLeave={()=>setDrag(false)}
      onDrop={(e)=>{e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if(f) setSelectedFile(f);}}
      onClick={(e) => e.currentTarget.querySelector('input').click()}
      style={{
        border: '2px dashed ' + (drag ? 'var(--brand-1)' : 'var(--line)'),
        background: drag ? 'var(--brand-glow)' : 'var(--surface-2)',
        borderRadius: 16,
        padding: '36px 20px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s',
        minHeight: 220,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
      <div style={{
        width: 56, height: 56, margin: '0 auto 14px',
        borderRadius: 14, background: accent || 'var(--brand-1)',
        display: 'grid', placeItems: 'center', color: '#fff',
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="26" height="26">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      {file ? (
        <>
          <div style={{fontSize:14, fontWeight:700}}>{file.name}</div>
          <div style={{fontSize:11.5, color:'var(--ink-3)', marginTop:4}}>{(file.size/1024).toFixed(1)} KB · sẵn sàng tải lên</div>
        </>
      ) : (
        <>
          <div style={{fontSize:14, fontWeight:700, color:'var(--ink)'}}>{label}</div>
          <div style={{fontSize:12, color:'var(--ink-3)', marginTop:6}}>{accept.split(',').join(' · ')} · tối đa 20MB</div>
        </>
      )}
      <input type="file" accept={accept} style={{display:'none'}}
             onChange={(e)=>{const f = e.target.files[0]; if(f) setSelectedFile(f);}}
             onClick={(e)=>e.stopPropagation()}/>
    </div>
  );
}

// ── Page: UPLOAD ───────────────────────────────────────────────────────

function PageUpload({ data }) {
  const [file, setFile] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const history = data.upload_history || [];
  const totals = history.reduce((acc, h) => {
    acc.files += 1;
    acc.rows += h.rows || 0;
    acc.imported += h.imported || 0;
    if (h.status === 'completed') acc.completed += 1;
    if (h.status === 'failed') acc.failed += 1;
    return acc;
  }, { files: 0, rows: 0, imported: 0, completed: 0, failed: 0 });

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('../api/upload.php', { method: 'POST', body: fd, credentials: 'same-origin' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || json.error || 'Upload thất bại');
      setMessage(json.message || 'Tải file thành công. Tải lại trang để cập nhật lịch sử.');
      setFile(null);
    } catch (err) {
      setMessage(err.message || 'Upload thất bại');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>

      <div className="row row-4">
        <KPI label="File gần đây" value={fmtFull(totals.files)} sub="20 lần tải mới nhất" accent="brand" icon={I.pkg}/>
        <KPI label="Dòng đã đọc" value={fmtFull(totals.rows)} sub="từ lịch sử upload" accent="green" icon={I.trend}/>
        <KPI label="Đã import" value={fmtFull(totals.imported)} sub={`${fmtFull(totals.completed)} file thành công`} accent="amber" icon={I.check}/>
        <KPI label="Lỗi" value={fmtFull(totals.failed)} sub="file cần kiểm tra lại" accent="red" icon={I.x}/>
      </div>

      <div className="card card-lg">
        <div className="card-head">
          <div>
            <h3>Tải file dữ liệu lên</h3>
            <div className="sub">Một điểm upload duy nhất, hệ thống tự nhận diện sàn và loại dữ liệu trong file</div>
          </div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'minmax(0,1fr) 260px', gap:18, alignItems:'stretch'}}>
          <UploadZone label="Kéo file đơn hàng hoặc traffic vào đây" accept=".xlsx,.xls"
                      onFile={setFile} file={file} accent="var(--brand-1)"/>
          <div style={{border:'1px solid var(--line)', borderRadius:14, padding:16, background:'var(--surface-2)', display:'flex', flexDirection:'column', justifyContent:'space-between', gap:14}}>
            <div>
              <div style={{fontSize:12, color:'var(--ink-3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em'}}>File đang chọn</div>
              <div style={{fontSize:14, fontWeight:800, marginTop:8, wordBreak:'break-word'}}>{file ? file.name : 'Chưa chọn file'}</div>
              <div style={{fontSize:12, color:'var(--ink-3)', marginTop:6}}>{file ? `${(file.size/1024/1024).toFixed(2)} MB` : 'Hỗ trợ Excel Shopee, Lazada, TikTok Shop và traffic'}</div>
            </div>
            {message && <div style={{fontSize:12, fontWeight:700, color: message.includes('thành công') ? 'var(--green)' : 'var(--red)'}}>{message}</div>}
            <button className="btn-primary" disabled={!file || busy} onClick={submit}
                    style={{opacity:(!file || busy) ? .55 : 1, cursor:(!file || busy) ? 'not-allowed' : 'pointer'}}>
              {busy ? 'Đang xử lý...' : 'Tải lên'}
            </button>
          </div>
        </div>
      </div>

      <div className="card card-lg card-flush">
        <div style={{padding:'20px 22px 14px', display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
          <div>
            <h3>Lịch sử tải lên</h3>
            <div className="sub" style={{fontSize:11.5, color:'var(--ink-3)', marginTop:2}}>20 lần tải gần đây</div>
          </div>
          <div style={{display:'flex', gap:8}}>
            <button className="chip" style={{padding:'6px 12px', fontSize:11.5}}>Tự nhận diện file</button>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Tên file</th>
              <th>Sàn</th>
              <th>Loại</th>
              <th className="num">Số dòng</th>
              <th className="num">Import</th>
              <th>Trạng thái</th>
              <th>Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {history.length ? history.map((h, i) => (
              <tr key={`${h.file}-${h.time}-${i}`}>
                <td style={{fontWeight:600, fontSize:12.5}}>{h.file}</td>
                <td><span className={`platform-tag ${h.platform}`}>{PLATFORM_NAME[h.platform]}</span></td>
                <td style={{fontSize:12, color:'var(--ink-2)'}}>{h.data_type === 'traffic' ? 'Traffic' : 'Đơn hàng'}</td>
                <td className="num">{fmtFull(h.rows)}</td>
                <td className="num">{fmtFull(h.imported || 0)}</td>
                <td>
                  {h.status === 'completed' && <span className="status status-done">Thành công</span>}
                  {(h.status === 'pending' || h.status === 'processing') && <span className="status status-pending">Đang xử lý</span>}
                  {h.status === 'failed' && <span className="status status-cancel">Thất bại</span>}
                </td>
                <td className="mono" style={{fontSize:11, color:'var(--ink-3)'}}>{h.time}</td>
              </tr>
            )) : (
              <tr><td colSpan="7"><div className="empty-state">Chưa có lịch sử upload.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PageDataLinks({ data }) {
  const settings = data.reconcile_settings || {};
  const prices = settings.prices || [];
  const combos = settings.combos || [];
  const byPlatform = ['all', 'shopee', 'lazada', 'tiktokshop'].map(p => ({
    platform: p,
    combos: combos.filter(c => c.platform === p).length,
    prices: p === 'all' ? prices.length : 0,
  }));

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>
      <div className="row row-3">
        <KPI label="SKU giá GBS" value={fmtFull(prices.length)} sub="dùng để đối chiếu đơn giá" accent="brand" icon={I.pkg}/>
        <KPI label="Quy đổi combo" value={fmtFull(combos.length)} sub="combo sang SKU đơn" accent="green" icon={I.check}/>
        <KPI label="Sàn đã liên kết" value={fmtFull(byPlatform.filter(p=>p.combos || p.prices).length)} sub="all / Shopee / Lazada / TikTok" accent="amber" icon={I.trend}/>
      </div>

      <div className="card card-lg card-flush">
        <div style={{padding:'20px 22px 14px'}}>
          <h3>Liên kết dữ liệu theo sàn</h3>
          <div className="sub" style={{fontSize:11.5, color:'var(--ink-3)', marginTop:2}}>Nguồn quy tắc đang dùng cho đối soát GBS và quy đổi Combo sang SKU</div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Phạm vi</th>
              <th className="num">Quy tắc combo</th>
              <th className="num">SKU giá GBS</th>
              <th>Ứng dụng</th>
            </tr>
          </thead>
          <tbody>
            {byPlatform.map(row => (
              <tr key={row.platform}>
                <td>{row.platform === 'all' ? 'Tất cả sàn' : <span className={`platform-tag ${row.platform === 'tiktokshop' ? 'tiktok' : row.platform}`}>{PLATFORM_NAME[row.platform === 'tiktokshop' ? 'tiktok' : row.platform]}</span>}</td>
                <td className="num">{fmtFull(row.combos)}</td>
                <td className="num">{fmtFull(row.prices)}</td>
                <td style={{fontSize:12, color:'var(--ink-2)'}}>Đối chiếu GBS · Chuẩn hoá SKU · Tách combo</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PageProductCatalog({ data }) {
  const settings = data.reconcile_settings || {};
  const [prices, setPrices] = React.useState(settings.prices || []);
  const [combos, setCombos] = React.useState(settings.combos || []);
  const [tab, setTab] = React.useState('prices');
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const rows = tab === 'prices' ? prices : combos;
  const inputStyle = {width:'100%', minWidth:90, padding:'7px 8px', border:'1px solid var(--line)', borderRadius:8, background:'var(--surface)', color:'var(--ink)', font:'inherit', fontSize:12};
  const skuOptions = React.useMemo(() => prices
    .filter(p => String(p.sku || '').trim())
    .map(p => ({sku: String(p.sku || '').trim().toUpperCase(), name: String(p.product_name || '').trim()})), [prices]);
  const comboGroups = React.useMemo(() => {
    const groups = [];
    const byKey = new Map();
    combos.forEach((row, index) => {
      const key = [
        String(row.platform || 'all').toLowerCase(),
        String(row.combo_sku || '').trim().toUpperCase(),
        String(row.combo_name || '').trim().toLowerCase(),
      ].join('|');
      if (!byKey.has(key)) {
        byKey.set(key, {key, rows: [], indices: []});
        groups.push(byKey.get(key));
      }
      byKey.get(key).rows.push(row);
      byKey.get(key).indices.push(index);
    });
    return groups;
  }, [combos]);
  const updatePrice = (idx, key, value) => setPrices(prices.map((r,i)=>i===idx ? {...r, [key]: key === 'unit_price' ? safeNum(value) : value} : r));
  const updateCombo = (idx, key, value) => setCombos(combos.map((r,i)=>i===idx ? {...r, [key]: key === 'single_qty' ? safeNum(value) : value} : r));
  const updateComboGroup = (indices, key, value) => setCombos(combos.map((r,i)=>indices.includes(i) ? {...r, [key]: value} : r));
  const addRow = () => {
    if (tab === 'prices') setPrices([{sku:'', product_name:'', brand:'', unit_price:0}, ...prices]);
    else setCombos([{platform:'all', combo_sku:'', combo_name:'', single_sku:'', single_qty:1}, ...combos]);
  };
  const addSkuToCombo = (indices) => {
    const last = Math.max(...indices);
    const base = combos[indices[0]] || {platform:'all', combo_sku:'', combo_name:''};
    setCombos([...combos.slice(0, last + 1), {...base, single_sku:'', single_qty:1}, ...combos.slice(last + 1)]);
  };
  const removeRow = (idx) => {
    if (tab === 'prices') setPrices(prices.filter((_, i) => i !== idx));
    else setCombos(combos.filter((_, i) => i !== idx));
  };
  const saveRows = async () => {
    setSaving(true);
    setMessage('');
    try {
      const cleanPrices = prices.filter(r => String(r.sku || '').trim() || String(r.product_name || '').trim() || String(r.brand || '').trim() || safeNum(r.unit_price) > 0);
      const cleanCombos = combos.filter(r => String(r.combo_sku || '').trim() || String(r.combo_name || '').trim() || String(r.single_sku || '').trim());
      const res = await fetch('../api/reconcile-settings.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {'Content-Type':'application/json', 'X-CSRF-Token': window.__BETA__?.csrf || ''},
        body: JSON.stringify({action:'save', prices: cleanPrices, combos: cleanCombos}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || json.error || 'Không thể lưu danh sách sản phẩm');
      setPrices(json.prices || prices);
      setCombos(json.combos || combos);
      setMessage(json.message || 'Đã lưu danh sách sản phẩm.');
    } catch (err) {
      setMessage(err.message || 'Không thể lưu danh sách sản phẩm');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>
      <div className="row row-3">
        <KPI label="SKU sản phẩm" value={fmtFull(prices.length)} sub="danh sách giá GBS" accent="brand" icon={I.pkg}/>
        <KPI label="Combo mapping" value={fmtFull(combos.length)} sub="dòng quy đổi sang SKU" accent="green" icon={I.trend}/>
        <KPI label="Đơn giá TB" value={fmtVnd(safeDiv(prices.reduce((s,p)=>s+(p.unit_price||0),0), prices.length))+'₫'} sub="trên SKU có giá" accent="amber" icon={I.money}/>
      </div>

      <div className="card card-lg card-flush">
        <div style={{padding:'20px 22px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap'}}>
          <div>
            <h3>Danh sách sản phẩm đối chiếu</h3>
            <div className="sub" style={{fontSize:11.5, color:'var(--ink-3)', marginTop:2}}>SKU, giá GBS và cấu hình quy đổi Combo sang SKU đơn</div>
          </div>
          <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
            {message && <span style={{fontSize:11.5, fontWeight:700, color: message.includes('lưu') || message.includes('Đã') ? 'var(--green)' : 'var(--red)'}}>{message}</span>}
            <button className="chip" onClick={addRow}>{tab === 'prices' ? '+ Thêm SKU' : '+ Thêm combo'}</button>
            <button className="btn-primary" onClick={saveRows} disabled={saving} style={{boxShadow:'none', opacity:saving ? .65 : 1}}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
            <div className="tabs">
              <button className={'tab '+(tab==='prices'?'active':'')} onClick={()=>setTab('prices')}>SKU giá GBS</button>
              <button className={'tab '+(tab==='combos'?'active':'')} onClick={()=>setTab('combos')}>Combo → SKU</button>
            </div>
          </div>
        </div>
        <div style={{maxHeight:650, overflowY:'auto'}}>
          <table className="table">
            <thead style={{position:'sticky', top:0}}>
              {tab === 'prices' ? (
                <tr><th>SKU</th><th>Tên sản phẩm</th><th>Brand</th><th className="num">Giá GBS</th><th></th></tr>
              ) : (
                <tr><th>Sàn</th><th>SKU combo</th><th>Tên combo / từ khoá</th><th>SKU sản phẩm trong danh sách</th><th className="num">SL trong combo</th><th></th></tr>
              )}
            </thead>
            <tbody>
              {tab === 'prices' && rows.length ? rows.slice(0, 120).map((r,i) => (
                <tr key={`${r.sku}-${i}`}>
                  <td><input style={{...inputStyle, fontFamily:'JetBrains Mono, monospace', fontWeight:700}} value={r.sku || ''} onChange={e=>updatePrice(i, 'sku', e.target.value)}/></td>
                  <td><input style={inputStyle} value={r.product_name || ''} onChange={e=>updatePrice(i, 'product_name', e.target.value)}/></td>
                  <td><input style={inputStyle} value={r.brand || ''} onChange={e=>updatePrice(i, 'brand', e.target.value)}/></td>
                  <td className="num"><input style={{...inputStyle, textAlign:'right'}} type="number" min="0" value={r.unit_price || 0} onChange={e=>updatePrice(i, 'unit_price', e.target.value)}/></td>
                  <td className="num"><button className="chip" onClick={()=>removeRow(i)}>Xoá</button></td>
                </tr>
              )) : null}
              {tab === 'combos' && comboGroups.length ? comboGroups.slice(0, 80).flatMap(group => group.rows.map((r, childIndex) => {
                const i = group.indices[childIndex];
                const rowSpan = group.rows.length;
                return (
                  <tr key={`${group.key}-${i}`}>
                    {childIndex === 0 && (
                      <td rowSpan={rowSpan}>
                        <select style={inputStyle} value={r.platform || 'all'} onChange={e=>updateComboGroup(group.indices, 'platform', e.target.value)}>
                          <option value="all">Tất cả</option>
                          <option value="shopee">Shopee</option>
                          <option value="lazada">Lazada</option>
                          <option value="tiktokshop">TikTok Shop</option>
                        </select>
                      </td>
                    )}
                    {childIndex === 0 && (
                      <td rowSpan={rowSpan}><input style={{...inputStyle, fontFamily:'JetBrains Mono, monospace', fontWeight:700}} value={r.combo_sku || ''} onChange={e=>updateComboGroup(group.indices, 'combo_sku', e.target.value)} placeholder="SKU combo trên sàn"/></td>
                    )}
                    {childIndex === 0 && (
                      <td rowSpan={rowSpan}>
                        <input style={inputStyle} value={r.combo_name || ''} onChange={e=>updateComboGroup(group.indices, 'combo_name', e.target.value)} placeholder="Tên/từ khoá combo"/>
                        <button className="chip" onClick={()=>addSkuToCombo(group.indices)} style={{marginTop:8, justifyContent:'center'}}>+ SKU con</button>
                      </td>
                    )}
                    <td>
                      <input list="betaProductSkuOptions" style={{...inputStyle, fontFamily:'JetBrains Mono, monospace', fontWeight:700}} value={r.single_sku || ''} onChange={e=>updateCombo(i, 'single_sku', e.target.value)} placeholder="Chọn SKU trong danh sách"/>
                      {r.single_sku && !skuOptions.some(opt => opt.sku === String(r.single_sku || '').trim().toUpperCase()) && (
                        <div style={{fontSize:10.5, color:'var(--amber)', marginTop:4, fontWeight:700}}>SKU này chưa có trong danh sách giá GBS</div>
                      )}
                    </td>
                    <td className="num"><input style={{...inputStyle, textAlign:'right'}} type="number" min="0" step="0.0001" value={r.single_qty || 0} onChange={e=>updateCombo(i, 'single_qty', e.target.value)}/></td>
                    <td className="num"><button className="chip" onClick={()=>removeRow(i)}>Xoá SKU</button></td>
                  </tr>
                );
              })) : null}
              {!rows.length ? (
                <tr><td colSpan="6"><div className="empty-state">Chưa có dữ liệu cấu hình sản phẩm.</div></td></tr>
              ) : null}
            </tbody>
          </table>
          <datalist id="betaProductSkuOptions">
            {skuOptions.map(opt => <option key={opt.sku} value={opt.sku}>{opt.name || opt.sku}</option>)}
          </datalist>
        </div>
      </div>
    </div>
  );
}

// ── Page: LOGS ─────────────────────────────────────────────────────────

function PageLogs() {
  const [filter, setFilter] = React.useState('all');
  const logs = [
    { time: '2026-03-31 14:30:22', level: 'info',    user: 'admin',     action: 'upload',  msg: 'Tải file Data_Order_Shopee_T03.xlsx thành công (1199 dòng)' },
    { time: '2026-03-31 14:28:11', level: 'info',    user: 'admin',     action: 'upload',  msg: 'Tải file Data_Order_Lazada_T03.xlsx thành công (7 dòng)' },
    { time: '2026-03-31 14:25:55', level: 'warning', user: 'admin',     action: 'sync',    msg: 'API TikTok Shop trả về 3 đơn không hợp lệ, đã bỏ qua' },
    { time: '2026-03-31 14:22:43', level: 'info',    user: 'admin',     action: 'reconcile', msg: 'Đối soát GBS tháng 03/2026 hoàn thành: 1046 khớp, 174 sai lệch' },
    { time: '2026-03-31 11:15:08', level: 'error',   user: 'system',    action: 'api',     msg: 'Token Lazada hết hạn — vui lòng cấp quyền lại' },
    { time: '2026-03-31 09:30:00', level: 'info',    user: 'system',    action: 'cron',    msg: 'Tự động sync đơn hàng từ Shopee (24 đơn mới)' },
    { time: '2026-03-31 08:45:21', level: 'info',    user: 'staff_01',  action: 'login',   msg: 'Đăng nhập từ IP 113.161.xx.xx (Hà Nội)' },
    { time: '2026-03-30 16:20:14', level: 'warning', user: 'admin',     action: 'config',  msg: 'Thay đổi cấu hình: giới hạn upload file lên 50MB' },
    { time: '2026-03-30 14:10:55', level: 'info',    user: 'admin',     action: 'user',    msg: 'Tạo tài khoản mới: staff_03 (vai trò: staff)' },
    { time: '2026-03-30 09:05:33', level: 'error',   user: 'system',    action: 'parse',   msg: 'Lỗi parse file Data_Order_TikTok_T02.xlsx: dòng 8 không hợp lệ' },
    { time: '2026-03-29 22:30:00', level: 'info',    user: 'system',    action: 'backup',  msg: 'Backup database hoàn thành (412MB)' },
    { time: '2026-03-29 15:42:18', level: 'info',    user: 'admin',     action: 'product', msg: 'Cập nhật 12 sản phẩm vào danh mục liên kết SKU' },
  ];
  const filtered = filter === 'all' ? logs : logs.filter(l => l.level === filter);

  const counts = {
    all: logs.length,
    info: logs.filter(l => l.level === 'info').length,
    warning: logs.filter(l => l.level === 'warning').length,
    error: logs.filter(l => l.level === 'error').length,
  };

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>
      <div className="row row-4">
        <KPI label="Tổng sự kiện" value={counts.all} sub="24 giờ qua" accent="brand" icon={I.clock}/>
        <KPI label="Info" value={counts.info} sub="Hoạt động bình thường" accent="green" icon={I.check}/>
        <KPI label="Cảnh báo" value={counts.warning} sub="Cần xem xét" accent="amber" icon={I.pct}/>
        <KPI label="Lỗi" value={counts.error} sub="Cần xử lý ngay" accent="red" icon={I.x}/>
      </div>

      <div className="card card-lg card-flush">
        <div style={{padding:'20px 22px 14px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div>
            <h3>Nhật ký hoạt động</h3>
            <div className="sub" style={{fontSize:11.5, color:'var(--ink-3)', marginTop:2}}>Tất cả sự kiện và lỗi được ghi tự động</div>
          </div>
          <div style={{display:'flex', gap:12, alignItems:'center'}}>
            <div className="tabs">
              {['all','info','warning','error'].map(l => (
                <button key={l} className={'tab '+(filter===l?'active':'')} onClick={()=>setFilter(l)}>
                  {l === 'all' ? 'Tất cả' : l === 'info' ? 'Info' : l === 'warning' ? 'Cảnh báo' : 'Lỗi'} <span style={{opacity:0.6, fontSize:10, marginLeft:3}}>{counts[l]}</span>
                </button>
              ))}
            </div>
            <input className="search-input" placeholder="Tìm trong log…"
                   style={{padding:'7px 12px', fontSize:12, borderRadius:8, border:'1px solid var(--line)', background:'var(--surface-2)', color:'var(--ink)', width: 180}}/>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th style={{width:170}}>Thời gian</th>
              <th style={{width:100}}>Mức độ</th>
              <th style={{width:120}}>Người dùng</th>
              <th style={{width:120}}>Hành động</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l,i) => (
              <tr key={i}>
                <td className="mono" style={{fontSize:11.5, color:'var(--ink-3)'}}>{l.time}</td>
                <td>
                  {l.level === 'info' && <span className="status status-done">Info</span>}
                  {l.level === 'warning' && <span className="status status-pending">Cảnh báo</span>}
                  {l.level === 'error' && <span className="status status-cancel">Lỗi</span>}
                </td>
                <td style={{fontSize:12.5, fontWeight:600}}>@{l.user}</td>
                <td><span style={{padding:'2px 8px', borderRadius:6, background:'var(--surface-3)', fontSize:11, fontWeight:600, color:'var(--ink-2)'}}>{l.action}</span></td>
                <td style={{fontSize:12.5, color:'var(--ink-2)'}}>{l.msg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page: SETTINGS ─────────────────────────────────────────────────────

function PageSettings() {
  const [tab, setTab] = React.useState('profile');
  return (
    <div className="page" style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>
      <div className="card card-lg">
        <div className="tabs" style={{marginBottom:18}}>
          <button className={'tab '+(tab==='profile'?'active':'')} onClick={()=>setTab('profile')}>Hồ sơ</button>
          <button className={'tab '+(tab==='password'?'active':'')} onClick={()=>setTab('password')}>Mật khẩu</button>
          <button className={'tab '+(tab==='language'?'active':'')} onClick={()=>setTab('language')}>Ngôn ngữ</button>
          <button className={'tab '+(tab==='notifications'?'active':'')} onClick={()=>setTab('notifications')}>Thông báo</button>
          <button className={'tab '+(tab==='brand'?'active':'')} onClick={()=>setTab('brand')}>Thương hiệu</button>
          <button className={'tab '+(tab==='beta-update'?'active':'')} onClick={()=>setTab('beta-update')}>Cập nhật beta</button>
        </div>

        {tab === 'profile' && <SettingsProfile/>}
        {tab === 'password' && <SettingsPassword/>}
        {tab === 'language' && <SettingsLanguage/>}
        {tab === 'notifications' && <SettingsNotifications/>}
        {tab === 'brand' && <SettingsBrand/>}
        {tab === 'beta-update' && <SettingsBetaUpdate/>}
      </div>
    </div>
  );
}

function SettingsBetaUpdate() {
  const [info, setInfo] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const load = async (force=false) => {
    setBusy(true);
    setMessage('');
    try {
      if (force) {
        await fetch('../api/beta-update.php', {
          method:'POST',
          credentials:'same-origin',
          headers:{'Content-Type':'application/json', 'X-CSRF-Token': window.__BETA__?.csrf || ''},
          body: JSON.stringify({action:'check_now'}),
        });
      }
      const res = await fetch('../api/beta-update.php', {credentials:'same-origin'});
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Không thể kiểm tra cập nhật beta');
      setInfo(json);
    } catch (err) {
      setMessage(err.message || 'Không thể kiểm tra cập nhật beta');
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!info?.has_update) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('../api/beta-update.php', {
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json', 'X-CSRF-Token': window.__BETA__?.csrf || ''},
        body: JSON.stringify({action:'apply', version: info.latest, download_url: info.download_url}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || 'Cập nhật beta thất bại');
      setMessage(json.message || 'Đã cập nhật beta.');
    } catch (err) {
      setMessage(err.message || 'Cập nhật beta thất bại');
    } finally {
      setBusy(false);
    }
  };
  React.useEffect(() => { load(false); }, []);
  return (
    <div style={{maxWidth:760}}>
      <div className="card" style={{padding:18, background:'var(--surface-2)', boxShadow:'none'}}>
        <div style={{display:'flex', justifyContent:'space-between', gap:16, alignItems:'flex-start'}}>
          <div>
            <div style={{fontSize:18, fontWeight:800}}>Kênh cập nhật Beta</div>
            <div style={{fontSize:12, color:'var(--ink-3)', marginTop:4}}>Beta dùng manifest riêng, tách khỏi manifest production.</div>
          </div>
          {info?.has_update ? <span className="status status-pending">Có bản mới</span> : <span className="status status-done">Đang mới nhất</span>}
        </div>
        <div className="row row-3" style={{marginTop:18}}>
          <KPI label="Hiện tại" value={info?.current || '—'} sub="version.txt" accent="brand" icon={I.pkg}/>
          <KPI label="Beta mới nhất" value={info?.latest || '—'} sub={info?.released_at || 'manifest beta'} accent="green" icon={I.trend}/>
          <KPI label="Kiểm tra" value={info?.last_checked || '—'} sub="cache riêng beta" accent="amber" icon={I.clock}/>
        </div>
        {info?.changelog && <div style={{whiteSpace:'pre-line', fontSize:12.5, color:'var(--ink-2)', marginTop:16, lineHeight:1.7}}>{info.changelog}</div>}
        {info?.manifest_url && <div className="mono" style={{fontSize:11, color:'var(--ink-3)', marginTop:12, wordBreak:'break-all'}}>{info.manifest_url}</div>}
        {message && <div style={{fontSize:12, fontWeight:700, color: message.includes('thất bại') || message.includes('Không thể') ? 'var(--red)' : 'var(--green)', marginTop:12}}>{message}</div>}
        <div style={{display:'flex', gap:10, marginTop:18}}>
          <button className="chip" onClick={()=>load(true)} disabled={busy}>{busy ? 'Đang kiểm tra...' : 'Kiểm tra lại'}</button>
          <button className="btn-primary" onClick={apply} disabled={busy || !info?.has_update} style={{opacity: busy || !info?.has_update ? .55 : 1}}>Cập nhật beta</button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, value, type='text', placeholder, help }) {
  const [v, setV] = React.useState(value || '');
  return (
    <div style={{display:'flex', flexDirection:'column', gap:5}}>
      <label style={{fontSize:12, fontWeight:700, color:'var(--ink-2)'}}>{label}</label>
      <input type={type} value={v} onChange={e=>setV(e.target.value)} placeholder={placeholder}
             style={{
               padding:'10px 12px',
               border:'1px solid var(--line)',
               background:'var(--surface)',
               borderRadius: 10,
               fontSize: 13,
               color: 'var(--ink)',
               fontFamily: 'inherit',
               outline: 'none',
             }}/>
      {help && <div style={{fontSize:11, color:'var(--ink-3)'}}>{help}</div>}
    </div>
  );
}

function SettingsProfile() {
  return (
    <div>
      <div style={{display:'flex', alignItems:'center', gap:18, marginBottom:24}}>
        <div className="user-avatar" style={{width:72, height:72, fontSize:24, borderRadius:'50%'}}>AD</div>
        <div style={{flex:1}}>
          <div style={{fontSize:18, fontWeight:800, letterSpacing:'-0.02em'}}>Admin</div>
          <div style={{fontSize:12.5, color:'var(--ink-3)', marginTop:2}}>Quản trị viên · Đăng nhập gần nhất 31/03/2026</div>
        </div>
        <button style={{
          padding:'8px 16px', borderRadius:10,
          background:'var(--brand-1)', color:'#fff',
          border:'none', cursor:'pointer', fontWeight:600, fontSize:12,
          fontFamily:'inherit',
        }}>Tải ảnh đại diện</button>
      </div>
      <div className="row row-2">
        <FormField label="Họ và tên" value="Nguyễn Quản Trị" placeholder="Họ tên đầy đủ"/>
        <FormField label="Tên đăng nhập" value="admin" placeholder="Tên đăng nhập"/>
        <FormField label="Email" value="admin@zott-monte.vn" type="email"/>
        <FormField label="Số điện thoại" value="0901 234 567" placeholder="SĐT"/>
      </div>
      <div style={{marginTop:24, display:'flex', justifyContent:'flex-end', gap:8}}>
        <button className="chip">Huỷ bỏ</button>
        <button style={{padding:'9px 18px', borderRadius:10, background:'linear-gradient(135deg, var(--brand-1), var(--brand-2))', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:13, fontFamily:'inherit'}}>Lưu thay đổi</button>
      </div>
    </div>
  );
}

function SettingsPassword() {
  return (
    <div style={{maxWidth: 480}}>
      <FormField label="Mật khẩu hiện tại" type="password" placeholder="••••••••"/>
      <div style={{height:14}}/>
      <FormField label="Mật khẩu mới" type="password" placeholder="Tối thiểu 8 ký tự, chứa số và chữ hoa" help="Mức độ: Mạnh"/>
      <div style={{height:14}}/>
      <FormField label="Nhập lại mật khẩu mới" type="password" placeholder="••••••••"/>
      <div style={{marginTop:24}}>
        <button style={{padding:'10px 20px', borderRadius:10, background:'linear-gradient(135deg, var(--brand-1), var(--brand-2))', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:13, fontFamily:'inherit'}}>Đổi mật khẩu</button>
      </div>
    </div>
  );
}

function SettingsLanguage() {
  const [lang, setLang] = React.useState('vi');
  const langs = [
    { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
    { code: 'th', name: 'ภาษาไทย', flag: '🇹🇭' },
  ];
  return (
    <div>
      <div style={{fontSize:13, color:'var(--ink-3)', marginBottom:14}}>Chọn ngôn ngữ hiển thị</div>
      <div className="row row-2" style={{gap:12}}>
        {langs.map(l => (
          <div key={l.code} onClick={()=>setLang(l.code)} style={{
            display:'flex', alignItems:'center', gap:14,
            padding:14, borderRadius:12,
            border: '2px solid ' + (lang === l.code ? 'var(--brand-1)' : 'var(--line)'),
            background: lang === l.code ? 'var(--brand-glow)' : 'var(--surface)',
            cursor:'pointer', transition:'all 0.15s',
          }}>
            <div style={{fontSize:28}}>{l.flag}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:14, fontWeight:700}}>{l.name}</div>
              <div style={{fontSize:11.5, color:'var(--ink-3)'}}>{l.code.toUpperCase()}</div>
            </div>
            {lang === l.code && (
              <div style={{width:24, height:24, borderRadius:'50%', background:'var(--brand-1)', display:'grid', placeItems:'center', color:'#fff'}}>✓</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsNotifications() {
  return (
    <div style={{display:'flex', flexDirection:'column', gap:14, maxWidth:600}}>
      {[
        { name: 'Đơn hàng mới', sub: 'Khi có đơn hàng mới từ bất kỳ sàn nào', on: true },
        { name: 'Đơn bị huỷ', sub: 'Cảnh báo khi đơn hàng bị huỷ', on: true },
        { name: 'Tỷ lệ huỷ vượt ngưỡng', sub: 'Khi tỷ lệ huỷ > 15% trong 24 giờ', on: true },
        { name: 'Lỗi đồng bộ API', sub: 'Khi sync từ Shopee/Lazada/TikTok thất bại', on: true },
        { name: 'Sai lệch đối soát GBS', sub: 'Khi có chênh lệch > 1.000.000₫', on: false },
        { name: 'Báo cáo hàng tuần', sub: 'Tự động gửi báo cáo vào sáng thứ 2', on: true },
        { name: 'Mục tiêu doanh thu', sub: 'Khi đạt cột mốc 25%, 50%, 75%, 100%', on: true },
      ].map((n,i) => (
        <NotifToggle key={i} {...n}/>
      ))}
    </div>
  );
}

function NotifToggle({ name, sub, on }) {
  const [v, setV] = React.useState(on);
  return (
    <div style={{display:'flex', alignItems:'center', padding:'12px 14px', background:'var(--surface-2)', borderRadius:12}}>
      <div style={{flex:1}}>
        <div style={{fontSize:13.5, fontWeight:700}}>{name}</div>
        <div style={{fontSize:11.5, color:'var(--ink-3)', marginTop:2}}>{sub}</div>
      </div>
      <div onClick={()=>setV(!v)} style={{
        width:44, height:24, borderRadius:99,
        background: v ? 'var(--brand-1)' : 'var(--surface-3)',
        position:'relative', cursor:'pointer', transition:'background 0.2s',
      }}>
        <div style={{
          position:'absolute', top:2,
          left: v ? 22 : 2,
          width:20, height:20, borderRadius:'50%',
          background:'#fff', transition:'left 0.2s',
          boxShadow:'0 1px 3px rgba(0,0,0,0.2)',
        }}/>
      </div>
    </div>
  );
}

function SettingsBrand() {
  return (
    <div style={{maxWidth:600}}>
      <div style={{display:'flex', alignItems:'center', gap:18, marginBottom:24, padding:18, background:'var(--surface-2)', borderRadius:14}}>
        <div className="brand-logo" style={{width:54, height:54, borderRadius:14}}>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12 L7 16 L11 8 L15 14 L21 6"/>
          </svg>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:17, fontWeight:800}}>Insight Dashboard</div>
          <div style={{fontSize:12, color:'var(--ink-3)', marginTop:2}}>Nền tảng quản lý kinh doanh đa sàn</div>
        </div>
        <button className="chip">Đổi logo</button>
      </div>
      <FormField label="Tên thương hiệu" value="Insight Dashboard" placeholder="Tên hiển thị"/>
      <div style={{height:14}}/>
      <FormField label="Tagline" value="Nền tảng quản lý kinh doanh đa sàn" placeholder="Câu mô tả ngắn"/>
      <div style={{height:14}}/>
      <FormField label="Website" value="https://insight.zott-monte.vn" placeholder="https://"/>
    </div>
  );
}

// ── Page: ADMIN ────────────────────────────────────────────────────────

function PageAdmin() {
  const [tab, setTab] = React.useState('users');
  return (
    <div className="page" style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>

      {/* Hero stats */}
      <div className="row row-4">
        <KPI label="Tổng tài khoản" value="12" sub="3 admin · 9 staff" accent="brand" icon={I.user}/>
        <KPI label="Đang hoạt động" value="11" sub="91.7% tổng" accent="green" icon={I.check}/>
        <KPI label="Bị khoá" value="1" sub="staff_07 — IP đáng ngờ" accent="red" icon={I.x}/>
        <KPI label="Đăng nhập gần nhất" value="2 phút" sub="@admin từ Hà Nội" accent="amber" icon={I.clock}/>
      </div>

      <div className="card card-lg card-flush">
        <div style={{padding:'20px 22px 0'}}>
          <div className="tabs" style={{marginBottom:16}}>
            <button className={'tab '+(tab==='users'?'active':'')} onClick={()=>setTab('users')}>Tài khoản</button>
            <button className={'tab '+(tab==='api'?'active':'')} onClick={()=>setTab('api')}>Kết nối API</button>
            <button className={'tab '+(tab==='system'?'active':'')} onClick={()=>setTab('system')}>Hệ thống</button>
          </div>
        </div>

        {tab === 'users' && <AdminUsers/>}
        {tab === 'api' && <AdminApi/>}
        {tab === 'system' && <AdminSystem/>}
      </div>
    </div>
  );
}

function AdminUsers() {
  const users = [
    { name: 'Nguyễn Quản Trị', user: 'admin',     role: 'admin', active: true,  last: '31/03/2026 14:30', avatar: 'NQ' },
    { name: 'Trần Văn Staff',  user: 'staff_01',  role: 'staff', active: true,  last: '31/03/2026 08:45', avatar: 'TV' },
    { name: 'Lê Thị Phương',   user: 'staff_02',  role: 'staff', active: true,  last: '30/03/2026 17:20', avatar: 'LT' },
    { name: 'Phạm Hoàng Anh',  user: 'admin_02',  role: 'admin', active: true,  last: '30/03/2026 11:08', avatar: 'PH' },
    { name: 'Đỗ Quỳnh Nga',    user: 'staff_03',  role: 'staff', active: true,  last: '29/03/2026 16:42', avatar: 'ĐQ' },
    { name: 'Hoàng Minh Tú',   user: 'staff_07',  role: 'staff', active: false, last: '15/03/2026 09:11', avatar: 'HM' },
  ];
  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th>Tài khoản</th>
            <th>Vai trò</th>
            <th>Trạng thái</th>
            <th>Đăng nhập cuối</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u,i) => (
            <tr key={i}>
              <td>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <div className="user-avatar" style={{width:32, height:32, fontSize:11}}>{u.avatar}</div>
                  <div>
                    <div style={{fontWeight:700, fontSize:13}}>{u.name}</div>
                    <div style={{fontSize:11, color:'var(--ink-3)'}}>@{u.user}</div>
                  </div>
                </div>
              </td>
              <td>
                <span style={{
                  padding:'3px 9px', borderRadius:6, fontSize:11, fontWeight:700,
                  background: u.role === 'admin' ? 'var(--brand-glow)' : 'var(--surface-3)',
                  color: u.role === 'admin' ? 'var(--brand-1)' : 'var(--ink-2)',
                }}>{u.role === 'admin' ? 'Quản trị' : 'Nhân viên'}</span>
              </td>
              <td>
                {u.active
                  ? <span className="status status-done">Hoạt động</span>
                  : <span className="status status-cancel">Bị khoá</span>}
              </td>
              <td className="mono" style={{fontSize:11, color:'var(--ink-3)'}}>{u.last}</td>
              <td>
                <div style={{display:'flex', gap:6, justifyContent:'flex-end'}}>
                  <button className="chip" style={{padding:'4px 10px', fontSize:11}}>Sửa</button>
                  <button className="chip" style={{padding:'4px 10px', fontSize:11, color: 'var(--red)'}}>Xoá</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{padding:'14px 22px', display:'flex', justifyContent:'flex-end'}}>
        <button style={{padding:'10px 18px', borderRadius:10, background:'linear-gradient(135deg, var(--brand-1), var(--brand-2))', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:12.5, fontFamily:'inherit'}}>
          + Tạo tài khoản mới
        </button>
      </div>
    </>
  );
}

function AdminApi() {
  const apis = [
    { id: 'shopee', name: 'Shopee Open Platform', status: 'connected', shop: 'Zott Monte Official', expires: '15/06/2026', last: '31/03/2026 14:25' },
    { id: 'lazada', name: 'Lazada Open Platform', status: 'expired',   shop: 'Zott Monte VN',       expires: '20/03/2026', last: '20/03/2026 09:00' },
    { id: 'tiktok', name: 'TikTok Shop API',      status: 'connected', shop: 'Zott Monte Shop',     expires: '28/09/2026', last: '31/03/2026 14:20' },
  ];
  return (
    <div style={{padding:'4px 22px 22px'}}>
      <div style={{display:'flex', flexDirection:'column', gap:14}}>
        {apis.map(a => (
          <div key={a.id} className="card" style={{margin:0, borderLeft: `4px solid ${PLATFORM_COLORS[a.id]}`}}>
            <div style={{display:'flex', alignItems:'center', gap:16}}>
              <div className={`plat-tile plat-${a.id}`} style={{padding:0, background:'transparent', border:'none'}}>
                <div className="logo" style={{width:46, height:46, fontSize:18}}>{a.id==='shopee'?'S':a.id==='lazada'?'L':'T'}</div>
              </div>
              <div style={{flex:1}}>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <div style={{fontSize:14, fontWeight:800}}>{a.name}</div>
                  {a.status === 'connected'
                    ? <span className="status status-done">Đang kết nối</span>
                    : <span className="status status-cancel">Token hết hạn</span>}
                </div>
                <div style={{fontSize:11.5, color:'var(--ink-3)', marginTop:4}}>
                  Shop: <strong style={{color:'var(--ink-2)'}}>{a.shop}</strong> · 
                  Token hết hạn: <strong style={{color:'var(--ink-2)'}}>{a.expires}</strong> · 
                  Sync cuối: <strong style={{color:'var(--ink-2)'}}>{a.last}</strong>
                </div>
              </div>
              <div style={{display:'flex', gap:8}}>
                <button className="chip" style={{padding:'7px 14px', fontSize:12}}>Sync ngay</button>
                <button style={{
                  padding:'7px 14px', borderRadius:8,
                  background: a.status === 'expired' ? 'var(--red)' : 'var(--brand-1)',
                  color:'#fff', border:'none', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit',
                }}>{a.status === 'expired' ? 'Cấp quyền lại' : 'Quản lý'}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminSystem() {
  return (
    <div style={{padding:'4px 22px 22px'}}>
      <div className="row row-3" style={{marginBottom:18}}>
        <div className="card" style={{margin:0}}>
          <div style={{fontSize:11.5, color:'var(--ink-3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em'}}>Phiên bản</div>
          <div style={{fontSize:22, fontWeight:800, marginTop:6}}>v4.0.0</div>
          <div style={{fontSize:11.5, color:'var(--green)', marginTop:4, fontWeight:600}}>Mới nhất · cập nhật 28/03/2026</div>
        </div>
        <div className="card" style={{margin:0}}>
          <div style={{fontSize:11.5, color:'var(--ink-3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em'}}>Database</div>
          <div style={{fontSize:22, fontWeight:800, marginTop:6}}>412 MB</div>
          <div style={{fontSize:11.5, color:'var(--ink-3)', marginTop:4}}>Backup cuối: 29/03 22:30</div>
        </div>
        <div className="card" style={{margin:0}}>
          <div style={{fontSize:11.5, color:'var(--ink-3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em'}}>Uptime</div>
          <div style={{fontSize:22, fontWeight:800, marginTop:6}}>23 ngày</div>
          <div style={{fontSize:11.5, color:'var(--ink-3)', marginTop:4}}>Khởi động: 08/03/2026</div>
        </div>
      </div>

      <div style={{display:'flex', flexDirection:'column', gap:10}}>
        {[
          { name: 'Sao lưu database', desc: 'Tạo backup database hiện tại', btn: 'Backup ngay', btnColor: 'var(--brand-1)' },
          { name: 'Kiểm tra cập nhật', desc: 'Tìm phiên bản mới của hệ thống', btn: 'Kiểm tra', btnColor: 'var(--brand-1)' },
          { name: 'Xoá cache hệ thống', desc: 'Làm mới cache để áp dụng thay đổi', btn: 'Xoá cache', btnColor: 'var(--amber)' },
          { name: 'Reset dữ liệu mẫu', desc: 'Xoá toàn bộ đơn hàng mẫu (không thể khôi phục)', btn: 'Reset', btnColor: 'var(--red)' },
        ].map((a,i) => (
          <div key={i} style={{display:'flex', alignItems:'center', padding:'14px 16px', background:'var(--surface-2)', borderRadius:12}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:700, fontSize:13.5}}>{a.name}</div>
              <div style={{fontSize:11.5, color:'var(--ink-3)', marginTop:2}}>{a.desc}</div>
            </div>
            <button style={{
              padding:'8px 16px', borderRadius:8, background: a.btnColor, color:'#fff',
              border:'none', cursor:'pointer', fontWeight:700, fontSize:12, fontFamily:'inherit',
            }}>{a.btn}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, {
  PagePlan, PageReconcile, PageUpload, PageDataLinks, PageProductCatalog, PageLogs, PageSettings, PageAdmin,
});
