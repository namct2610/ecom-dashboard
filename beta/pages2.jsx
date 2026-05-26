/* global React, fmtVnd, fmtFull, fmtPct, PLATFORM_COLORS, PLATFORM_NAME, KPI, I, Sparkline, AreaChart, BarChart, Donut, RankedBars */

// ── Page: KẾ HOẠCH (Sales Target) ───────────────────────────────────────

function PagePlan({ data }) {
  // Year target (mocked, realistic scale)
  const yearTarget = 3_200_000_000; // 3.2B VND
  const monthsCompleted = 3;
  const ytdActual = data.summary.total_revenue * 2.6 + data.summary.total_revenue; // mock cumulative
  const achievement = (ytdActual / yearTarget) * 100;
  const runRateNeeded = (yearTarget - ytdActual) / (12 - monthsCompleted);
  const onTrack = ytdActual >= (yearTarget / 12) * monthsCompleted * 0.95;

  // Build 12-month series (target line vs actual)
  const months = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
  const targetCum = months.map((_, i) => (yearTarget / 12) * (i+1));
  const actualCum = months.map((_, i) => {
    if (i < monthsCompleted) {
      return ytdActual * ((i+1)/monthsCompleted);
    }
    return null;
  });
  const forecastCum = months.map((_, i) => {
    if (i < monthsCompleted) return null;
    return ytdActual + runRateNeeded * (i+1 - monthsCompleted);
  });

  const platforms = ['shopee','lazada','tiktok'];
  const platformTargets = {
    shopee: { target: 2_800_000_000, actual: data.summary.shopee.revenue * 2.7 + data.summary.shopee.revenue },
    lazada: { target: 240_000_000, actual: data.summary.lazada.revenue * 2.3 + data.summary.lazada.revenue },
    tiktok: { target: 160_000_000, actual: data.summary.tiktok.revenue * 2.1 + data.summary.tiktok.revenue },
  };

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>

      {/* Hero progress card */}
      <div className="row row-hero">
        <div className="kpi-hero" style={{minHeight: 260}}>
          <div className="kpi-hero-top">
            <div>
              <div className="kpi-hero-label">Mục tiêu năm 2026</div>
              <div style={{fontSize:11.5, opacity:0.7, marginTop:4, fontWeight:600}}>
                Tiến độ YTD · {monthsCompleted}/12 tháng
              </div>
            </div>
            <span className={onTrack ? 'delta delta-up' : 'delta delta-down'}>
              {onTrack ? '↑ Đúng tiến độ' : '↓ Chậm tiến độ'}
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
                <span>Tiến độ đạt mục tiêu</span>
                <span>Còn {fmtVnd(yearTarget - ytdActual)}₫</span>
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
                  left: ((monthsCompleted/12)*100)+'%',
                  width: 2, background: 'rgba(255,255,255,0.95)',
                  boxShadow:'0 0 8px rgba(255,255,255,0.6)',
                }} />
              </div>
              <div style={{display:'flex', gap:14, marginTop:10, fontSize:11.5, fontWeight:600}}>
                <span style={{display:'flex', alignItems:'center', gap:6}}>
                  <span style={{width:8, height:8, borderRadius:2, background:'#fff'}}/>
                  Đã đạt
                </span>
                <span style={{display:'flex', alignItems:'center', gap:6, opacity:0.8}}>
                  <span style={{width:2, height:10, background:'#fff'}}/>
                  Mốc {monthsCompleted}/12 tháng ({((monthsCompleted/12)*100).toFixed(0)}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: quick KPIs */}
        <div style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>
          <div className="card" style={{padding: 18}}>
            <div style={{fontSize:11.5, color:'var(--ink-3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em'}}>Run-rate cần đạt</div>
            <div style={{fontSize:28, fontWeight:800, marginTop:6, letterSpacing:'-0.02em'}}>{fmtVnd(runRateNeeded)}₫</div>
            <div style={{fontSize:12, color:'var(--ink-3)', marginTop:4}}>mỗi tháng còn lại · {12-monthsCompleted} tháng</div>
          </div>
          <div className="card" style={{padding: 18}}>
            <div style={{fontSize:11.5, color:'var(--ink-3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em'}}>Tháng hiện tại</div>
            <div style={{fontSize:28, fontWeight:800, marginTop:6, letterSpacing:'-0.02em'}}>{fmtVnd(data.summary.total_revenue)}₫</div>
            <div style={{fontSize:12, color:'var(--green)', marginTop:4, fontWeight:600}}>↑ vượt 24.3% target tháng</div>
          </div>
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

      {/* Per-platform target */}
      <div className="card card-lg">
        <div className="card-head">
          <div>
            <h3>Mục tiêu theo từng sàn</h3>
            <div className="sub">Phân bổ và tiến độ thực hiện</div>
          </div>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:18}}>
          {platforms.map(p => {
            const t = platformTargets[p];
            const pct = Math.min(100, t.actual/t.target*100);
            const color = PLATFORM_COLORS[p];
            return (
              <div key={p}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:8}}>
                  <div style={{display:'flex', alignItems:'center', gap:12}}>
                    <div className={`plat-tile plat-${p}`} style={{padding:0, background:'transparent', border:'none'}}>
                      <div className="logo" style={{width:32, height:32, fontSize:13}}>
                        {p==='shopee'?'S':p==='lazada'?'L':'T'}
                      </div>
                    </div>
                    <div>
                      <div style={{fontWeight:700, fontSize:14}}>{PLATFORM_NAME[p]}</div>
                      <div style={{fontSize:11.5, color:'var(--ink-3)'}}>
                        {fmtVnd(t.actual)}₫ / {fmtVnd(t.target)}₫
                      </div>
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:22, fontWeight:800, color, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em'}}>{pct.toFixed(1)}%</div>
                    <div style={{fontSize:11, color:'var(--ink-3)', fontWeight:600}}>đạt mục tiêu</div>
                  </div>
                </div>
                <div style={{height:10, borderRadius:99, background:'var(--surface-3)', overflow:'hidden', position:'relative'}}>
                  <div style={{
                    height:'100%', width: pct+'%',
                    background: `linear-gradient(90deg, ${color}, ${color}99)`,
                    borderRadius:99, transition: 'width 0.8s',
                  }}/>
                  <div style={{
                    position:'absolute', top:-3, bottom:-3,
                    left: ((monthsCompleted/12)*100)+'%',
                    width:2, background:'var(--ink)', opacity:0.6,
                  }}/>
                </div>
              </div>
            );
          })}
        </div>
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
  const maxV = Math.max(...target, ...actual.filter(v=>v!=null), ...forecast.filter(v=>v!=null)) * 1.05;
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
        <KPI label="Đã khớp" value={fmtFull(matched)} sub={fmtPct(matched/totalOrders*100)} accent="green" icon={I.check}/>
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

function UploadZone({ label, accent, accept = '.xlsx,.xls,.csv' }) {
  const [drag, setDrag] = React.useState(false);
  const [file, setFile] = React.useState(null);
  return (
    <div
      onDragOver={(e)=>{e.preventDefault(); setDrag(true);}}
      onDragLeave={()=>setDrag(false)}
      onDrop={(e)=>{e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if(f) setFile(f);}}
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
             onChange={(e)=>{const f = e.target.files[0]; if(f) setFile(f);}}
             onClick={(e)=>e.stopPropagation()}/>
    </div>
  );
}

// ── Page: UPLOAD ───────────────────────────────────────────────────────

function PageUpload({ data }) {
  const platforms = [
    { id: 'shopee', name: 'Shopee', color: PLATFORM_COLORS.shopee, count: 1199, last: '31/03/2026 14:30', file: 'Data_Order_Shopee_T03.xlsx' },
    { id: 'lazada', name: 'Lazada', color: PLATFORM_COLORS.lazada, count: 7, last: '31/03/2026 14:28', file: 'Data_Order_Lazada_T03.xlsx' },
    { id: 'tiktok', name: 'TikTok Shop', color: PLATFORM_COLORS.tiktok, count: 14, last: '31/03/2026 14:25', file: 'Data_Order_TikTok_T03.xlsx' },
  ];

  const history = [
    { id:1, file: 'Data_Order_Shopee_T03.xlsx', platform: 'shopee', rows: 1199, status: 'success', time: '31/03/2026 14:30', user: 'admin' },
    { id:2, file: 'Data_Order_Lazada_T03.xlsx', platform: 'lazada', rows: 7, status: 'success', time: '31/03/2026 14:28', user: 'admin' },
    { id:3, file: 'Data_Order_TikTok_T03.xlsx', platform: 'tiktok', rows: 14, status: 'success', time: '31/03/2026 14:25', user: 'admin' },
    { id:4, file: 'Data_Traffic_Shopee_T03.xlsx', platform: 'shopee', rows: 31, status: 'success', time: '31/03/2026 09:12', user: 'admin' },
    { id:5, file: 'Data_Order_Shopee_T02.xlsx', platform: 'shopee', rows: 1078, status: 'success', time: '01/03/2026 11:05', user: 'staff_01' },
    { id:6, file: 'Data_Order_TikTok_T02.xlsx', platform: 'tiktok', rows: 8, status: 'warning', time: '01/03/2026 10:55', user: 'admin' },
    { id:7, file: 'Data_Order_Lazada_T02.xlsx', platform: 'lazada', rows: 0, status: 'error', time: '01/03/2026 10:52', user: 'staff_01' },
  ];

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>

      <div className="row row-3">
        {platforms.map(p => (
          <div key={p.id} className="card card-lg" style={{borderTop:`4px solid ${p.color}`}}>
            <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:14}}>
              <div className={`plat-tile plat-${p.id}`} style={{padding:0, background:'transparent', border:'none'}}>
                <div className="logo" style={{width:42, height:42, fontSize:16}}>{p.id==='shopee'?'S':p.id==='lazada'?'L':'T'}</div>
              </div>
              <div>
                <div style={{fontSize:15, fontWeight:800}}>{p.name}</div>
                <div style={{fontSize:11.5, color:'var(--ink-3)'}}>Đơn hàng tháng 03/2026</div>
              </div>
            </div>
            <UploadZone label={`Tải đơn hàng ${p.name}`} accent={p.color}/>
            <div style={{marginTop:12, padding:'10px 12px', background:'var(--surface-2)', borderRadius:10, display:'flex', justifyContent:'space-between', fontSize:11.5}}>
              <div>
                <div style={{color:'var(--ink-3)', fontWeight:600}}>Lần cuối</div>
                <div className="mono" style={{color:'var(--ink-2)', marginTop:2, fontSize:11}}>{p.last}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{color:'var(--ink-3)', fontWeight:600}}>Số đơn</div>
                <div style={{fontWeight:800, marginTop:2, fontSize:14}}>{fmtFull(p.count)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card card-lg card-flush">
        <div style={{padding:'20px 22px 14px', display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
          <div>
            <h3>Lịch sử tải lên</h3>
            <div className="sub" style={{fontSize:11.5, color:'var(--ink-3)', marginTop:2}}>20 lần tải gần đây</div>
          </div>
          <div style={{display:'flex', gap:8}}>
            <button className="chip" style={{padding:'6px 12px', fontSize:11.5}}>Lọc theo sàn</button>
            <button className="chip" style={{padding:'6px 12px', fontSize:11.5}}>Xuất CSV</button>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Tên file</th>
              <th>Sàn</th>
              <th className="num">Số dòng</th>
              <th>Trạng thái</th>
              <th>Người tải</th>
              <th>Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {history.map(h => (
              <tr key={h.id}>
                <td style={{fontWeight:600, fontSize:12.5}}>{h.file}</td>
                <td><span className={`platform-tag ${h.platform}`}>{PLATFORM_NAME[h.platform]}</span></td>
                <td className="num">{fmtFull(h.rows)}</td>
                <td>
                  {h.status === 'success' && <span className="status status-done">Thành công</span>}
                  {h.status === 'warning' && <span className="status status-pending">Cảnh báo</span>}
                  {h.status === 'error' && <span className="status status-cancel">Thất bại</span>}
                </td>
                <td style={{fontSize:12, color:'var(--ink-2)'}}>@{h.user}</td>
                <td className="mono" style={{fontSize:11, color:'var(--ink-3)'}}>{h.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
        </div>

        {tab === 'profile' && <SettingsProfile/>}
        {tab === 'password' && <SettingsPassword/>}
        {tab === 'language' && <SettingsLanguage/>}
        {tab === 'notifications' && <SettingsNotifications/>}
        {tab === 'brand' && <SettingsBrand/>}
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

// ── Page: ORDER DETAIL ─────────────────────────────────────────────────

function PageOrderList({ data }) {
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const orders = data.recent_orders.slice(0, 50);
  const filtered = orders.filter(o => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'done' && o.status !== 'Hoàn thành') return false;
      if (statusFilter === 'cancel' && o.status !== 'Đã huỷ') return false;
    }
    if (search && !o.order_id.toLowerCase().includes(search.toLowerCase()) &&
        !o.product_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="card card-lg card-flush">
      <div style={{padding:'20px 22px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap'}}>
        <div>
          <h3>Danh sách đơn hàng chi tiết</h3>
          <div className="sub" style={{fontSize:11.5, color:'var(--ink-3)', marginTop:2}}>{filtered.length} / {orders.length} đơn</div>
        </div>
        <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm mã đơn / sản phẩm…"
                 style={{padding:'8px 12px', fontSize:12, borderRadius:8, border:'1px solid var(--line)', background:'var(--surface-2)', color:'var(--ink)', width: 220, fontFamily:'inherit', outline:'none'}}/>
          <div className="tabs">
            <button className={'tab '+(statusFilter==='all'?'active':'')} onClick={()=>setStatusFilter('all')}>Tất cả</button>
            <button className={'tab '+(statusFilter==='done'?'active':'')} onClick={()=>setStatusFilter('done')}>Hoàn thành</button>
            <button className={'tab '+(statusFilter==='cancel'?'active':'')} onClick={()=>setStatusFilter('cancel')}>Đã huỷ</button>
          </div>
        </div>
      </div>
      <div style={{maxHeight:600, overflowY:'auto'}}>
        <table className="table">
          <thead style={{position:'sticky', top:0}}>
            <tr>
              <th>Mã đơn</th>
              <th>Sàn</th>
              <th>Sản phẩm</th>
              <th>Khu vực</th>
              <th>Trạng thái</th>
              <th>Ngày đặt</th>
              <th className="num">Giá trị</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o,i) => (
              <tr key={i}>
                <td className="mono" style={{fontWeight:600, fontSize:11.5}}>{o.order_id}</td>
                <td><span className={`platform-tag ${o.platform}`}>{PLATFORM_NAME[o.platform]}</span></td>
                <td style={{maxWidth:280, fontSize:12, fontWeight:500}}>
                  <div style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{o.product_name}</div>
                </td>
                <td style={{fontSize:12, color:'var(--ink-2)'}}>{o.city}</td>
                <td>
                  <span className={'status '+(o.status === 'Hoàn thành' ? 'status-done' : 'status-cancel')}>
                    {o.status}
                  </span>
                </td>
                <td className="mono" style={{fontSize:11, color:'var(--ink-3)'}}>{o.order_date}</td>
                <td className="num">{fmtFull(o.order_amount)}₫</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

Object.assign(window, {
  PagePlan, PageReconcile, PageUpload, PageLogs, PageSettings, PageAdmin, PageOrderList,
});
