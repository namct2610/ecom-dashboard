/* global React, Sparkline, AreaChart, BarChart, Donut, RankedBars, Heatmap, Radar, Dial, MiniBars, StackBar, fmtVnd, fmtFull, fmtPct, PLATFORM_COLORS, PLATFORM_COLORS_2, PLATFORM_NAME */

// ── Data helpers ───────────────────────────────────────────────────────

function getDayLabels(series) {
  return series.map(d => {
    const day = d.date.slice(-2);
    return day;
  });
}

function buildPlatformSeries(series, kind) {
  // kind: 'shopee'|'lazada'|'tiktok' field prefix or empty for revenue
  return ['shopee','lazada','tiktok'].map(p => ({
    key: p,
    name: PLATFORM_NAME[p],
    color: PLATFORM_COLORS[p],
    data: series.map(d => kind === 'orders' ? d['orders_'+p] : d[p]),
  }));
}

function fakeDeltaFor(value, seed) {
  // Reproducible "previous period" delta for demo
  const sign = Math.sin(seed*1.7) > 0 ? 1 : -1;
  const mag = 4 + Math.abs(Math.sin(seed*3.7)) * 22;
  return sign * mag;
}

// ── Page header ────────────────────────────────────────────────────────

function PageHeader({ title, sub, right }) {
  return (
    <div className="section-h">
      <div>
        <h2>{title}</h2>
        <div className="lede">{sub}</div>
      </div>
      {right}
    </div>
  );
}

// ── KPI card (standard) ────────────────────────────────────────────────

function KPI({ label, value, delta, sub, accent='brand', spark, sparkColor, format = fmtFull, icon }) {
  return (
    <div className={`kpi kpi-accent-${accent}`}>
      <div className="kpi-label">
        <span>{label}</span>
        {icon && <span className="kpi-ico">{icon}</span>}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot">
        {delta != null && (
          <span className={delta > 0 ? 'delta delta-up' : delta < 0 ? 'delta delta-down' : 'delta delta-flat'}>
            {delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {sub && <span>{sub}</span>}
      </div>
      {spark && (
        <div className="kpi-spark">
          <Sparkline data={spark} color={sparkColor || 'var(--brand-1)'} height={50} />
        </div>
      )}
    </div>
  );
}

// Icons
const I = {
  money: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  cart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  eye: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  pkg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  pin: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  trend: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  pct: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
};

// ── Page: OVERVIEW ─────────────────────────────────────────────────────

function PageOverview({ data, mode }) {
  const s = data.summary;
  const [trendMetric, setTrendMetric] = React.useState('revenue'); // revenue|orders|aov
  const [topMetric, setTopMetric] = React.useState('revenue');     // revenue|qty
  const dates = data.revenue_series.map(d => d.date);
  const dayLabels = getDayLabels(data.revenue_series);
  const totalSeries = data.revenue_series.map(d => d.total);
  const ordersSeries = data.revenue_series.map(d => d.orders_total);

  // Trend series theo metric đang chọn
  const platformSeries = trendMetric === 'orders'
    ? buildPlatformSeries(data.revenue_series, 'orders')
    : trendMetric === 'aov'
      ? [{ key:'aov', name:'AOV', color: PLATFORM_COLORS.shopee,
           data: data.revenue_series.map(d => (d.orders_total>0 ? Math.round(d.total/d.orders_total) : 0)) }]
      : buildPlatformSeries(data.revenue_series);
  const trendStacked = trendMetric !== 'aov';
  const trendSub = trendMetric === 'orders' ? 'Số đơn theo ngày · 3 sàn'
    : trendMetric === 'aov' ? 'Giá trị đơn trung bình theo ngày'
    : (data.period_label || 'Kỳ hiện tại') + ' · Phân theo 3 sàn';

  const topItems = topMetric === 'qty' ? data.top_products_qty : data.top_products_rev;

  const platformShare = [
    { key: 'shopee', name: 'Shopee', value: s.shopee.revenue, color: PLATFORM_COLORS.shopee },
    { key: 'lazada', name: 'Lazada', value: s.lazada.revenue, color: PLATFORM_COLORS.lazada },
    { key: 'tiktok', name: 'TikTok', value: s.tiktok.revenue, color: PLATFORM_COLORS.tiktok },
  ];

  const aov = Math.round(s.total_revenue / s.completed_orders);
  const conversion = (s.total_orders / s.total_visitors) * 100;

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>

      {/* ─── HERO ROW ─── */}
      <div className="row row-hero">

        {/* Big revenue card with embedded area chart */}
        <div className="kpi-hero">
          <div className="kpi-hero-top">
            <div>
              <div className="kpi-hero-label">Doanh thu tháng 03/2026</div>
              <div style={{fontSize:11, opacity:0.7, marginTop:4, fontWeight:600}}>
                Đã hoàn thành · 3 sàn thương mại điện tử
              </div>
            </div>
            <span className="delta delta-up">↑ 18.4%</span>
          </div>

          <div className="kpi-hero-value">{fmtFull(s.total_revenue)} <span style={{fontSize:'0.4em', opacity:0.7, fontWeight:600}}>₫</span></div>

          <div className="kpi-hero-sub">
            <span>≈ {fmtVnd(aov)}₫ / đơn TB</span>
            <span style={{opacity:0.5}}>·</span>
            <span>{fmtFull(s.completed_orders)} đơn hoàn thành</span>
          </div>

          {/* Market share stacked bar */}
          <div className="kpi-hero-foot">
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:11, fontWeight:600, marginBottom:6, opacity:0.85}}>
                <span>Phân chia theo sàn</span>
                <span>{fmtFull(s.total_revenue/1e6)}M ₫</span>
              </div>
              <div style={{display:'flex', height:8, borderRadius:99, overflow:'hidden', background:'rgba(255,255,255,0.15)'}}>
                {platformShare.map((p,i) => (
                  <div key={i} style={{
                    width: (p.value/s.total_revenue*100)+'%',
                    background: p.color,
                    transition: 'width 0.8s',
                  }} title={`${p.name}: ${(p.value/s.total_revenue*100).toFixed(1)}%`} />
                ))}
              </div>
              <div style={{display:'flex', gap:14, marginTop:10, fontSize:11.5, fontWeight:600}}>
                {platformShare.map(p => (
                  <span key={p.key} style={{display:'flex', alignItems:'center', gap:6}}>
                    <span style={{width:8, height:8, borderRadius:2, background:p.color}}/>
                    {p.name} · {(p.value/s.total_revenue*100).toFixed(1)}%
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Background area chart */}
          <div className="trend-mini">
            <Sparkline data={totalSeries} color="#fff" height={100} strokeWidth={2.5} fill={true} />
          </div>
        </div>

        {/* Right side stack: 3 platform tiles + visitors mini */}
        <div style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>
          <div className="card" style={{padding:18, paddingBottom: 14}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
              <h3>Hiệu suất từng sàn</h3>
              <span className="muted" style={{fontSize:11}}>Doanh thu tháng</span>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:14}}>
              {['shopee','lazada','tiktok'].map(p => {
                const sp = s[p];
                const share = (sp.revenue/s.total_revenue*100);
                return (
                  <div key={p} className={`plat-tile plat-${p}`}>
                    <div className="logo">{p === 'shopee' ? 'S' : p === 'lazada' ? 'L' : 'T'}</div>
                    <div className="info">
                      <div className="name">{PLATFORM_NAME[p]}</div>
                      <div className="meta">{fmtFull(sp.orders)} đơn · {share.toFixed(1)}% thị phần</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div className="val">{fmtVnd(sp.revenue)}₫</div>
                      <div style={{fontSize:11, color: 'var(--green)', fontWeight:700}}>
                        ↑ {(8 + Math.random()*15).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ─── KPI row ─── */}
      <div className="row row-4">
        <KPI label="Tổng đơn hàng"
             value={fmtFull(s.total_orders)}
             delta={12.3}
             sub="so với tháng trước"
             accent="brand"
             icon={I.cart}
             spark={ordersSeries}
             sparkColor="var(--brand-1)" />
        <KPI label="Đơn hoàn thành"
             value={fmtFull(s.completed_orders)}
             delta={9.7}
             sub={`${((s.completed_orders/s.total_orders)*100).toFixed(1)}% trên tổng`}
             accent="green"
             icon={I.check}
             spark={data.revenue_series.map(d => Math.round((d.orders_total||0)*0.85))}
             sparkColor="var(--green)" />
        <KPI label="Tỷ lệ huỷ đơn"
             value={fmtPct(s.cancel_rate)}
             delta={-2.1}
             sub={`${s.cancelled_orders} đơn bị huỷ`}
             accent="red"
             icon={I.x}
             spark={[14, 12, 16, 11, 15, 13, 9, 12]}
             sparkColor="var(--red)" />
        <KPI label="Lượt truy cập"
             value={fmtFull(s.total_visitors)}
             delta={6.8}
             sub={`${fmtFull(s.total_page_views)} lượt xem`}
             accent="amber"
             icon={I.eye}
             spark={data.traffic.filter(t=>t.platform==='shopee'||t.platform==='lazada').reduce((acc,t)=>{
               const day = parseInt(t.date.slice(-2));
               acc[day-1] = (acc[day-1]||0) + t.visitors;
               return acc;
             }, [])}
             sparkColor="var(--amber)" />
      </div>

      {/* ─── Revenue trend BIG ─── */}
      <div className="row row-3-1">
        <div className="card card-lg">
          <div className="card-head">
            <div>
              <h3>Doanh thu theo thời gian</h3>
              <div className="sub">{trendSub}</div>
            </div>
            <div className="tabs">
              <button className={trendMetric==='revenue' ? 'tab active' : 'tab'} onClick={()=>setTrendMetric('revenue')}>Doanh thu</button>
              <button className={trendMetric==='orders' ? 'tab active' : 'tab'} onClick={()=>setTrendMetric('orders')}>Đơn hàng</button>
              <button className={trendMetric==='aov' ? 'tab active' : 'tab'} onClick={()=>setTrendMetric('aov')}>AOV</button>
            </div>
          </div>
          <AreaChart series={platformSeries} labels={dayLabels} mode={mode} stacked={trendStacked} height={280} />
          <div className="legend" style={{marginTop:12, justifyContent:'center'}}>
            {platformSeries.map(p => (
              <div key={p.key} className="legend-item">
                <span className="legend-swatch" style={{background:p.color}}/>
                {p.name} · {trendMetric==='orders' ? fmtFull(p.data.reduce((a,b)=>a+b,0))+' đơn' : fmtVnd(p.data.reduce((a,b)=>a+b,0))+'₫'}
              </div>
            ))}
          </div>
        </div>

        <div className="card card-lg" style={{display:'flex', flexDirection:'column'}}>
          <div className="card-head">
            <div>
              <h3>Thị phần doanh thu</h3>
              <div className="sub">3 sàn TMĐT</div>
            </div>
          </div>
          <div style={{display:'flex', justifyContent:'center', padding: '8px 0 4px'}}>
            <Donut data={platformShare} size={200} thickness={28}
              center={
                <div>
                  <div style={{fontSize: 11, color:'var(--ink-3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em'}}>Tổng</div>
                  <div style={{fontSize: 22, fontWeight: 800, letterSpacing:'-0.02em', marginTop: 2}}>{fmtVnd(s.total_revenue)}₫</div>
                </div>
              } />
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:12}}>
            {platformShare.map(p => (
              <div key={p.key} style={{display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:10, background:'var(--surface-2)'}}>
                <span style={{width:10, height:10, borderRadius:3, background:p.color}}/>
                <span style={{fontSize:12.5, fontWeight:600, flex:1}}>{p.name}</span>
                <span style={{fontSize:11, color:'var(--ink-3)'}}>{(p.value/s.total_revenue*100).toFixed(1)}%</span>
                <span style={{fontSize:12.5, fontWeight:700, fontVariantNumeric:'tabular-nums', minWidth:64, textAlign:'right'}}>
                  {fmtVnd(p.value)}₫
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Top products + recent orders ─── */}
      <div className="row row-2">
        <div className="card card-lg">
          <div className="card-head">
            <div>
              <h3>Top 10 sản phẩm bán chạy</h3>
              <div className="sub">{topMetric==='qty' ? 'Theo số lượng bán' : 'Theo doanh thu'}</div>
            </div>
            <div className="tabs">
              <button className={topMetric==='revenue'?'tab active':'tab'} onClick={()=>setTopMetric('revenue')}>Doanh thu</button>
              <button className={topMetric==='qty'?'tab active':'tab'} onClick={()=>setTopMetric('qty')}>Số lượng</button>
            </div>
          </div>
          <RankedBars
            items={topItems}
            valueKey={topMetric==='qty' ? 'qty' : 'revenue'}
            labelKey="name"
            colors={PLATFORM_COLORS}
            format={(v) => topMetric==='qty' ? fmtFull(v) : fmtVnd(v) + '₫'} />
        </div>

        <div className="card card-lg">
          <div className="card-head">
            <div>
              <h3>Đơn hàng gần đây</h3>
              <div className="sub">Cập nhật mới nhất</div>
            </div>
            <button className="chip" style={{padding:'4px 10px', fontSize:11}}>Xem tất cả →</button>
          </div>
          <div style={{margin: '-4px -4px 0', maxHeight: 380, overflowY:'auto'}}>
            <table className="table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Sàn</th>
                  <th>Trạng thái</th>
                  <th className="num">Giá trị</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_orders.slice(0, 14).map((o,i) => (
                  <tr key={i}>
                    <td style={{fontFamily:'JetBrains Mono', fontWeight:600, fontSize:11.5}}>
                      {o.order_id.slice(-8)}
                    </td>
                    <td>
                      <span className={`platform-tag ${o.platform}`}>
                        {o.platform === 'shopee' ? 'Shopee' : o.platform === 'lazada' ? 'Lazada' : 'TikTok'}
                      </span>
                    </td>
                    <td>
                      <span className={`status ${o.status === 'Hoàn thành' ? 'status-done' : 'status-cancel'}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="num">{fmtVnd(o.order_amount)}₫</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}

// ── Page: ORDERS ───────────────────────────────────────────────────────

function PageOrders({ data, mode }) {
  const s = data.summary;
  const dayLabels = getDayLabels(data.revenue_series);
  const ordersByDay = data.revenue_series.map(d => d.orders_total);
  const orderSeries = ['shopee','lazada','tiktok'].map(p => ({
    key: p, name: PLATFORM_NAME[p], color: PLATFORM_COLORS[p],
    data: data.revenue_series.map(d => d['orders_'+p]),
  }));

  // Status breakdown
  const statusData = [
    { key:'completed', name:'Hoàn thành', value: s.completed_orders, color: 'var(--green)' },
    { key:'cancelled', name:'Đã huỷ', value: s.cancelled_orders, color: 'var(--red)' },
    { key:'shipping', name:'Đang giao', value: s.shipping_orders, color: 'var(--blue)' },
  ];

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>
      <div className="row row-4">
        <KPI label="Tổng đơn" value={fmtFull(s.total_orders)} delta={12.3} sub="tháng trước" accent="brand" icon={I.cart}
             spark={ordersByDay} sparkColor="var(--brand-1)"/>
        <KPI label="Hoàn thành" value={fmtFull(s.completed_orders)} delta={9.7} sub={fmtPct(s.completed_orders/s.total_orders*100)+' thành công'} accent="green" icon={I.check}
             spark={data.revenue_series.map(d => Math.round(d.orders_total*0.85))} sparkColor="var(--green)"/>
        <KPI label="Đã huỷ" value={fmtFull(s.cancelled_orders)} delta={-2.1} sub="giảm so kỳ trước" accent="red" icon={I.x}
             spark={data.revenue_series.map(d => Math.round(d.orders_total*0.13))} sparkColor="var(--red)"/>
        <KPI label="Tỷ lệ huỷ" value={fmtPct(s.cancel_rate)} delta={-1.4} sub="mục tiêu < 15%" accent="amber" icon={I.pct} />
      </div>

      <div className="row row-3-1">
        <div className="card card-lg">
          <div className="card-head">
            <div>
              <h3>Xu hướng đơn hàng</h3>
              <div className="sub">Số đơn theo ngày, phân theo sàn</div>
            </div>
            <div className="tabs">
              <button className="tab active">Tất cả</button>
              <button className="tab">Hoàn thành</button>
              <button className="tab">Huỷ</button>
            </div>
          </div>
          {mode === 'bar' ?
            <BarChart series={orderSeries} labels={dayLabels} stacked={true} formatY={fmtFull} height={280} />
            : <AreaChart series={orderSeries} labels={dayLabels} mode={mode} stacked={true} formatY={fmtFull} height={280} />}
        </div>

        <div className="card card-lg">
          <div className="card-head"><h3>Trạng thái đơn hàng</h3></div>
          <div style={{display:'flex', justifyContent:'center'}}>
            <Donut data={statusData} size={200} thickness={26}
              center={<div>
                <div style={{fontSize:11, color:'var(--ink-3)', fontWeight:600}}>Tổng đơn</div>
                <div style={{fontSize:24, fontWeight:800}}>{fmtFull(s.total_orders)}</div>
              </div>} />
          </div>
          <div style={{marginTop:16, display:'flex', flexDirection:'column', gap:8}}>
            {statusData.map(st => (
              <div key={st.key} style={{display:'flex', alignItems:'center', gap:10, padding:'6px 10px', borderRadius:8, background:'var(--surface-2)'}}>
                <span style={{width:10, height:10, borderRadius:3, background:st.color}}/>
                <span style={{flex:1, fontSize:13, fontWeight:600}}>{st.name}</span>
                <span style={{fontWeight:700, fontVariantNumeric:'tabular-nums'}}>{fmtFull(st.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="card card-lg">
        <div className="card-head">
          <div>
            <h3>Khung giờ đặt hàng cao điểm</h3>
            <div className="sub">Heatmap đơn hàng theo thứ trong tuần × giờ trong ngày</div>
          </div>
          <div className="legend">
            <div className="legend-item">
              <span className="legend-swatch" style={{background:'var(--surface-3)'}}/>Thấp
            </div>
            <div className="legend-item">
              <span className="legend-swatch" style={{background:'color-mix(in oklab, var(--brand-1) 50%, var(--surface-3))'}}/>TB
            </div>
            <div className="legend-item">
              <span className="legend-swatch" style={{background:'var(--brand-1)'}}/>Cao
            </div>
          </div>
        </div>
        <Heatmap data={data.heatmap} height={280}/>
        <PeakInsights heatmap={data.heatmap} />
      </div>

    </div>
  );
}

function PeakInsights({ heatmap }) {
  const rows = Array.isArray(heatmap) ? heatmap : [];
  const total = rows.reduce((a,b)=>a+(b?.orders||0),0);
  const sorted = [...rows].sort((a,b)=>(b?.orders||0)-(a?.orders||0));
  const peak = sorted[0] || { weekday: 0, hour: 0, orders: 0 };
  const lowHours = rows.filter(h=>(h?.orders||0)===0).length;
  const WD = ['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];
  return (
    <div className="stat-grid" style={{marginTop:14, gridTemplateColumns:'repeat(3, 1fr)'}}>
      <div className="cell">
        <div className="l">Giờ vàng</div>
        <div className="v">{WD[peak.weekday] || '—'} · {String(peak.hour).padStart(2,'0')}:00</div>
        <div style={{fontSize:11, color:'var(--ink-3)', marginTop:4}}>{peak.orders} đơn{total>0 ? ` — ${(peak.orders/total*100).toFixed(1)}% tổng tháng` : ''}</div>
      </div>
      <div className="cell">
        <div className="l">Khung giờ chết</div>
        <div className="v">{lowHours} giờ / tuần</div>
        <div style={{fontSize:11, color:'var(--ink-3)', marginTop:4}}>Không có đơn nào — chủ yếu 02–05h sáng</div>
      </div>
      <div className="cell">
        <div className="l">Trung bình giờ</div>
        <div className="v">{(total/168).toFixed(1)} đơn</div>
        <div style={{fontSize:11, color:'var(--ink-3)', marginTop:4}}>Trên 7×24 = 168 khung giờ</div>
      </div>
    </div>
  );
}

// ── Page: PRODUCTS ─────────────────────────────────────────────────────

function PageProducts({ data }) {
  const totalSKUs = data.top_products_qty.length + 20; // mock
  const totalQty = data.top_products_qty.reduce((a,b)=>a+b.qty, 0);
  const totalRev = data.top_products_rev.reduce((a,b)=>a+b.revenue, 0);
  const topProduct = data.top_products_rev[0];

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>

      <div className="row row-4">
        <KPI label="Số SKU đang bán" value={fmtFull(totalSKUs)} sub="Tất cả 3 sàn" accent="brand" icon={I.pkg}/>
        <KPI label="Số lượng đã bán" value={fmtFull(totalQty)} delta={14.2} sub="tổng top 10" accent="green" icon={I.cart}/>
        <KPI label="Doanh thu top 10" value={fmtVnd(totalRev)+'₫'} delta={11.5} sub={fmtPct(totalRev/243769463*100,0)+" tổng DT"} accent="amber" icon={I.money}/>
        <KPI label="Sản phẩm bán chạy nhất" value={topProduct.qty + ' bán'} sub={topProduct.name.slice(0,28)+'...'} accent="shopee" icon={I.trend}/>
      </div>

      <div className="row row-2">
        <div className="card card-lg">
          <div className="card-head">
            <div>
              <h3>Top theo doanh thu</h3>
              <div className="sub">10 sản phẩm doanh thu cao nhất</div>
            </div>
          </div>
          <RankedBars items={data.top_products_rev} valueKey="revenue" labelKey="name"
                      colors={PLATFORM_COLORS} format={(v)=>fmtVnd(v)+'₫'} maxItems={10}/>
        </div>
        <div className="card card-lg">
          <div className="card-head">
            <div>
              <h3>Top theo số lượng</h3>
              <div className="sub">10 sản phẩm bán nhiều nhất</div>
            </div>
          </div>
          <RankedBars items={data.top_products_qty} valueKey="qty" labelKey="name"
                      colors={PLATFORM_COLORS} format={(v)=>fmtFull(v)+' sp'} maxItems={10}/>
        </div>
      </div>

      {/* Treemap-style block */}
      <div className="card card-lg">
        <div className="card-head">
          <div>
            <h3>Phân bố doanh thu theo sản phẩm</h3>
            <div className="sub">Kích thước thể hiện tỷ trọng doanh thu</div>
          </div>
        </div>
        <Treemap items={data.top_products_rev.slice(0, 9)} />
      </div>
    </div>
  );
}

function Treemap({ items }) {
  // Simple squarified layout for 9 items in a 3-column grid with varying heights
  const total = items.reduce((a,b)=>a+b.revenue, 0);
  // Sort & split into rows of varying sizes
  const sorted = [...items].sort((a,b)=>b.revenue-a.revenue);
  const r1 = sorted.slice(0, 2);  // 2 big
  const r2 = sorted.slice(2, 5);  // 3 mid
  const r3 = sorted.slice(5, 9);  // 4 small
  const r1Total = r1.reduce((a,b)=>a+b.revenue,0);
  const r2Total = r2.reduce((a,b)=>a+b.revenue,0);
  const r3Total = r3.reduce((a,b)=>a+b.revenue,0);
  const grandTotal = r1Total + r2Total + r3Total;
  const h1 = Math.max(28, (r1Total/grandTotal)*340);
  const h2 = Math.max(28, (r2Total/grandTotal)*340);
  const h3 = Math.max(28, (r3Total/grandTotal)*340);

  const cell = (it, row, total, h) => {
    const pct = (it.revenue/total)*100;
    const color = PLATFORM_COLORS[it.platform];
    return (
      <div key={it.sku} style={{
        flex: it.revenue,
        minWidth: 60,
        background: `linear-gradient(135deg, ${color}, ${color}aa)`,
        borderRadius: 12,
        padding: 14,
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        minHeight: h,
        cursor: 'pointer',
        transition: 'transform 0.2s',
      }}
      onMouseEnter={(e)=>e.currentTarget.style.transform='scale(1.01)'}
      onMouseLeave={(e)=>e.currentTarget.style.transform='scale(1)'}>
        <div style={{fontSize: h > 100 ? 12.5 : 11, fontWeight: 600, lineHeight: 1.3,
                     opacity: 0.95, whiteSpace: 'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
          {it.name.slice(0, 32) + (it.name.length>32?'…':'')}
        </div>
        <div>
          <div style={{fontSize: h > 100 ? 22 : 16, fontWeight: 800, letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums'}}>
            {fmtVnd(it.revenue)}₫
          </div>
          <div style={{fontSize: 10.5, opacity: 0.85, fontWeight: 600, marginTop:2}}>
            {(it.revenue/grandTotal*100).toFixed(1)}% · {it.qty} sản phẩm
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{display:'flex', flexDirection:'column', gap:6}}>
      <div style={{display:'flex', gap:6}}>{r1.map(it => cell(it, r1, r1Total, h1))}</div>
      <div style={{display:'flex', gap:6}}>{r2.map(it => cell(it, r2, r2Total, h2))}</div>
      <div style={{display:'flex', gap:6}}>{r3.map(it => cell(it, r3, r3Total, h3))}</div>
    </div>
  );
}

// ── Page: CUSTOMERS ────────────────────────────────────────────────────

function PageCustomers({ data }) {
  const s = data.summary;
  const cities = data.city_distribution
    .filter(c => !c.city.startsWith('P*') && c.city.length > 2)
    .slice(0, 8);
  const totalCustomers = cities.reduce((a,b)=>a+b.orders, 0);
  const aov = Math.round(s.total_revenue / s.completed_orders);

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>
      <div className="row row-4">
        <KPI label="Tổng khách hàng" value={fmtFull(s.total_visitors)} delta={7.1} sub="lượt mua cá nhân" accent="brand" icon={I.user}/>
        <KPI label="Đơn TB/khách" value={(s.total_orders/totalCustomers).toFixed(2)} delta={3.2} sub="số đơn/người" accent="green" icon={I.cart}/>
        <KPI label="AOV" value={fmtVnd(aov)+'₫'} delta={5.4} sub="Giá trị đơn TB" accent="amber" icon={I.money}/>
        <KPI label="Thị trường chính" value="Hà Nội" delta={null} sub={`${cities[0].orders} đơn — ${(cities[0].orders/totalCustomers*100).toFixed(0)}% tổng đơn`} accent="shopee" icon={I.pin}/>
      </div>

      <div className="row row-2">
        <div className="card card-lg">
          <div className="card-head">
            <div>
              <h3>Phân bố khách theo tỉnh / thành phố</h3>
              <div className="sub">Top khu vực có nhiều đơn nhất</div>
            </div>
          </div>
          <RankedBars items={cities} valueKey="orders" labelKey="city"
                      accent="var(--brand-1)" format={(v)=>fmtFull(v)+' đơn'} maxItems={8}/>
        </div>

        <div className="card card-lg">
          <div className="card-head">
            <div>
              <h3>Tập trung địa lý</h3>
              <div className="sub">Hà Nội & TP.HCM dẫn dắt doanh số</div>
            </div>
          </div>
          <VnConcentration cities={cities} totalCustomers={totalCustomers}/>
        </div>
      </div>

      <div className="row row-3">
        <div className="card">
          <div className="card-head"><h3>Khách quay lại</h3></div>
          <div style={{display:'flex', justifyContent:'center'}}>
            <Dial value={34.2} max={100} color="var(--green)" label="trên tổng khách hàng"/>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Tăng trưởng khách mới</h3></div>
          <div style={{display:'flex', justifyContent:'center'}}>
            <Dial value={28.7} max={50} color="var(--brand-1)" label="vs tháng trước"/>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Hài lòng</h3></div>
          <div style={{display:'flex', justifyContent:'center'}}>
            <Dial value={86.4} max={100} color="var(--accent)" label="dự đoán NPS" format={(v)=>v.toFixed(1)+'%'}/>
          </div>
        </div>
      </div>
    </div>
  );
}

function VnConcentration({ cities, totalCustomers }) {
  const hanoi = cities.find(c => c.city.toLowerCase().includes('hà nội'))?.orders || 0;
  const hcm = cities.find(c => c.city.toLowerCase().includes('chí minh'))?.orders || 0;
  const other = totalCustomers - hanoi - hcm;
  return (
    <div style={{display:'flex', flexDirection:'column', gap:14}}>
      {[
        { name: 'Hà Nội', value: hanoi, color: PLATFORM_COLORS.shopee, role: 'Thị trường #1' },
        { name: 'TP. Hồ Chí Minh', value: hcm, color: PLATFORM_COLORS.lazada, role: 'Thị trường #2' },
        { name: 'Tỉnh khác', value: other, color: 'var(--ink-3)', role: 'Phân tán' },
      ].map(r => {
        const pct = r.value/totalCustomers*100;
        return (
          <div key={r.name}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:6}}>
              <div>
                <div style={{fontSize:13, fontWeight:700}}>{r.name}</div>
                <div style={{fontSize:11, color:'var(--ink-3)', fontWeight:500}}>{r.role}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontWeight:800, fontSize:18, letterSpacing:'-0.02em'}}>{fmtFull(r.value)}</div>
                <div style={{fontSize:11, color:'var(--ink-3)', fontWeight:600}}>{pct.toFixed(1)}%</div>
              </div>
            </div>
            <div style={{height:8, borderRadius:99, background:'var(--surface-3)', overflow:'hidden'}}>
              <div style={{height:'100%', width: pct+'%', background:r.color, borderRadius:99, transition:'width 0.8s'}} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page: TRAFFIC ──────────────────────────────────────────────────────

function PageTraffic({ data, mode }) {
  const s = data.summary;
  // Aggregate traffic by date across platforms
  const byDate = {};
  for (const t of data.traffic) {
    if (!byDate[t.date]) byDate[t.date] = { date: t.date, pv: 0, vis: 0, shopee_pv: 0, lazada_pv: 0, tiktok_pv: 0 };
    byDate[t.date].pv += t.page_views;
    byDate[t.date].vis += t.visitors;
    byDate[t.date][t.platform+'_pv'] = t.page_views;
  }
  // Shopee traffic isn't in JSON's traffic array — derive zeros if missing
  const dates = Object.keys(byDate).sort();
  const dayLabels = dates.map(d => d.slice(-2));
  const trafficSeries = ['lazada','tiktok'].map(p => ({
    key: p, name: PLATFORM_NAME[p], color: PLATFORM_COLORS[p],
    data: dates.map(d => byDate[d][p+'_pv'] || 0),
  }));

  const conversionRate = (s.total_orders/s.total_visitors*100);

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>
      <div className="row row-4">
        <KPI label="Tổng lượt xem" value={fmtFull(s.total_page_views)} delta={6.8} sub="page views" accent="brand" icon={I.eye}
             spark={dates.map(d=>byDate[d].pv)} sparkColor="var(--brand-1)"/>
        <KPI label="Lượt truy cập" value={fmtFull(s.total_visitors)} delta={4.2} sub="unique visitors" accent="amber" icon={I.user}
             spark={dates.map(d=>byDate[d].vis)} sparkColor="var(--amber)"/>
        <KPI label="PV / Visitor" value={(s.total_page_views/s.total_visitors).toFixed(2)} delta={2.1} sub="trang/khách" accent="green" icon={I.trend}/>
        <KPI label="Tỷ lệ chuyển đổi" value={fmtPct(conversionRate)} delta={1.8} sub="visitor → đơn" accent="shopee" icon={I.pct}/>
      </div>

      <div className="card card-lg">
        <div className="card-head">
          <div>
            <h3>Lượt xem & lượt truy cập theo ngày</h3>
            <div className="sub">Tháng 03/2026 · Lazada & TikTok Shop</div>
          </div>
        </div>
        <AreaChart series={trafficSeries} labels={dayLabels} mode={mode} stacked={false} formatY={fmtFull} height={280}/>
      </div>

      <div className="row row-2">
        <div className="card card-lg">
          <div className="card-head">
            <div>
              <h3>Doanh thu vs Lượt xem</h3>
              <div className="sub">Mối tương quan PV → conversion</div>
            </div>
          </div>
          <DualAxis dates={dates} byDate={byDate} revenue={data.revenue_series}/>
        </div>
        <div className="card card-lg">
          <div className="card-head">
            <div>
              <h3>Hiệu suất theo sàn</h3>
              <div className="sub">PV, Visitors, Đơn hàng, Conversion</div>
            </div>
          </div>
          <PlatformPerformanceTable byDate={byDate} dates={dates} data={data}/>
        </div>
      </div>
    </div>
  );
}

function DualAxis({ dates, byDate, revenue }) {
  // Simpler: side-by-side bar (revenue) + line (PV)
  const dayLabels = dates.map(d=>d.slice(-2));
  const series = [
    { key: 'rev', name: 'Doanh thu', color: 'var(--brand-1)', data: revenue.map(r=>r.total) },
  ];
  return <BarChart series={series} labels={dayLabels} formatY={fmtVnd} height={260}/>;
}

function PlatformPerformanceTable({ byDate, dates, data }) {
  const platforms = ['shopee','lazada','tiktok'];
  const rows = platforms.map(p => {
    const pv = dates.reduce((a,d)=>a + (byDate[d][p+'_pv']||0), 0);
    const vis = data.traffic.filter(t=>t.platform===p).reduce((a,t)=>a+t.visitors, 0);
    const orders = data.summary[p].orders;
    const conv = vis ? (orders/vis*100) : 0;
    return { p, pv, vis, orders, conv };
  });
  return (
    <table className="table" style={{margin:'-4px'}}>
      <thead>
        <tr>
          <th>Sàn</th>
          <th className="num">Lượt xem</th>
          <th className="num">Visitors</th>
          <th className="num">Đơn</th>
          <th className="num">Conversion</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.p}>
            <td><span className={`platform-tag ${r.p}`}>{PLATFORM_NAME[r.p]}</span></td>
            <td className="num">{fmtFull(r.pv) || '—'}</td>
            <td className="num">{fmtFull(r.vis) || '—'}</td>
            <td className="num">{fmtFull(r.orders)}</td>
            <td className="num">
              <span style={{
                color: r.conv > 5 ? 'var(--green)' : r.conv > 1 ? 'var(--amber)' : 'var(--red)',
                fontWeight: 700,
              }}>{r.conv ? r.conv.toFixed(2)+'%' : '—'}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Page: COMPARISON ───────────────────────────────────────────────────

function PageComparison({ data }) {
  const s = data.summary;
  const platforms = ['shopee','lazada','tiktok'];

  // Normalize to 100 max for radar
  const platformMetrics = platforms.map(p => {
    const sp = s[p];
    const aov = sp.completed ? Math.round(sp.revenue/sp.completed) : 0;
    const cancelRate = sp.orders ? (sp.cancelled/sp.orders*100) : 0;
    const completionRate = sp.orders ? (sp.completed/sp.orders*100) : 0;
    return { p, sp, aov, cancelRate, completionRate };
  });

  const maxOrders = Math.max(...platformMetrics.map(m=>m.sp.orders));
  const maxRev = Math.max(...platformMetrics.map(m=>m.sp.revenue));
  const maxAov = Math.max(...platformMetrics.map(m=>m.aov));

  const radarSeries = platformMetrics.map(m => ({
    name: PLATFORM_NAME[m.p],
    color: PLATFORM_COLORS[m.p],
    values: [
      m.sp.orders / maxOrders * 100,
      m.sp.revenue / maxRev * 100,
      m.aov / (maxAov||1) * 100,
      m.completionRate,
      Math.max(0, 100 - m.cancelRate * 4),
      (m.sp.completed/maxOrders)*100,
    ],
  }));

  const radarAxes = [
    { name: 'Số đơn', max: 100 },
    { name: 'Doanh thu', max: 100 },
    { name: 'AOV', max: 100 },
    { name: 'Hoàn thành', max: 100 },
    { name: 'Tin cậy', max: 100 },
    { name: 'Khối lượng', max: 100 },
  ];

  // Grouped bar: revenue
  const groupedRev = {
    series: [{
      key: 'rev', name: 'Doanh thu', color: 'var(--brand-1)',
      data: platforms.map(p => s[p].revenue),
    }],
    labels: platforms.map(p => PLATFORM_NAME[p]),
  };
  const groupedOrders = {
    series: [
      { key:'completed', name:'Hoàn thành', color:'var(--green)', data: platforms.map(p=>s[p].completed) },
      { key:'cancelled', name:'Đã huỷ', color:'var(--red)', data: platforms.map(p=>s[p].cancelled||0) },
    ],
    labels: platforms.map(p => PLATFORM_NAME[p]),
  };

  return (
    <div className="page" style={{display:'flex', flexDirection:'column', gap:'var(--gap-card)'}}>

      <div className="row row-3">
        {platforms.map(p => {
          const sp = s[p];
          const aov = sp.completed ? Math.round(sp.revenue/sp.completed) : 0;
          return (
            <div key={p} className="card card-lg" style={{
              borderTop: `4px solid ${PLATFORM_COLORS[p]}`,
              padding: 20,
            }}>
              <div style={{display:'flex', alignItems:'center', gap:12, marginBottom: 12}}>
                <div className={`plat-tile plat-${p}`} style={{padding:0, background:'transparent', border:'none'}}>
                  <div className="logo" style={{width:42, height:42, fontSize:16}}>
                    {p==='shopee'?'S':p==='lazada'?'L':'T'}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:15, fontWeight:800}}>{PLATFORM_NAME[p]}</div>
                  <div style={{fontSize:11.5, color:'var(--ink-3)'}}>{sp.orders} đơn · {((sp.orders/s.total_orders)*100).toFixed(1)}% tổng</div>
                </div>
              </div>
              <div className="stat-grid" style={{gridTemplateColumns:'repeat(2,1fr)'}}>
                <div className="cell">
                  <div className="l">Doanh thu</div>
                  <div className="v">{fmtVnd(sp.revenue)}₫</div>
                </div>
                <div className="cell">
                  <div className="l">AOV</div>
                  <div className="v">{fmtVnd(aov)}₫</div>
                </div>
                <div className="cell">
                  <div className="l">Tỷ lệ hoàn thành</div>
                  <div className="v" style={{color:'var(--green)'}}>{((sp.completed/sp.orders)*100).toFixed(1)}%</div>
                </div>
                <div className="cell">
                  <div className="l">Tỷ lệ huỷ</div>
                  <div className="v" style={{color:'var(--red)'}}>{((sp.cancelled||0)/sp.orders*100).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="row row-2">
        <div className="card card-lg" style={{display:'flex', flexDirection:'column'}}>
          <div className="card-head">
            <div>
              <h3>Radar 6 chỉ số</h3>
              <div className="sub">So sánh đa chiều giữa 3 sàn</div>
            </div>
          </div>
          <div style={{display:'flex', justifyContent:'center', alignItems:'center', flex:1}}>
            <Radar series={radarSeries} axes={radarAxes} size={320} max={100}/>
          </div>
          <div className="legend" style={{justifyContent:'center', marginTop:8}}>
            {radarSeries.map(s => (
              <div key={s.name} className="legend-item">
                <span className="legend-swatch" style={{background:s.color}}/>{s.name}
              </div>
            ))}
          </div>
        </div>

        <div className="card card-lg">
          <div className="card-head">
            <div>
              <h3>Hoàn thành vs Đã huỷ</h3>
              <div className="sub">Số đơn theo trạng thái, mỗi sàn</div>
            </div>
          </div>
          <BarChart series={groupedOrders.series} labels={groupedOrders.labels} stacked={false} formatY={fmtFull} height={300}/>
        </div>
      </div>

      <div className="card card-lg">
        <div className="card-head">
          <div>
            <h3>Sản phẩm bán chạy theo sàn</h3>
            <div className="sub">Top 3 SKU mỗi sàn theo doanh thu</div>
          </div>
        </div>
        <div className="row row-3">
          {platforms.map(p => {
            const top = data.top_products_rev.filter(t=>t.platform===p).slice(0,3);
            return (
              <div key={p} style={{
                background:'var(--surface-2)', borderRadius:14, padding:16,
                borderLeft: `3px solid ${PLATFORM_COLORS[p]}`,
              }}>
                <div style={{fontSize:12, color:'var(--ink-3)', fontWeight:700, marginBottom:10, textTransform:'uppercase', letterSpacing:'0.06em'}}>
                  {PLATFORM_NAME[p]}
                </div>
                {top.length ? top.map((t,i) => (
                  <div key={i} style={{padding:'8px 0', borderBottom:i<top.length-1?'1px solid var(--line-2)':'none'}}>
                    <div style={{fontSize:12.5, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                      {t.name}
                    </div>
                    <div style={{display:'flex', justifyContent:'space-between', marginTop:4, fontSize:11.5, color:'var(--ink-3)'}}>
                      <span>{t.qty} đã bán</span>
                      <span style={{fontWeight:700, color:'var(--ink)', fontVariantNumeric:'tabular-nums'}}>{fmtVnd(t.revenue)}₫</span>
                    </div>
                  </div>
                )) : <div style={{color:'var(--ink-3)', fontSize:12, fontStyle:'italic'}}>Chưa có dữ liệu</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Expose
Object.assign(window, {
  PageOverview, PageOrders, PageProducts, PageCustomers, PageTraffic, PageComparison,
  PageHeader, KPI, I,
});
