/* global React */
/* eslint-disable */

// ── Utilities ──────────────────────────────────────────────────────────

const fmtVnd = (n) => {
  if (n == null) return '—';
  if (n >= 1e9) return (n/1e9).toFixed(2).replace(/\.?0+$/,'') + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'') + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(0) + 'K';
  return String(Math.round(n));
};
const fmtFull = (n) => {
  if (n == null) return '—';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n));
};
const fmtPct = (n, d=1) => (n==null?'—':n.toFixed(d)+'%');

const PLATFORM_COLORS = {
  shopee: '#FF5722',
  lazada: '#4F46E5',
  tiktok: '#FF2D6F',
};
const PLATFORM_COLORS_2 = {
  shopee: '#FF8A65',
  lazada: '#818CF8',
  tiktok: '#25F4EE',
};
const PLATFORM_NAME = { shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok Shop' };

// Build a smooth (Catmull-Rom → bezier) path
function smoothPath(points) {
  if (!points.length) return '';
  if (points.length < 3) return points.map((p,i)=>(i?'L':'M')+p[0]+','+p[1]).join(' ');
  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i-1] || points[i];
    const p1 = points[i];
    const p2 = points[i+1];
    const p3 = points[i+2] || p2;
    const cp1x = p1[0] + (p2[0]-p0[0])/6;
    const cp1y = p1[1] + (p2[1]-p0[1])/6;
    const cp2x = p2[0] - (p3[0]-p1[0])/6;
    const cp2y = p2[1] - (p3[1]-p1[1])/6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// useResize: returns ref + width
function useWidth() {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(600);
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      const cw = entries[0].contentRect.width;
      if (cw > 0) setW(cw);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ── Sparkline (KPI background) ─────────────────────────────────────────

function Sparkline({ data, color, fill = true, height = 50, strokeWidth = 2 }) {
  const [ref, w] = useWidth();
  if (!data || !data.length) return <div ref={ref} style={{width:'100%', height}} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pad = 2;
  const points = data.map((v, i) => [
    pad + (i / (data.length - 1)) * (w - pad*2),
    height - pad - ((v - min) / range) * (height - pad*2),
  ]);
  const path = smoothPath(points);
  const area = path + ` L ${points[points.length-1][0]},${height} L ${points[0][0]},${height} Z`;
  const gid = React.useId();
  return (
    <div ref={ref} style={{width:'100%', height}}>
      <svg width={w} height={height} style={{display:'block'}}>
        {fill && (
          <>
            <defs>
              <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.55" />
                <stop offset="100%" stopColor={color} stopOpacity="0.05" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gid})`} />
          </>
        )}
        <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ── Area Chart (multi-series with hover scrub) ─────────────────────────

function AreaChart({ series, labels, height = 260, mode = 'area', stacked = true, formatY = fmtVnd }) {
  // series: [{ key, name, color, data: [..] }]
  const [ref, w] = useWidth();
  const [hover, setHover] = React.useState(null);
  const ML = 48, MR = 14, MT = 16, MB = 28;
  const innerW = Math.max(1, w - ML - MR);
  const innerH = Math.max(1, height - MT - MB);
  const N = labels.length || 1;

  // For stacked: compute cumulative
  const stacks = series.map((s, idx) => {
    const cum = s.data.map((v, i) => v + (stacked ? series.slice(0, idx).reduce((a,b)=>a+b.data[i], 0) : 0));
    return { ...s, cum };
  });
  const maxVal = stacked
    ? Math.max(...labels.map((_, i) => series.reduce((a,b)=>a+b.data[i], 0)), 1)
    : Math.max(...series.flatMap(s => s.data), 1);

  const x = (i) => ML + (N === 1 ? innerW/2 : (i / (N - 1)) * innerW);
  const y = (v) => MT + innerH - (v / maxVal) * innerH;

  // Y axis ticks (5)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => t * maxVal);

  // Build paths
  const stackPaths = stacks.map((s, idx) => {
    const top = labels.map((_, i) => [x(i), y(s.cum[i])]);
    const bottomVals = stacked && idx > 0
      ? labels.map((_, i) => stacks[idx-1].cum[i])
      : labels.map(() => 0);
    const bottom = bottomVals.map((v, i) => [x(i), y(v)]).reverse();
    const linePath = smoothPath(top);
    const areaPath = linePath + ' L ' + bottom.map(p => p.join(',')).join(' L ') + ' Z';
    return { line: linePath, area: areaPath };
  });

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(N-1, Math.round(((px - ML) / innerW) * (N - 1))));
    setHover({ idx, x: x(idx) });
  };

  const gid = React.useId();
  return (
    <div ref={ref} style={{width:'100%', height, position:'relative'}} onMouseLeave={()=>setHover(null)}>
      <svg width={w} height={height} style={{display:'block', cursor:'crosshair'}}
           onMouseMove={handleMove}>
        <defs>
          {stacks.map((s,i) => (
            <linearGradient key={i} id={`${gid}-g${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.55" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.04" />
            </linearGradient>
          ))}
        </defs>

        {/* Grid */}
        {ticks.map((t,i) => (
          <g key={i}>
            <line x1={ML} x2={ML+innerW} y1={y(t)} y2={y(t)}
                  stroke="var(--line)" strokeDasharray="2 4" strokeWidth={1} />
            <text x={ML-8} y={y(t)+4} textAnchor="end"
                  fill="var(--ink-4)" fontSize="10.5" fontWeight="500">
              {formatY(t)}
            </text>
          </g>
        ))}

        {/* X labels: show ~6 evenly */}
        {labels.map((lab, i) => {
          const showCount = Math.min(N, 7);
          const stride = Math.max(1, Math.floor(N / showCount));
          if (i % stride !== 0 && i !== N-1) return null;
          return (
            <text key={i} x={x(i)} y={height-8} textAnchor="middle"
                  fill="var(--ink-4)" fontSize="10.5" fontWeight="500">
              {lab}
            </text>
          );
        })}

        {/* Areas */}
        {mode !== 'line' && stackPaths.map((p, i) => (
          <path key={`a${i}`} d={p.area} fill={`url(#${gid}-g${i})`} />
        ))}
        {/* Lines */}
        {stackPaths.map((p, i) => (
          <path key={`l${i}`} d={p.line}
                fill="none"
                stroke={stacks[i].color}
                strokeWidth={2.2}
                strokeLinejoin="round"
                strokeLinecap="round" />
        ))}

        {/* Hover scrub */}
        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={MT} y2={height-MB}
                  stroke="var(--ink-3)" strokeOpacity="0.35"
                  strokeDasharray="3 3" strokeWidth={1} />
            {stacks.map((s, i) => (
              <circle key={i} cx={hover.x} cy={y(s.cum[hover.idx])} r={5}
                      fill={s.color} stroke="var(--surface)" strokeWidth={2.5} />
            ))}
          </>
        )}
      </svg>

      {hover && (
        <div className="chart-tooltip" style={{
          left: Math.max(80, Math.min(w-80, hover.x)),
          top: 4
        }}>
          <div className="tt-date">{labels[hover.idx]}</div>
          {series.map(s => (
            <div className="tt-row" key={s.key}>
              <span className="tt-dot" style={{background:s.color}} />
              <span className="tt-key">{s.name}</span>
              <span className="tt-val">{formatY(s.data[hover.idx])}</span>
            </div>
          ))}
          {stacked && (
            <div className="tt-row" style={{marginTop:6, borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:5}}>
              <span className="tt-key" style={{fontWeight:700, opacity:1}}>Tổng</span>
              <span className="tt-val">{formatY(series.reduce((a,s)=>a+s.data[hover.idx], 0))}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bar Chart (vertical, multi-series option) ──────────────────────────

function BarChart({ series, labels, height = 260, stacked = false, formatY = fmtVnd }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = React.useState(null);
  const ML = 48, MR = 14, MT = 16, MB = 28;
  const innerW = Math.max(1, w - ML - MR);
  const innerH = Math.max(1, height - MT - MB);
  const N = labels.length || 1;
  const groupW = innerW / N;
  const barW = stacked || series.length === 1
    ? Math.min(groupW * 0.7, 28)
    : Math.min((groupW * 0.7) / series.length, 14);

  const maxVal = stacked
    ? Math.max(...labels.map((_, i) => series.reduce((a,b)=>a+b.data[i], 0)), 1)
    : Math.max(...series.flatMap(s => s.data), 1);
  const y = (v) => MT + innerH - (v / maxVal) * innerH;
  const ticks = [0, 0.5, 1].map(t => t * maxVal);

  return (
    <div ref={ref} style={{width:'100%', height, position:'relative'}} onMouseLeave={()=>setHover(null)}>
      <svg width={w} height={height} style={{display:'block'}}>
        {ticks.map((t,i) => (
          <g key={i}>
            <line x1={ML} x2={ML+innerW} y1={y(t)} y2={y(t)}
                  stroke="var(--line)" strokeDasharray="2 4" />
            <text x={ML-8} y={y(t)+4} textAnchor="end" fill="var(--ink-4)" fontSize="10.5" fontWeight="500">{formatY(t)}</text>
          </g>
        ))}
        {labels.map((lab, i) => {
          const gx = ML + i * groupW + groupW/2;
          return (
            <g key={i} onMouseEnter={()=>setHover({idx:i,x:gx})}>
              {/* hover bg */}
              <rect x={ML + i*groupW} y={MT} width={groupW} height={innerH}
                    fill={hover?.idx===i ? 'var(--surface-2)' : 'transparent'} />
              {stacked ? (() => {
                let acc = 0;
                return series.map((s, si) => {
                  const v = s.data[i];
                  const bh = (v / maxVal) * innerH;
                  const bx = gx - barW/2;
                  const by = MT + innerH - (acc + v) / maxVal * innerH;
                  acc += v;
                  return <rect key={si} x={bx} y={by} width={barW} height={bh}
                               fill={s.color} rx={si === series.length-1 ? 4 : 0} />;
                });
              })() : (
                series.map((s, si) => {
                  const v = s.data[i];
                  const bh = (v / maxVal) * innerH;
                  const bx = gx - (series.length*barW)/2 + si*barW;
                  return <rect key={si} x={bx} y={MT + innerH - bh} width={barW-1.5} height={bh}
                               fill={s.color} rx={3} />;
                })
              )}
              {(i % Math.max(1, Math.floor(N/7)) === 0 || i === N-1) && (
                <text x={gx} y={height-8} textAnchor="middle" fill="var(--ink-4)" fontSize="10.5" fontWeight="500">{lab}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="chart-tooltip" style={{ left: Math.max(80, Math.min(w-80, hover.x)), top:4 }}>
          <div className="tt-date">{labels[hover.idx]}</div>
          {series.map(s => (
            <div className="tt-row" key={s.key}>
              <span className="tt-dot" style={{background:s.color}} />
              <span className="tt-key">{s.name}</span>
              <span className="tt-val">{formatY(s.data[hover.idx])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Donut ──────────────────────────────────────────────────────────────

function Donut({ data, size = 180, thickness = 22, center }) {
  // data: [{ key, name, value, color }]
  const total = data.reduce((a,b) => a + b.value, 0) || 1;
  const r = size/2 - thickness/2 - 2;
  const cx = size/2, cy = size/2;
  let a0 = -Math.PI/2;
  const segs = data.map(s => {
    const angle = (s.value/total) * Math.PI * 2;
    const a1 = a0 + angle;
    const x0 = cx + r*Math.cos(a0), y0 = cy + r*Math.sin(a0);
    const x1 = cx + r*Math.cos(a1), y1 = cy + r*Math.sin(a1);
    const large = angle > Math.PI ? 1 : 0;
    const d = `M ${x0},${y0} A ${r},${r} 0 ${large} 1 ${x1},${y1}`;
    const seg = { d, color: s.color, pct: s.value/total, ...s };
    a0 = a1;
    return seg;
  });
  return (
    <div style={{ position:'relative', width:size, height:size }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        {segs.map((s,i) => (
          <path key={i} d={s.d} stroke={s.color} strokeWidth={thickness}
                fill="none" strokeLinecap="butt" />
        ))}
      </svg>
      <div style={{position:'absolute',inset:0,display:'grid',placeItems:'center',pointerEvents:'none',textAlign:'center'}}>
        {center}
      </div>
    </div>
  );
}

// ── Ranked horizontal bars (top products / cities) ────────────────────

function RankedBars({ items, valueKey = 'value', labelKey = 'name', subKey, format = fmtVnd, colors, maxItems = 10, accent }) {
  const list = items.slice(0, maxItems);
  const max = Math.max(...list.map(it => it[valueKey]), 1);
  return (
    <div style={{display:'flex', flexDirection:'column', gap:10}}>
      {list.map((it, i) => {
        const pct = (it[valueKey]/max) * 100;
        const color = colors?.[it.platform] || colors?.[i] || accent || 'var(--brand-1)';
        return (
          <div key={i} style={{display:'flex', alignItems:'center', gap:12}}>
            <div style={{
              width: 22, height: 22, borderRadius: 6,
              display:'grid', placeItems:'center',
              background: i < 3 ? color : 'var(--surface-3)',
              color: i < 3 ? '#fff' : 'var(--ink-3)',
              fontSize: 11, fontWeight: 800, flexShrink: 0,
            }}>{i+1}</div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{
                fontSize: 12.5, fontWeight: 600, color: 'var(--ink)',
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                marginBottom: 4,
              }}>{it[labelKey]}</div>
              <div style={{
                height: 6, borderRadius: 999,
                background: 'var(--surface-3)',
                overflow: 'hidden',
                position:'relative',
              }}>
                <div style={{
                  width: pct + '%',
                  height: '100%',
                  background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                  borderRadius: 999,
                  transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
                }} />
              </div>
            </div>
            <div style={{
              fontSize: 12.5, fontWeight: 700, fontVariantNumeric:'tabular-nums',
              minWidth: 70, textAlign: 'right',
            }}>{format(it[valueKey])}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Heatmap (7 × 24) ───────────────────────────────────────────────────

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function Heatmap({ data, height = 260 }) {
  // data: [{ weekday, hour, orders }]  weekday 0..6, hour 0..23
  const [ref, w] = useWidth();
  const [hover, setHover] = React.useState(null);
  const LP = 32, TP = 18, RP = 8, BP = 22;
  const cellW = Math.max(8, (w - LP - RP) / 24);
  const cellH = Math.max(14, (height - TP - BP) / 7);
  const totalH = TP + cellH * 7 + BP;

  const max = Math.max(...data.map(d => d.orders), 1);
  // Build map
  const grid = {};
  for (const d of data) grid[`${d.weekday}-${d.hour}`] = d.orders;

  // Color scale
  const colorAt = (v) => {
    if (!v) return 'var(--surface-3)';
    const t = Math.max(0.06, v / max);
    return `color-mix(in oklab, var(--brand-1) ${Math.round(t*100)}%, var(--surface-3))`;
  };

  return (
    <div ref={ref} style={{width:'100%', height: totalH, position:'relative'}}
         onMouseLeave={()=>setHover(null)}>
      <svg width={w} height={totalH} style={{display:'block'}}>
        {/* Weekday labels */}
        {WEEKDAYS.map((d, i) => (
          <text key={d} x={LP-8} y={TP + cellH*i + cellH/2 + 3.5} textAnchor="end"
                fill="var(--ink-3)" fontSize="11" fontWeight="600">{d}</text>
        ))}
        {/* Hour labels */}
        {Array.from({length:24}).map((_, h) => {
          if (h % 3 !== 0) return null;
          return (
            <text key={h} x={LP + cellW*h + cellW/2} y={TP - 6} textAnchor="middle"
                  fill="var(--ink-3)" fontSize="10" fontWeight="600">{String(h).padStart(2,'0')}h</text>
          );
        })}
        {/* Cells */}
        {Array.from({length:7}).map((_, wd) =>
          Array.from({length:24}).map((_, h) => {
            const v = grid[`${wd}-${h}`] || 0;
            return (
              <rect key={`${wd}-${h}`}
                    x={LP + cellW*h + 1.5}
                    y={TP + cellH*wd + 1.5}
                    width={cellW-3} height={cellH-3}
                    rx={3.5}
                    fill={colorAt(v)}
                    style={{cursor:'pointer', transition:'opacity 0.15s'}}
                    opacity={hover && (hover.wd !== wd || hover.h !== h) ? 0.55 : 1}
                    onMouseEnter={()=>setHover({wd, h, v, x: LP + cellW*h + cellW/2, y: TP + cellH*wd})} />
            );
          })
        )}
      </svg>

      {hover && (
        <div className="chart-tooltip" style={{
          left: Math.max(70, Math.min(w-70, hover.x)),
          top: hover.y - 10,
        }}>
          <div className="tt-date">{WEEKDAYS[hover.wd]} · {String(hover.h).padStart(2,'0')}:00</div>
          <div className="tt-row">
            <span className="tt-dot" style={{background:'var(--brand-1)'}} />
            <span className="tt-key">Đơn hàng</span>
            <span className="tt-val">{hover.v}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Radar chart (3 platforms) ──────────────────────────────────────────

function Radar({ series, axes, size = 280, max }) {
  // series: [{name,color,values:[..]}]
  // axes: [{ name, max? }]
  const cx = size/2, cy = size/2 + 6;
  const r = size/2 - 26;
  const N = axes.length;
  const angle = (i) => -Math.PI/2 + (i / N) * Math.PI * 2;
  const point = (i, v, mx) => {
    const rr = (v/(mx||1)) * r;
    return [cx + rr*Math.cos(angle(i)), cy + rr*Math.sin(angle(i))];
  };
  const maxes = axes.map((a, i) => a.max || max || Math.max(...series.flatMap(s => s.values[i]||0), 1));

  return (
    <svg width={size} height={size} style={{display:'block', overflow:'visible'}}>
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((t, idx) => {
        const pts = axes.map((_, i) => {
          const x = cx + (r*t)*Math.cos(angle(i));
          const y = cy + (r*t)*Math.sin(angle(i));
          return `${x},${y}`;
        }).join(' ');
        return <polygon key={t} points={pts} fill="none"
                       stroke="var(--line)" strokeWidth="1"
                       strokeDasharray={idx === 3 ? '0' : '3 3'} />;
      })}
      {/* Spokes */}
      {axes.map((_, i) => {
        const [x, y] = [cx + r*Math.cos(angle(i)), cy + r*Math.sin(angle(i))];
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" />;
      })}
      {/* Axis labels */}
      {axes.map((a, i) => {
        const lx = cx + (r+14)*Math.cos(angle(i));
        const ly = cy + (r+14)*Math.sin(angle(i));
        let anchor = 'middle';
        if (lx < cx - 5) anchor = 'end';
        else if (lx > cx + 5) anchor = 'start';
        return (
          <text key={i} x={lx} y={ly+4} textAnchor={anchor}
                fontSize="11" fill="var(--ink-2)" fontWeight="600">{a.name}</text>
        );
      })}
      {/* Series */}
      {series.map((s, si) => {
        const pts = s.values.map((v, i) => point(i, v, maxes[i]));
        const d = pts.map((p,i)=>(i?'L':'M')+p[0]+','+p[1]).join(' ') + ' Z';
        return (
          <g key={si}>
            <path d={d} fill={s.color} fillOpacity="0.18" stroke={s.color} strokeWidth="2" />
            {pts.map((p,i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill={s.color} stroke="var(--surface)" strokeWidth="1.5" />)}
          </g>
        );
      })}
    </svg>
  );
}

// ── Half dial gauge ────────────────────────────────────────────────────

function Dial({ value, max = 100, label, color, size = 160, format = (v) => v + '%' }) {
  const pct = Math.max(0, Math.min(1, value/max));
  const cx = size/2, cy = size*0.7;
  const r = size*0.42;
  const a0 = Math.PI, a1 = 0;
  const ac = a0 + (a1-a0) * pct;
  const arc = (a) => [cx + r*Math.cos(a), cy + r*Math.sin(a)];
  const start = arc(a0), endTrack = arc(a1), endVal = arc(ac);
  return (
    <div style={{position:'relative', width:size, height:size*0.78}}>
      <svg width={size} height={size*0.78}>
        <path d={`M ${start[0]},${start[1]} A ${r},${r} 0 0 1 ${endTrack[0]},${endTrack[1]}`}
              fill="none" stroke="var(--surface-3)" strokeWidth="14" strokeLinecap="round" />
        <path d={`M ${start[0]},${start[1]} A ${r},${r} 0 0 1 ${endVal[0]},${endVal[1]}`}
              fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
      </svg>
      <div style={{
        position:'absolute', inset:0, display:'flex',
        flexDirection:'column', alignItems:'center', justifyContent:'flex-end',
        paddingBottom: 4, textAlign:'center',
      }}>
        <div style={{fontSize:24, fontWeight:800, letterSpacing:'-0.02em'}}>{format(value)}</div>
        <div style={{fontSize:11, color:'var(--ink-3)', fontWeight:600}}>{label}</div>
      </div>
    </div>
  );
}

// ── Mini bars (column sparkline) ───────────────────────────────────────

function MiniBars({ data, color, height = 40, gap = 1.2 }) {
  const [ref, w] = useWidth();
  if (!data.length) return <div ref={ref} style={{width:'100%', height}} />;
  const max = Math.max(...data, 1);
  const bw = (w - gap*(data.length-1)) / data.length;
  return (
    <div ref={ref} style={{width:'100%', height}}>
      <svg width={w} height={height} style={{display:'block'}}>
        {data.map((v,i) => {
          const h = (v/max) * height * 0.92;
          return <rect key={i} x={i*(bw+gap)} y={height-h} width={bw} height={h}
                       fill={color} opacity={0.55 + 0.45*(v/max)} rx={1.5} />;
        })}
      </svg>
    </div>
  );
}

// ── Stacked horizontal bar (market share) ──────────────────────────────

function StackBar({ segments, height = 12 }) {
  const total = segments.reduce((a,b)=>a+b.value, 0) || 1;
  return (
    <div className="stack-bar" style={{height}}>
      {segments.map((s,i) => (
        <div key={i} className="seg" style={{
          width: (s.value/total*100) + '%',
          background: s.color,
        }} title={`${s.name}: ${(s.value/total*100).toFixed(1)}%`} />
      ))}
    </div>
  );
}

// Expose globally
Object.assign(window, {
  fmtVnd, fmtFull, fmtPct,
  PLATFORM_COLORS, PLATFORM_COLORS_2, PLATFORM_NAME,
  Sparkline, AreaChart, BarChart, Donut, RankedBars, Heatmap, Radar, Dial, MiniBars, StackBar,
});
